"""Unit and Integration Tests for Additional Clinical Features.

Tests:
1. Circadian Routine & Daily Meal Schedule Alignment (Gap 3)
2. 'What I Actually Take' Intake Discrepancy Reconciliation (Denmark Gap)
3. Daily Red-Flag Symptom Check-in & Human Trigger (BEAT-HF Trial S10)
4. 10-Second Clinical SBAR Handover Note
5. 'What to Do, Who to Call' Emergency Action Cards (Gap 10)
6. Hospital Cockpit: Shift Ownership & SLA Performance (Gap 7)
7. Printable Large-Print Plan with QR Code (Frugal Channel S12)
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app
from app.services.daily_routine import align_schedule_to_routine
from app.services.storage import store


class TestAdditionalFeatures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.orig_runs_dir = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)

        # Load demo case and approve
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        self.meta = resp.json()
        self.run_id = self.meta["run_id"]
        self.token = self.meta["patient_token"]

        approve_resp = self.client.post(
            f"/runs/{self.run_id}/approve",
            json={"by": "Nurse Sunita", "role": "Registered Nurse", "note": "Plan confirmed"},
        )
        self.assertEqual(approve_resp.status_code, 200)

    def tearDown(self):
        if self.orig_runs_dir:
            os.environ["RR_RUNS_DIR"] = self.orig_runs_dir
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()

    # ── 1. Circadian Routine Alignment ─────────────────────────────────────
    def test_circadian_routine_alignment(self):
        """Aligns medication dosing around patient's actual meals and waking times."""
        # Test standalone alignment function
        custom_routine = {
            "breakfast_time": "09:00 AM",
            "lunch_time": "02:00 PM",
            "dinner_time": "09:00 PM",
            "bedtime": "11:00 PM",
        }
        bid_times = align_schedule_to_routine("Twice daily", routine=custom_routine)
        self.assertEqual(bid_times, ["09:00 AM", "09:00 PM"])

        tid_times = align_schedule_to_routine("Three times daily", routine=custom_routine)
        self.assertEqual(tid_times, ["09:00 AM", "02:00 PM", "09:00 PM"])

        bedtime_times = align_schedule_to_routine("Once at bedtime", routine=custom_routine)
        self.assertEqual(bedtime_times, ["11:00 PM"])

        # Test API endpoints
        get_resp = self.client.get(f"/plans/{self.token}/daily-routine")
        self.assertEqual(get_resp.status_code, 200)
        self.assertIn("breakfast_time", get_resp.json()["routine"])

        post_resp = self.client.post(
            f"/plans/{self.token}/daily-routine",
            json={
                "breakfast_time": "09:15 AM",
                "dinner_time": "09:15 PM",
                "by": "patient",
            },
        )
        self.assertEqual(post_resp.status_code, 200)
        self.assertEqual(post_resp.json()["status"], "aligned")

    # ── 2. 'What I Actually Take' Discrepancies ─────────────────────────────
    def test_adherence_discrepancy_reconciliation(self):
        """Reconciles prescribed medicines with logged doses and missed jobs."""
        resp = self.client.get(f"/runs/{self.run_id}/medication-adherence-discrepancies")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("overall_adherence_rate_pct", data)
        self.assertIn("medications", data)
        self.assertIn("clinical_summary", data)
        self.assertGreaterEqual(data["total_prescribed_medications"], 1)

    # ── 3. Daily Red-Flag Symptom Check-in ──────────────────────────────────
    def test_daily_symptom_checkin_all_clear(self):
        """1-tap check-in returns all-clear when no red-flags are reported."""
        q_resp = self.client.get(f"/plans/{self.token}/daily-checkin")
        self.assertEqual(q_resp.status_code, 200)
        questions = q_resp.json()["questions"]
        self.assertGreaterEqual(len(questions), 3)

        # Submit all clear (no symptoms)
        clear_responses = [{"question_id": q["id"], "present": False} for q in questions]
        sub_resp = self.client.post(
            f"/plans/{self.token}/daily-checkin",
            json={"responses": clear_responses, "by": "patient"},
        )
        self.assertEqual(sub_resp.status_code, 200)
        self.assertTrue(sub_resp.json()["all_clear"])
        self.assertEqual(len(sub_resp.json()["positive_symptoms"]), 0)

    def test_daily_symptom_checkin_fever_triggers_nurse_escalation(self):
        """Reporting fever on daily check-in automatically triggers nurse inbox."""
        from app.services.help_store import help_store

        q_resp = self.client.get(f"/plans/{self.token}/daily-checkin")
        questions = q_resp.json()["questions"]

        # Flag fever
        flag_responses = [
            {"question_id": questions[0]["id"], "present": True, "notes": "Fever 101.5 F started this morning"}
        ]
        sub_resp = self.client.post(
            f"/plans/{self.token}/daily-checkin",
            json={"responses": flag_responses, "by": "patient"},
        )
        self.assertEqual(sub_resp.status_code, 200)
        self.assertFalse(sub_resp.json()["all_clear"])
        self.assertGreater(len(sub_resp.json()["positive_symptoms"]), 0)

        # Verify alert created in staff inbox
        active = help_store.list("active")
        flag_alerts = [h for h in active if h.get("run_id") == self.run_id and h.get("source") == "button"]
        self.assertGreater(len(flag_alerts), 0)

    # ── 4. 10-Second Clinical SBAR Handover Note ────────────────────────────
    def test_clinical_handover_sbar_generation(self):
        """Generates crisp SBAR structured summary for shift handoff."""
        resp = self.client.get(f"/runs/{self.run_id}/handover-note")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        sbar = data["sbar"]
        self.assertIn("situation", sbar)
        self.assertIn("background", sbar)
        self.assertIn("assessment", sbar)
        self.assertIn("recommendation", sbar)
        self.assertIn("post_op_day", data)

    # ── 5. Action Cards ─────────────────────────────────────────────────────
    def test_action_cards_generation(self):
        """Generates actionable 4-point emergency cards per warning sign."""
        resp = self.client.get(f"/plans/{self.token}/action-cards")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("cards", data)
        if data["total_cards"] > 0:
            card = data["cards"][0]
            self.assertIn("what_you_notice", card)
            self.assertIn("what_to_do_first", card)
            self.assertIn("who_to_call", card)
            self.assertIn("when_to_go_to_er", card)

    # ── 6. Hospital Cockpit & Shift Ownership ───────────────────────────────
    def test_hospital_cockpit_and_shift_owner(self):
        """Exposes shift owner, active queue, and SLA compliance metrics."""
        # Read cockpit
        c_resp = self.client.get("/analytics/cockpit")
        self.assertEqual(c_resp.status_code, 200)
        data = c_resp.json()
        self.assertIn("shift", data)
        self.assertIn("active_queue", data)
        self.assertIn("sla_performance", data)

        # Update shift owner
        up_resp = self.client.post(
            "/analytics/cockpit/shift-owner",
            json={
                "nurse_name": "Nurse Priya Nair, BSN",
                "desk_phone": "+91 99000 88776",
                "shift_name": "Night Shift (23:00 – 07:00)",
                "on_call_backup": "Dr. K. Sharma",
            },
        )
        self.assertEqual(up_resp.status_code, 200)
        self.assertEqual(up_resp.json()["nurse_name"], "Nurse Priya Nair, BSN")

    # ── 7. Printable Large-Print Plan ───────────────────────────────────────
    def test_printable_large_print_plan(self):
        """Generates 18pt high-contrast printable plan structure for bedside binder."""
        # Patient endpoint
        p_resp = self.client.get(f"/plans/{self.token}/printable")
        self.assertEqual(p_resp.status_code, 200)
        p_data = p_resp.json()
        self.assertEqual(p_data["format"], "LARGE_PRINT_HIGH_CONTRAST")
        self.assertIn("medications_schedule", p_data)
        self.assertIn("emergency_helpline", p_data)

        # Staff endpoint
        s_resp = self.client.get(f"/runs/{self.run_id}/printable")
        self.assertEqual(s_resp.status_code, 200)
        self.assertEqual(s_resp.json()["run_id"], self.run_id)


if __name__ == "__main__":
    unittest.main()
