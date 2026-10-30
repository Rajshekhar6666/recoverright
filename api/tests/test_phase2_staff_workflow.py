"""Tests for RecoverRight Phase 2: Staff Discharge-to-Approval Workflow."""
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import store


class TestPhase2StaffWorkflow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.orig_runs_dir = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)

    def tearDown(self):
        if self.orig_runs_dir:
            os.environ["RR_RUNS_DIR"] = self.orig_runs_dir
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()

    def _setup_review_run(self, run_id: str) -> str:
        pat_token = f"pat_{run_id}"
        d = store.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "run_id": run_id,
            "patient_token": pat_token,
            "status": "needs_review",
            "approved": False,
            "filename": "discharge_knee.pdf",
            "stored_name": "source.pdf",
            "patient": {
                "name": "Rohan Gupta",
                "phone": "+919876543210",
                "language": "en",
                "patient_token": pat_token,
            },
            "counts": {"agreed": 1, "review": 0, "conflict": 0, "rejected": 0},
            "current_version": 1,
        }
        store.write(run_id, "meta.json", meta)
        store.register_patient_token(pat_token, run_id)
        # Agreed non-critical fields covering all required categories (no blockers)
        items = [
            {
                "field": {
                    "field_id": "m1",
                    "category": "medications",
                    "status": "agreed",
                    "critical": False,
                    "proposed": {"name": "Paracetamol", "dose": "500 mg", "frequency": "Twice daily"},
                    "block_id": "b1",
                    "quote": "Paracetamol 500mg BD",
                    "units": ["u1"],
                    "voters": ["A", "B"],
                    "opinions": [],
                    "issues": [],
                },
                "decision": None,
            },
            {
                "field": {
                    "field_id": "fu1",
                    "category": "follow_ups",
                    "status": "agreed",
                    "critical": False,
                    "proposed": {"what": "Checkup", "when": "in 1 week"},
                    "block_id": "b2",
                    "quote": "Follow up in 1 week",
                    "units": ["u2"],
                    "voters": ["A", "B"],
                    "opinions": [],
                    "issues": [],
                },
                "decision": None,
            },
            {
                "field": {
                    "field_id": "ws1",
                    "category": "warning_signs",
                    "status": "agreed",
                    "critical": False,
                    "proposed": {"text": "High fever"},
                    "block_id": "b3",
                    "quote": "Call if fever",
                    "units": ["u3"],
                    "voters": ["A", "B"],
                    "opinions": [],
                    "issues": [],
                },
                "decision": None,
            },
            {
                "field": {
                    "field_id": "c1",
                    "category": "contacts",
                    "status": "agreed",
                    "critical": False,
                    "proposed": {"label": "Helpline", "value": "108"},
                    "block_id": "b4",
                    "quote": "Helpline 108",
                    "units": ["u4"],
                    "voters": ["A", "B"],
                    "opinions": [],
                    "issues": [],
                },
                "decision": None,
            },
        ]
        store.write(run_id, "review.json", items)
        return pat_token

    def test_pipeline_retry_on_failure(self):
        """Recoverable error state: a failed run can be retried by staff."""
        run_id = "run_failed_test"
        d = store.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        (d / "source.pdf").write_bytes(b"%PDF-1.4 test")
        meta = {
            "run_id": run_id,
            "status": "failed",
            "error": "Groq LLM rate limit exceeded (503)",
            "filename": "discharge_knee.pdf",
            "stored_name": "source.pdf",
            "approved": False,
            "patient": {"name": "Test"},
        }
        store.write(run_id, "meta.json", meta)

        async def fake_run_pipeline(rid, use_cache=False):
            pass

        with patch("app.pipeline.orchestrator.run_pipeline", fake_run_pipeline):
            resp = self.client.post(f"/runs/{run_id}/retry")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["status"], "queued")

            # Verify status in store
            updated_meta = store.read(run_id, "meta.json")
            self.assertEqual(updated_meta["status"], "queued")
            self.assertIsNone(updated_meta.get("error"))

    def test_retry_refused_on_approved_plan(self):
        """Clinical safety: an approved plan cannot be silently re-run/overwritten."""
        run_id = "run_approved_locked"
        d = store.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {"run_id": run_id, "status": "approved", "approved": True}
        store.write(run_id, "meta.json", meta)

        resp = self.client.post(f"/runs/{run_id}/retry")
        self.assertEqual(resp.status_code, 409)

    def test_clinician_identity_and_role_validation(self):
        """Clinical safety: empty staff credentials block approval."""
        run_id = "run_auth_test"
        self._setup_review_run(run_id)

        # Empty identity
        bad_resp = self.client.post(f"/runs/{run_id}/approve", json={"by": "   ", "role": "Nurse"})
        self.assertEqual(bad_resp.status_code, 422)

        # Valid approval with role and note
        ok_resp = self.client.post(
            f"/runs/{run_id}/approve",
            json={"by": "Anita Singh", "role": "Registered Nurse", "note": "Reconciliation verified"},
        )
        self.assertEqual(ok_resp.status_code, 200)
        plan = ok_resp.json()
        self.assertEqual(plan["version"], 1)
        self.assertIn("Anita Singh", plan["approved_by"])

        # Check audit trail records role and note
        audit_lines = (store.dir(run_id) / "audit.jsonl").read_text(encoding="utf-8").splitlines()
        approve_audit = [json.loads(l) for l in audit_lines if "plan.approved" in l]
        self.assertTrue(len(approve_audit) > 0)
        self.assertEqual(approve_audit[0]["note"], "Reconciliation verified")

    def test_plan_revision_and_reapproval_workflow(self):
        """Staff can unlock an approved plan for revisions and re-approve to version 2."""
        run_id = "run_revision_test"
        self._setup_review_run(run_id)

        # 1. Initial approval (v1)
        self.client.post(f"/runs/{run_id}/approve", json={"by": "Dr. Rao", "role": "Attending Physician"})

        # Cannot edit while locked
        locked_edit = self.client.patch(
            f"/runs/{run_id}/fields/m1",
            json={"action": "edit", "attrs": {"name": "Paracetamol", "dose": "650 mg", "frequency": "Twice daily"}},
        )
        self.assertEqual(locked_edit.status_code, 409)

        # 2. Staff unlocks plan for revision
        unlock_resp = self.client.post(
            f"/runs/{run_id}/unlock",
            json={"by": "Dr. Rao", "role": "Attending Physician", "note": "Adjust dose to 650mg"},
        )
        self.assertEqual(unlock_resp.status_code, 200)
        self.assertEqual(unlock_resp.json()["status"], "needs_review")
        self.assertFalse(unlock_resp.json()["approved"])

        # 3. Edit field
        edit_resp = self.client.patch(
            f"/runs/{run_id}/fields/m1",
            json={"action": "edit", "attrs": {"name": "Paracetamol", "dose": "650 mg", "frequency": "Twice daily"}},
        )
        self.assertEqual(edit_resp.status_code, 200)

        # 4. Re-approve creating v2
        reapp_resp = self.client.post(
            f"/runs/{run_id}/reapprove",
            json={"by": "Dr. Rao", "role": "Attending Physician", "note": "Increased dose to 650mg post-op"},
        )
        self.assertEqual(reapp_resp.status_code, 200)
        v2_plan = reapp_resp.json()
        self.assertEqual(v2_plan["version"], 2)
        self.assertEqual(v2_plan["items"][0]["attrs"]["dose"], "650 mg")

        # Verify versions available via GET
        v1 = self.client.get(f"/runs/{run_id}/plan?version=1").json()
        v2 = self.client.get(f"/runs/{run_id}/plan?version=2").json()
        self.assertEqual(v1["items"][0]["attrs"]["dose"], "500 mg")
        self.assertEqual(v2["items"][0]["attrs"]["dose"], "650 mg")

    def test_patient_detail_includes_monitoring_tasks_and_token(self):
        """Staff patient detail view includes tasks and patient token."""
        run_id = "run_patient_detail_test"
        pat_token = self._setup_review_run(run_id)

        # Approve and generate tasks
        self.client.post(f"/runs/{run_id}/approve", json={"by": "Anita Singh", "role": "Registered Nurse"})

        # Fetch patient detail
        resp = self.client.get(f"/patients/{run_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["run"]["patient_token"], pat_token)
        self.assertTrue(len(data["tasks"]) > 0)
        self.assertEqual(data["tasks"][0]["category"], "medication")


if __name__ == "__main__":
    unittest.main()
