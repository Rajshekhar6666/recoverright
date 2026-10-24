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


class TestPhase7Caregivers(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.orig_runs_dir = store.dir
        self.orig_help_base = help_store._base
        self.run_id = "run_cg_test"
        self.patient_token = "pat_cg_test"
        self.caregiver_token = "cg_test_token"

        # Create isolated run dir
        self.run_path = Path(self.tmp_dir) / self.run_id
        self.run_path.mkdir(parents=True, exist_ok=True)
        store.dir = lambda r: Path(self.tmp_dir) / r

        # Create isolated help dir
        self.help_dir = Path(self.tmp_dir) / "help"
        self.help_dir.mkdir(parents=True, exist_ok=True)
        help_store._base = self.help_dir

        # Register tokens
        store.register_patient_token(self.patient_token, self.run_id)
        store.register_caregiver_token(self.caregiver_token, self.run_id)

        # Write run metadata
        self.meta = {
            "run_id": self.run_id,
            "patient_token": self.patient_token,
            "approved": True,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "patient": {
                "name": "Ramesh Kumar",
                "language": "en",
                "phone": "+91 98765 11111",
                "caregivers": [
                    {
                        "name": "Ananya Kumar",
                        "phone": "+91 98765 22222",
                        "relationship": "Daughter",
                        "consent_status": "consented",
                        "notification_preferences": ["sms", "whatsapp"],
                        "verified": True,
                    }
                ],
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        store.write(self.run_id, "meta.json", self.meta)

        # Write approved plan
        plan = {
            "run_id": self.run_id,
            "patient_name": "Ramesh Kumar",
            "plan_duration_days": 10,
            "approved_by": "Dr. Rao",
            "approved_at": self.meta["approved_at"],
            "version": 1,
            "items": [
                {
                    "field_id": "med_1",
                    "category": "medications",
                    "attrs": {
                        "name": "Amoxicillin",
                        "dose": "500 mg",
                        "route": "Oral",
                        "frequency": "Three times daily",
                        "duration": "7 days",
                    },
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
                {
                    "field_id": "wc_1",
                    "category": "wound_care",
                    "attrs": {"instruction": "Keep dressing dry"},
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
                {
                    "field_id": "fu_1",
                    "category": "follow_ups",
                    "attrs": {"what": "Review", "when": "7 days", "where": "Clinic"},
                    "decision": "confirmed",
                    "status_at_review": "agreed",
                },
            ],
        }
        store.save_plan_version(self.run_id, plan, version=1)

        # Initialize recovery tasks
        tasks = [
            {
                "task_id": "task_med_1",
                "category": "medication",
                "title": "Take Amoxicillin",
                "status": "pending",
                "scheduled_time": "08:00 AM",
            },
            {
                "task_id": "task_walk_1",
                "category": "activity",
                "title": "Afternoon Walk",
                "status": "pending",
                "scheduled_time": "04:00 PM",
            },
        ]
        store.save_tasks(self.run_id, tasks)

    def tearDown(self):
        help_store._base = self.orig_help_base
        store.dir = self.orig_runs_dir
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_caregiver_patient_view_success(self):
        res = client.get(f"/caregivers/{self.caregiver_token}/patient")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["patient_name"], "Ramesh Kumar")
        self.assertEqual(data["caregiver_name"], "Ananya Kumar")
        self.assertEqual(data["relationship"], "Daughter")
        self.assertEqual(data["consent_status"], "consented")
        self.assertEqual(len(data["tasks_today"]), 2)
        self.assertEqual(len(data["medications"]), 1)
        self.assertEqual(data["adherence_rate"], 0.0)

    def test_caregiver_consent_update_and_revocation(self):
        # Revoke consent
        res_revoke = client.post(
            f"/caregivers/{self.caregiver_token}/consent",
            json={"consent_status": "revoked"},
        )
        self.assertEqual(res_revoke.status_code, 200)
        self.assertEqual(res_revoke.json()["caregiver"]["consent_status"], "revoked")

        # Accessing patient view with revoked consent must return 403
        res_view = client.get(f"/caregivers/{self.caregiver_token}/patient")
        self.assertEqual(res_view.status_code, 403)
        self.assertEqual(res_view.json()["detail"]["error"], "consent_revoked")

        # Re-grant consent with updated preferences
        res_grant = client.post(
            f"/caregivers/{self.caregiver_token}/consent",
            json={"consent_status": "consented", "notification_preferences": ["whatsapp"]},
        )
        self.assertEqual(res_grant.status_code, 200)
        self.assertEqual(res_grant.json()["caregiver"]["consent_status"], "consented")
        self.assertEqual(res_grant.json()["caregiver"]["notification_preferences"], ["whatsapp"])

        # View becomes accessible again
        res_view2 = client.get(f"/caregivers/{self.caregiver_token}/patient")
        self.assertEqual(res_view2.status_code, 200)

    def test_caregiver_task_assistance_and_adherence_update(self):
        # Caregiver marks task as completed
        res_task = client.post(
            f"/caregivers/{self.caregiver_token}/tasks/task_med_1/action",
            json={"action": "complete"},
        )
        self.assertEqual(res_task.status_code, 200)
        self.assertEqual(res_task.json()["status"], "completed")
        self.assertEqual(res_task.json()["completed_by"], "caregiver")

        # Adherence rate in caregiver view updates to 50%
        res_view = client.get(f"/caregivers/{self.caregiver_token}/patient")
        self.assertEqual(res_view.status_code, 200)
        self.assertEqual(res_view.json()["adherence_rate"], 50.0)

    def test_caregiver_report_medication_dose(self):
        res_dose = client.post(
            f"/caregivers/{self.caregiver_token}/medications/med_1/report-dose",
            json={"reported_taken": True, "note": "Observed ingestion with water"},
        )
        self.assertEqual(res_dose.status_code, 200)
        record = res_dose.json()
        self.assertTrue(record["reported_taken"])
        self.assertEqual(record["reported_via"], "caregiver_portal")

    def test_caregiver_notification_dispatch(self):
        # Dispatch notification
        res_notify = client.post(
            f"/caregivers/{self.caregiver_token}/notify",
            json={"notification_type": "milestone", "channel": "whatsapp"},
        )
        self.assertEqual(res_notify.status_code, 200)
        notif = res_notify.json()
        self.assertEqual(notif["notification_type"], "milestone")
        self.assertEqual(notif["channel"], "whatsapp")
        self.assertEqual(notif["status"], "delivered")

        # List notifications
        res_list = client.get(f"/caregivers/{self.caregiver_token}/notifications")
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["notification_type"], "milestone")

    def test_emergency_auto_notifies_consented_caregivers(self):
        # Patient triggers emergency help request
        res_help = client.post(
            "/help",
            json={
                "token": self.patient_token,
                "heard": "I have severe chest pain",
                "severity": "critical",
                "label": "chest pain",
                "source": "voice",
                "client_id": "cid_cg_emerg_test",
            },
        )
        self.assertEqual(res_help.status_code, 201)

        # Consented caregiver must have received an automatic emergency notification
        res_notifs = client.get(f"/caregivers/{self.caregiver_token}/notifications")
        self.assertEqual(res_notifs.status_code, 200)
        notifs = res_notifs.json()
        self.assertTrue(any(n["notification_type"] == "emergency" for n in notifs))


if __name__ == "__main__":
    unittest.main()
