import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.help_store import help_store
from app.services.storage import store

client = TestClient(app)


class TestPhase6VoiceEmergency(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.orig_runs_dir = store.dir
        self.orig_help_base = help_store._base
        self.run_id = "run_emergency_test"
        self.token = "pat_emergency_test"

        # Create isolated run dir
        self.run_path = Path(self.tmp_dir) / self.run_id
        self.run_path.mkdir(parents=True, exist_ok=True)
        store.dir = lambda r: Path(self.tmp_dir) / r

        # Create isolated help dir
        self.help_dir = Path(self.tmp_dir) / "help"
        self.help_dir.mkdir(parents=True, exist_ok=True)
        help_store._base = self.help_dir

        # Register patient token mapping
        store.register_patient_token(self.token, self.run_id)

        # Write run metadata
        meta = {
            "run_id": self.run_id,
            "patient_token": self.token,
            "approved": True,
            "patient": {
                "name": "Sunita Verma",
                "language": "hi",
                "phone": "+91 98765 12345",
                "guardian_name": "Amit Verma",
                "guardian_phone": "+91 98765 67890",
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        store.write(self.run_id, "meta.json", meta)

    def tearDown(self):
        help_store._base = self.orig_help_base
        store.dir = self.orig_runs_dir
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_help_request_creation_resolves_patient_token(self):
        # Patient calls emergency via patient token
        res = client.post(
            "/help",
            json={
                "token": self.token,
                "heard": "saans nahi le pa raha hoon, help me",
                "severity": "critical",
                "label": "trouble breathing",
                "source": "voice",
                "client_id": "cid_test_01",
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertFalse(data["duplicate"])
        item = data["item"]
        self.assertEqual(item["run_id"], self.run_id)
        self.assertEqual(item["patient_name"], "Sunita Verma")
        self.assertEqual(item["patient"]["language"], "hi")
        self.assertEqual(item["severity"], "critical")
        self.assertEqual(item["sla_seconds"], 120)
        self.assertEqual(item["status"], "open")

        # Verify audit record on run
        audit_file = store.dir(self.run_id) / "audit.jsonl"
        self.assertTrue(audit_file.exists())
        lines = [json.loads(l) for l in audit_file.read_text(encoding="utf-8").strip().split("\n")]
        self.assertTrue(any(l.get("action") == "help_requested" and l.get("severity") == "critical" for l in lines))

    def test_help_request_deduplication(self):
        # First send
        res1 = client.post(
            "/help",
            json={
                "token": self.token,
                "heard": "I fell down and can't get up",
                "severity": "critical",
                "label": "fall",
                "source": "voice",
                "client_id": "cid_dup_test",
            },
        )
        self.assertEqual(res1.status_code, 201)
        data1 = res1.json()
        self.assertFalse(data1["duplicate"])

        # Second send with same client_id
        res2 = client.post(
            "/help",
            json={
                "token": self.token,
                "heard": "I fell down and can't get up",
                "severity": "critical",
                "label": "fall",
                "source": "voice",
                "client_id": "cid_dup_test",
            },
        )
        self.assertEqual(res2.status_code, 201)
        data2 = res2.json()
        self.assertTrue(data2["duplicate"])
        self.assertEqual(data1["id"], data2["id"])

    def test_help_action_workflow_with_caregiver_call(self):
        # Create request
        res = client.post(
            "/help",
            json={
                "token": self.token,
                "heard": "I feel very dizzy and weak",
                "severity": "concern",
                "label": "dizzy",
                "source": "voice",
                "client_id": "cid_caregiver_test",
            },
        )
        self.assertEqual(res.status_code, 201)
        help_id = res.json()["id"]

        # 1. Staff calls caregiver
        res_call = client.post(
            f"/help/{help_id}/action",
            json={
                "action": "call",
                "by": "Nurse Priya",
                "target": "caregiver",
                "note": "Calling primary caregiver Amit",
            },
        )
        self.assertEqual(res_call.status_code, 200)
        item = res_call.json()
        self.assertEqual(item["calls"], 1)
        self.assertEqual(item["status"], "acknowledged")
        self.assertEqual(item["acknowledged_by"], "Nurse Priya")

        # 2. Staff escalates to doctor
        res_esc = client.post(
            f"/help/{help_id}/action",
            json={
                "action": "escalate",
                "by": "Nurse Priya",
                "note": "Caregiver reports persistent orthostatic symptoms",
            },
        )
        self.assertEqual(res_esc.status_code, 200)
        item = res_esc.json()
        self.assertEqual(item["status"], "escalated")
        self.assertEqual(item["escalated_by"], "Nurse Priya")

        # 3. Clinician resolves
        res_res = client.post(
            f"/help/{help_id}/action",
            json={
                "action": "resolve",
                "by": "Dr. Mehta",
                "resolution": "visit",
                "note": "Arranged home-care nurse visit within 2 hours",
            },
        )
        self.assertEqual(res_res.status_code, 200)
        item = res_res.json()
        self.assertEqual(item["status"], "resolved")
        self.assertEqual(item["resolution"], "visit")

        # Verify audit events on run
        audit_file = store.dir(self.run_id) / "audit.jsonl"
        lines = [json.loads(l) for l in audit_file.read_text(encoding="utf-8").strip().split("\n")]
        actions = [l.get("action") for l in lines]
        self.assertIn("help_call", actions)
        self.assertIn("help_escalate", actions)
        self.assertIn("help_resolve", actions)


if __name__ == "__main__":
    unittest.main()
