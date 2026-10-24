"""Tests for RecoverRight Phase 1: Shared Contracts, Data Models, and Patient Authorization."""
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline.tasks import generate_tasks_for_plan, times_for_frequency
from app.schemas.api import (
    ApprovedPlan,
    ApprovedPlanItem,
    CaregiverContact,
    MedicationDoseRecord,
    PatientPlanResponse,
    RecoveryTask,
)
from app.services.storage import store


class TestPhase1Contracts(unittest.TestCase):
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

    # ---------------------------------------------------------------- Models
    def test_caregiver_contact_validation(self):
        cg = CaregiverContact(
            name="Ravi Sharma",
            phone="+919876543210",
            relationship="son",
            consent_status="consented",
            notification_preferences=["sms", "whatsapp"],
            verified=True,
        )
        self.assertEqual(cg.consent_status, "consented")
        self.assertTrue(cg.verified)

    def test_medication_dose_separation_safety(self):
        """Clinical safety: reminder delivery and ack != medication ingestion."""
        dose = MedicationDoseRecord(
            dose_id="d1",
            run_id="run_1",
            plan_version=1,
            medication_id="m1",
            medication_name="Amoxicillin",
            acknowledged=True,
            acknowledged_at=datetime.now(timezone.utc).isoformat(),
            reported_taken=False,
            reported_taken_at=None,
        )
        # Dose has been acknowledged by patient/guardian, but NOT taken
        self.assertTrue(dose.acknowledged)
        self.assertFalse(dose.reported_taken)

    def test_times_for_frequency(self):
        self.assertEqual(times_for_frequency("twice daily"), ["08:00 AM", "08:00 PM"])
        self.assertEqual(times_for_frequency("three times daily"), ["08:00 AM", "02:00 PM", "08:00 PM"])
        self.assertEqual(times_for_frequency("every 8 hours"), ["08:00 AM", "04:00 PM", "12:00 AM"])
        self.assertEqual(times_for_frequency("once daily at bedtime"), ["09:00 PM"])
        self.assertEqual(times_for_frequency("as needed for pain"), [])

    # ---------------------------------------------------------------- Server-side Authorization & Patient Delivery
    def test_patient_endpoint_refuses_unapproved_plan(self):
        """Safety acceptance criterion: unapproved plans cannot be delivered to patients."""
        # Create a mock unapproved run
        run_id = "run_test_unapproved"
        pat_token = "pat_secure_12345"
        d = store.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "run_id": run_id,
            "patient_token": pat_token,
            "status": "needs_review",
            "approved": False,
            "filename": "discharge.pdf",
            "patient": {"name": "Test Patient", "phone": "555-0100", "patient_token": pat_token},
        }
        store.write(run_id, "meta.json", meta)
        store.register_patient_token(pat_token, run_id)

        # Patient tries to access via patient token
        resp = self.client.get(f"/plans/{pat_token}")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["detail"]["error"], "plan_not_approved")

        # Patient tries to access tasks
        tasks_resp = self.client.get(f"/plans/{pat_token}/tasks")
        self.assertEqual(tasks_resp.status_code, 403)

    def test_patient_endpoint_delivers_sanitized_approved_plan(self):
        """Safety acceptance criterion: approved plan delivers sanitized instructions with no blocks/evidence."""
        run_id = "run_test_approved"
        pat_token = "pat_secure_67890"
        d = store.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        meta = {
            "run_id": run_id,
            "patient_token": pat_token,
            "status": "approved",
            "approved": True,
            "approved_by": "Dr. Smith",
            "filename": "discharge.pdf",
            "patient": {
                "name": "Arjun Patel",
                "phone": "+919876543210",
                "language": "hi",
                "caregivers": [
                    {"name": "Sunita", "phone": "+919876543211", "consent_status": "consented", "relationship": "spouse", "verified": True, "notification_preferences": ["sms"]}
                ],
                "patient_token": pat_token,
            },
        }
        store.write(run_id, "meta.json", meta)
        store.register_patient_token(pat_token, run_id)

        plan = {
            "run_id": run_id,
            "version": 1,
            "approved_by": "Dr. Smith",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "patient": meta["patient"],
            "plan_duration_days": 14,
            "items": [
                {
                    "field_id": "m1",
                    "category": "medications",
                    "attrs": {"name": "Cefixime", "dose": "200 mg", "frequency": "Twice daily", "route": "Oral"},
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
                {
                    "field_id": "wc1",
                    "category": "wound_care",
                    "attrs": {"instruction": "Keep incision dry and clean."},
                    "decision": "auto",
                    "status_at_review": "agreed",
                },
                {
                    "field_id": "fu1",
                    "category": "follow_ups",
                    "attrs": {"what": "Suture removal", "when": "in 10 days", "where": "Outpatient Wing"},
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
                {
                    "field_id": "c1",
                    "category": "contacts",
                    "attrs": {"label": "Dr. Smith", "value": "+919800000000"},
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
            ],
            "removed": [],
        }
        store.save_plan_version(run_id, plan, version=1)

        resp = self.client.get(f"/plans/{pat_token}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # Check sanitized shape
        self.assertEqual(data["patient_name"], "Arjun Patel")
        self.assertEqual(data["language"], "hi")
        self.assertEqual(len(data["medications"]), 1)
        self.assertEqual(data["medications"][0]["name"], "Cefixime")
        self.assertEqual(data["medications"][0]["times"], ["08:00 AM", "08:00 PM"])
        self.assertIn("Keep incision dry and clean.", data["instructions"]["wound_care"])
        self.assertEqual(len(data["follow_ups"]), 1)
        self.assertEqual(len(data["caregivers"]), 1)
        self.assertTrue(len(data["tasks_today"]) >= 2)

        # Ensure NO leaked internal fields
        self.assertNotIn("blocks", data)
        self.assertNotIn("blockers", data)
        self.assertNotIn("voters", data)
        self.assertNotIn("opinions", data)

    # ---------------------------------------------------------------- Tasks & Dose Actions
    def test_task_completion_and_dose_reporting(self):
        run_id = "run_tasks_test"
        pat_token = "pat_tasks_token"
        meta = {
            "run_id": run_id, "patient_token": pat_token, "status": "approved", "approved": True,
            "patient": {"name": "Priya", "phone": "123", "patient_token": pat_token},
        }
        store.write(run_id, "meta.json", meta)
        store.register_patient_token(pat_token, run_id)
        plan = {
            "run_id": run_id, "version": 1, "approved_by": "Nurse", "approved_at": "now",
            "items": [{"field_id": "m1", "category": "medications", "attrs": {"name": "Paracetamol", "dose": "500 mg", "frequency": "Once daily"}}],
            "removed": [],
        }
        store.save_plan_version(run_id, plan, version=1)

        # 1. Fetch tasks
        t_resp = self.client.get(f"/plans/{pat_token}/tasks")
        self.assertEqual(t_resp.status_code, 200)
        tasks = t_resp.json()["tasks"]
        self.assertTrue(len(tasks) > 0)
        task_id = tasks[0]["task_id"]

        # 2. Complete task
        act_resp = self.client.post(
            f"/plans/{pat_token}/tasks/{task_id}/action",
            json={"action": "complete", "by": "patient", "note": "taken with water"},
        )
        self.assertEqual(act_resp.status_code, 200)
        self.assertEqual(act_resp.json()["task"]["status"], "completed")

        # 3. Acknowledge reminder (distinct from taken)
        ack_resp = self.client.post(
            f"/plans/{pat_token}/medications/m1/acknowledge",
            json={"acknowledged": True, "via": "app_button"},
        )
        self.assertEqual(ack_resp.status_code, 200)
        rec = ack_resp.json()["dose_record"]
        self.assertTrue(rec["acknowledged"])
        self.assertFalse(rec["reported_taken"])

        # 4. Report dose taken via voice
        dose_resp = self.client.post(
            f"/plans/{pat_token}/medications/m1/report-dose",
            json={"reported_taken": True, "via": "voice", "note": "patient confirmed: 'I took my medicine'"},
        )
        self.assertEqual(dose_resp.status_code, 200)
        d_rec = dose_resp.json()["dose_record"]
        self.assertTrue(d_rec["reported_taken"])
        self.assertEqual(d_rec["reported_via"], "voice")

    # ---------------------------------------------------------------- Multi-Version Plans
    def test_plan_versioning_and_reapproval(self):
        run_id = "run_version_test"
        meta = {
            "run_id": run_id, "status": "approved", "approved": True, "current_version": 1,
            "patient": {"name": "Version Patient"},
        }
        store.write(run_id, "meta.json", meta)
        plan_v1 = {
            "run_id": run_id, "version": 1, "approved_by": "Nurse Alpha", "approved_at": "t1",
            "items": [{"field_id": "m1", "category": "medications", "attrs": {"name": "Drug A", "dose": "10 mg"}}],
            "removed": [],
        }
        store.save_plan_version(run_id, plan_v1, version=1)

        # Inspect versions
        v_resp = self.client.get(f"/runs/{run_id}/versions")
        self.assertEqual(v_resp.status_code, 200)
        self.assertEqual(v_resp.json()["current_version"], 1)

        # Save version 2
        plan_v2 = {
            "run_id": run_id, "version": 2, "approved_by": "Dr. Beta", "approved_at": "t2",
            "items": [{"field_id": "m1", "category": "medications", "attrs": {"name": "Drug A", "dose": "20 mg"}}],
            "removed": [],
        }
        store.save_plan_version(run_id, plan_v2, version=2)

        # Query version 1 and 2
        p1 = self.client.get(f"/runs/{run_id}/plan?version=1").json()
        p2 = self.client.get(f"/runs/{run_id}/plan?version=2").json()
        self.assertEqual(p1["items"][0]["attrs"]["dose"], "10 mg")
        self.assertEqual(p2["items"][0]["attrs"]["dose"], "20 mg")

        # Query latest version default
        p_latest = self.client.get(f"/runs/{run_id}/plan").json()
        self.assertEqual(p_latest["version"], 2)


if __name__ == "__main__":
    unittest.main()
