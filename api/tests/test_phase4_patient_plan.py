"""Unit tests for Phase 4: Patient Dashboard and Recovery Progress."""
import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import store
class TestPhase4PatientPlan(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        self.case_meta = resp.json()
        self.run_id = self.case_meta["run_id"]
        self.token = self.case_meta["patient_token"]

    def test_unapproved_plan_returns_403(self):
        """Unapproved plan cannot be accessed via patient endpoint (403 forbidden)."""
        unapp_id = "run_test_unapproved"
        store.write(unapp_id, "meta.json", {
            "run_id": unapp_id,
            "patient_token": "pat_unapproved_123",
            "patient": {"name": "Test Patient", "phone": "+1234"},
            "approved": False,
        })
        resp = self.client.get("/plans/pat_unapproved_123")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("still being reviewed", resp.json()["detail"]["message"])

    def test_approved_plan_delivery_and_duration(self):
        """Approved plan is delivered with sanitized fields, duration, and scheduled tasks."""
        appr_resp = self.client.post(
            f"/runs/{self.run_id}/approve",
            json={"by": "Nurse Sunita", "role": "Registered Nurse", "note": "Patient stable for discharge"}
        )
        self.assertEqual(appr_resp.status_code, 200)

        resp = self.client.get(f"/plans/{self.token}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["run_id"], self.run_id)
        self.assertEqual(data["patient_name"], "Priya Sharma")
        self.assertEqual(data["version"], 1)
        self.assertGreater(data["plan_duration_days"], 0)
        self.assertIn("wound_care", data["instructions"])
        self.assertIn("medications", data)
        self.assertGreater(len(data["medications"]), 0)

        tasks = data["tasks_today"]
        self.assertGreater(len(tasks), 0)
        first_task = tasks[0]
        self.assertIn("task_id", first_task)
        self.assertIn("title", first_task)
        self.assertEqual(first_task["status"], "pending")

    def test_task_actions_and_reset(self):
        """Patient can complete, reset, and snooze discrete recovery tasks."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Sunita", "role": "Registered Nurse"})

        tasks_resp = self.client.get(f"/plans/{self.token}/tasks")
        self.assertEqual(tasks_resp.status_code, 200)
        tasks = tasks_resp.json()["tasks"]
        self.assertGreater(len(tasks), 0)
        task_id = tasks[0]["task_id"]

        # 1. Complete task
        comp_resp = self.client.post(
            f"/plans/{self.token}/tasks/{task_id}/action",
            json={"action": "complete", "by": "patient", "note": "Took with water"}
        )
        self.assertEqual(comp_resp.status_code, 200)
        updated = comp_resp.json()["task"]
        self.assertEqual(updated["status"], "completed")
        self.assertIsNotNone(updated["completed_at"])

        # 2. Reset task back to pending
        reset_resp = self.client.post(
            f"/plans/{self.token}/tasks/{task_id}/action",
            json={"action": "reset", "by": "patient"}
        )
        self.assertEqual(reset_resp.status_code, 200)
        reset_task = reset_resp.json()["task"]
        self.assertEqual(reset_task["status"], "pending")
        self.assertIsNone(reset_task.get("completed_at"))

        # 3. Snooze task
        snooze_resp = self.client.post(
            f"/plans/{self.token}/tasks/{task_id}/action",
            json={"action": "snooze", "by": "patient"}
        )
        self.assertEqual(snooze_resp.status_code, 200)
        self.assertEqual(snooze_resp.json()["task"]["status"], "snoozed")

    def test_dose_reporting_and_acknowledgement(self):
        """Medication dose reporting and reminder acknowledgement are auditable and distinct."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Sunita", "role": "Registered Nurse"})

        # Acknowledge reminder
        ack_resp = self.client.post(
            f"/plans/{self.token}/medications/u7/acknowledge",
            json={"acknowledged": True, "via": "app_button"}
        )
        self.assertEqual(ack_resp.status_code, 200)
        ack_record = ack_resp.json()["dose_record"]
        self.assertTrue(ack_record["acknowledged"])

        # Report dose taken
        dose_resp = self.client.post(
            f"/plans/{self.token}/medications/u7/report-dose",
            json={"reported_taken": True, "via": "app_button", "note": "Dose ingested"}
        )
        self.assertEqual(dose_resp.status_code, 200)
        dose_record = dose_resp.json()["dose_record"]
        self.assertTrue(dose_record["reported_taken"])
        self.assertIsNotNone(dose_record["reported_taken_at"])

    def test_approval_transition_and_version_update(self):
        """Staff approval immediately makes plan live, and reapproval increments version."""
        # 1. Before approval: 403
        pre_resp = self.client.get(f"/plans/{self.token}")
        self.assertEqual(pre_resp.status_code, 403)

        # 2. Staff approves v1
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Sunita", "role": "Registered Nurse"})
        v1_resp = self.client.get(f"/plans/{self.token}")
        self.assertEqual(v1_resp.status_code, 200)
        self.assertEqual(v1_resp.json()["version"], 1)

        # 3. Staff unlocks and reapproves v2
        unlock_resp = self.client.post(f"/runs/{self.run_id}/unlock", json={"by": "Sunita", "reason": "Dose adjustment"})
        self.assertEqual(unlock_resp.status_code, 200)

        reapp_resp = self.client.post(
            f"/runs/{self.run_id}/reapprove",
            json={"by": "Dr. Rao", "role": "Attending Physician", "note": "Approved updated cardiac dose"}
        )
        self.assertEqual(reapp_resp.status_code, 200)

        # Patient plan now immediately reflects v2
        v2_resp = self.client.get(f"/plans/{self.token}")
        self.assertEqual(v2_resp.status_code, 200)
        self.assertEqual(v2_resp.json()["version"], 2)


if __name__ == "__main__":
    unittest.main()
