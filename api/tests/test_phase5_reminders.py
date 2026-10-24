"""Unit tests for Phase 5: Reminder Engine and Delivery Channels."""
import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import store
from app.services.reminder import schedule_reminders_for_plan, get_reminders_for_run
from app.schemas.api import ApprovedPlan


class TestPhase5ReminderEngine(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Load demo case
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        self.case_meta = resp.json()
        self.run_id = self.case_meta["run_id"]
        self.token = self.case_meta["patient_token"]

    def test_schedule_reminders_on_approval(self):
        """Approving a plan automatically schedules deterministic reminder jobs."""
        # Approve run
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})

        # Fetch reminders
        resp = self.client.get(f"/plans/{self.token}/reminders")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["run_id"], self.run_id)
        reminders = data["reminders"]
        self.assertGreater(len(reminders), 0)

        # Check job structure
        job = reminders[0]
        self.assertIn("job_id", job)
        self.assertEqual(job["status"], "scheduled")
        self.assertEqual(job["channel"], "in_app")
        self.assertIn("scheduled_time", job)
        self.assertEqual(job["plan_version"], 1)

    def test_reminder_idempotency(self):
        """Calling schedule multiple times does not produce duplicate jobs for the same run and plan version."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})

        plan_dict = store.get_plan_version(self.run_id)
        plan = ApprovedPlan.model_validate(plan_dict)

        # Reschedule again manually
        schedule_reminders_for_plan(plan)
        jobs_1 = get_reminders_for_run(self.run_id)

        schedule_reminders_for_plan(plan)
        jobs_2 = get_reminders_for_run(self.run_id)

        self.assertEqual(len(jobs_1), len(jobs_2))
        unique_ids = {j.job_id for j in jobs_2}
        self.assertEqual(len(unique_ids), len(jobs_2))

    def test_provider_channels_delivery(self):
        """Reminders can be deterministically triggered via in_app, sms, and whatsapp channels."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})

        rem_resp = self.client.get(f"/plans/{self.token}/reminders")
        jobs = rem_resp.json()["reminders"]
        self.assertGreater(len(jobs), 0)
        job_id = jobs[0]["job_id"]

        # 1. Trigger via in_app
        inapp_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/trigger",
            json={"channel": "in_app"}
        )
        self.assertEqual(inapp_resp.status_code, 200)
        inapp_job = inapp_resp.json()
        self.assertEqual(inapp_job["status"], "delivered")
        self.assertEqual(inapp_job["channel"], "in_app")
        self.assertEqual(inapp_job["attempts"], 1)

        # 2. Trigger via sms
        sms_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/trigger",
            json={"channel": "sms"}
        )
        self.assertEqual(sms_resp.status_code, 200)
        sms_job = sms_resp.json()
        self.assertEqual(sms_job["status"], "delivered")
        self.assertEqual(sms_job["channel"], "sms")
        self.assertEqual(sms_job["attempts"], 2)

        # 3. Trigger via whatsapp
        wa_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/trigger",
            json={"channel": "whatsapp"}
        )
        self.assertEqual(wa_resp.status_code, 200)
        wa_job = wa_resp.json()
        self.assertEqual(wa_job["status"], "delivered")
        self.assertEqual(wa_job["channel"], "whatsapp")
        self.assertEqual(wa_job["attempts"], 3)

    def test_reminder_failure_and_retry(self):
        """Simulated delivery failures increment attempts and record failure states."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})

        rem_resp = self.client.get(f"/plans/{self.token}/reminders")
        job_id = rem_resp.json()["reminders"][0]["job_id"]

        fail_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/trigger",
            json={"channel": "sms", "simulate_failure": True}
        )
        self.assertEqual(fail_resp.status_code, 200)
        failed_job = fail_resp.json()
        self.assertEqual(failed_job["status"], "attempted")
        self.assertEqual(failed_job["attempts"], 1)
        self.assertIsNotNone(failed_job["error"])

    def test_snooze_and_acknowledge(self):
        """Snoozing sets future timestamp; acknowledging sets status and dose ack record."""
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})

        rem_resp = self.client.get(f"/plans/{self.token}/reminders")
        job_id = rem_resp.json()["reminders"][0]["job_id"]

        # Snooze
        snooze_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/snooze",
            json={"minutes": 15, "by": "patient"}
        )
        self.assertEqual(snooze_resp.status_code, 200)
        snoozed_job = snooze_resp.json()
        self.assertEqual(snoozed_job["status"], "snoozed")
        self.assertIsNotNone(snoozed_job["snooze_until"])

        # Acknowledge
        ack_resp = self.client.post(
            f"/plans/{self.token}/reminders/{job_id}/acknowledge?via=app_button"
        )
        self.assertEqual(ack_resp.status_code, 200)
        acked_job = ack_resp.json()
        self.assertEqual(acked_job["status"], "acknowledged")
        self.assertIsNotNone(acked_job["acknowledged_at"])

    def test_cancel_stale_reminders_on_plan_reapproval(self):
        """Unlocking and reapproving cancels older plan version reminders and schedules new ones."""
        # Version 1 approval
        self.client.post(f"/runs/{self.run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})
        v1_rems = self.client.get(f"/plans/{self.token}/reminders").json()["reminders"]
        self.assertTrue(all(r["plan_version"] == 1 for r in v1_rems))
        self.assertTrue(any(r["status"] == "scheduled" for r in v1_rems))

        # Unlock and reapprove creating Version 2
        self.client.post(f"/runs/{self.run_id}/unlock", json={"by": "Sunita", "reason": "Dose revision"})
        self.client.post(f"/runs/{self.run_id}/reapprove", json={"by": "Dr. Rao", "role": "Attending Physician"})

        v2_rems = self.client.get(f"/plans/{self.token}/reminders").json()["reminders"]

        # Stale v1 reminders are cancelled
        stale_v1 = [r for r in v2_rems if r["plan_version"] == 1]
        self.assertTrue(all(r["status"] == "cancelled" for r in stale_v1))

        # Fresh v2 reminders are scheduled
        fresh_v2 = [r for r in v2_rems if r["plan_version"] == 2]
        self.assertGreater(len(fresh_v2), 0)
        self.assertTrue(any(r["status"] == "scheduled" for r in fresh_v2))


if __name__ == "__main__":
    unittest.main()
