"""Unit and integration tests for Phase 8: Operational Hardening, Auditing & Packaging."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import RunStore, scrub_sensitive_data
from scripts.verify_audit import verify_all_audit_logs, verify_audit_record


class TestPhase8Hardening(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_dir = tempfile.mkdtemp()
        self.store = RunStore()

    def test_security_headers_present(self):
        """Responses must include healthcare-compliant security headers."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(res.headers.get("x-frame-options"), "DENY")
        self.assertEqual(res.headers.get("x-xss-protection"), "1; mode=block")
        self.assertEqual(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin")
        self.assertIn("max-age=31536000", res.headers.get("strict-transport-security", ""))

    def test_request_id_correlation(self):
        """X-Request-ID must be generated or propagated on every response."""
        # Generated when omitted
        res1 = self.client.get("/health")
        req_id1 = res1.headers.get("x-request-id")
        self.assertTrue(req_id1 and len(req_id1) > 10)

        # Propagated when supplied by client
        custom_id = "test-corr-id-998877"
        res2 = self.client.get("/health", headers={"X-Request-ID": custom_id})
        self.assertEqual(res2.headers.get("x-request-id"), custom_id)

    def test_process_time_header(self):
        """X-Process-Time must measure response latency."""
        res = self.client.get("/health")
        p_time = res.headers.get("x-process-time")
        self.assertTrue(p_time and p_time.endswith("ms"))

    def test_health_probe(self):
        """GET /health must return status ok."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_ready_probe(self):
        """GET /ready must return status ready and verify storage."""
        res = self.client.get("/ready")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["storage"], "accessible")
        self.assertTrue("timestamp" in data)

    def test_system_metrics_endpoint(self):
        """GET /system/metrics returns operational counts without PII."""
        res = self.client.get("/system/metrics")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "operational")
        self.assertEqual(data["service"], "RecoverRight API")
        self.assertIn("runs", data)
        self.assertIn("total", data["runs"])
        self.assertIn("approved", data["runs"])
        self.assertIn("help_requests", data)

    def test_unhandled_exception_sanitization(self):
        """Uncaught exceptions must return 500 without leaking stack traces."""
        client = TestClient(app, raise_server_exceptions=False)
        with patch("app.main.store.list_runs", side_effect=RuntimeError("Database connection string leaked: postgres://user:secret@db")):
            res = client.get("/system/metrics")
            self.assertEqual(res.status_code, 500)
            data = res.json()
            self.assertEqual(data["error"], "InternalServerError")
            # Internal traceback and error message must not be exposed to caller
            self.assertNotIn("postgres://", json.dumps(data))
            self.assertIn("request_id", data)
            self.assertEqual(res.headers.get("x-request-id"), data["request_id"])

    def test_storage_audit_scrubbing(self):
        """RunStore.audit must redact passwords, API keys, and sensitive tokens."""
        run_id = "run_audit_scrub_test"
        with patch.object(self.store, "dir", return_value=Path(self.test_dir)):
            self.store.audit(
                run_id=run_id,
                actor="test_user",
                action="test.action",
                api_key="gsk_abcdef1234567890abcdef1234567890",
                password="super_secret_password",
                nested={"secret_token": "bearer xyz12345678901234567890"},
                regular_attr="safe_value",
            )

            audit_file = Path(self.test_dir) / "audit.jsonl"
            self.assertTrue(audit_file.exists())
            lines = audit_file.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 1)

            record = json.loads(lines[0])
            self.assertEqual(record["actor"], "test_user")
            self.assertEqual(record["action"], "test.action")
            self.assertEqual(record["regular_attr"], "safe_value")

            # Sensitive fields must be redacted
            self.assertEqual(record["api_key"], "[REDACTED]")
            self.assertEqual(record["password"], "[REDACTED]")
            self.assertEqual(record["nested"]["secret_token"], "[REDACTED]")

            # Raw secret must not appear anywhere in the written line
            self.assertNotIn("gsk_abcdef", lines[0])
            self.assertNotIn("super_secret_password", lines[0])

    def test_verify_audit_record_validator(self):
        """verify_audit_record accurately catches corrupt lines and leaked secrets."""
        dummy_path = Path("dummy.jsonl")

        # Valid record
        valid_line = json.dumps({"ts": "2026-10-23T00:00:00+00:00", "actor": "nurse", "action": "approved"})
        ok, msg, data = verify_audit_record(valid_line, 1, dummy_path)
        self.assertTrue(ok)

        # Missing required field
        bad_line1 = json.dumps({"actor": "nurse", "action": "approved"})
        ok, msg, _ = verify_audit_record(bad_line1, 2, dummy_path)
        self.assertFalse(ok)
        self.assertIn("Missing required field 'ts'", msg)

        # Invalid timestamp
        bad_line2 = json.dumps({"ts": "invalid-date", "actor": "nurse", "action": "approved"})
        ok, msg, _ = verify_audit_record(bad_line2, 3, dummy_path)
        self.assertFalse(ok)
        self.assertIn("Invalid ISO-8601 timestamp", msg)

        # Leaked Groq key in text
        leaked_line = json.dumps({
            "ts": "2026-10-23T00:00:00+00:00",
            "actor": "nurse",
            "action": "approved",
            "payload": "key is gsk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        })
        ok, msg, _ = verify_audit_record(leaked_line, 4, dummy_path)
        self.assertFalse(ok)
        self.assertIn("Secret or API key pattern detected", msg)

    def test_verify_all_audit_logs_passes(self):
        """Current repository audit trails must pass compliance verification."""
        ok, summary = verify_all_audit_logs()
        self.assertTrue(ok, f"Audit logs failed verification: {summary.get('errors')}")
        self.assertGreaterEqual(summary["files_count"], 1)
        self.assertGreaterEqual(summary["total_records"], 10)


if __name__ == "__main__":
    unittest.main()
