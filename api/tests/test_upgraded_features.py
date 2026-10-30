"""Unit and Integration Tests for Upgraded Clinical Recovery Features.

Covers:
1. Patient Teach-Back Comprehension Loop & Escalation (Okrainec S6)
2. Discharge Waiting-Room Mode & Milestone Tracking (India 332-minute delay)
3. Risk-Tiered Human Follow-up & Nurse Priority Call List (Singapore / US Project RED)
4. Affordability & First-Fill Refill Checks (Amrita study)
5. Family Circle Delegation Roles
6. Diabetes Metabolic Recovery Pack (Glucose log & Hypoglycemia Rule of 15)
7. Single-Page Clinical Audit Export
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app
from app.services.storage import store


class TestUpgradedFeatures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.orig_runs_dir = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)

        # Load standard demo case
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        self.meta = resp.json()
        self.run_id = self.meta["run_id"]
        self.token = self.meta["patient_token"]

        # Approve run so plan is accessible
        approve_resp = self.client.post(
            f"/runs/{self.run_id}/approve",
            json={"by": "Nurse Sunita", "role": "Registered Nurse", "note": "Verified approved"},
        )
        self.assertEqual(approve_resp.status_code, 200)

    def tearDown(self):
        if self.orig_runs_dir:
            os.environ["RR_RUNS_DIR"] = self.orig_runs_dir
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()

    # ── 1. Teach-Back Comprehension ─────────────────────────────────────────
    def test_teach_back_question_generation_and_submission(self):
        """Generates grounded questions, evaluates answers, and flags misunderstandings."""
        # Fetch questions
        resp = self.client.get(f"/plans/{self.token}/teach-back")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        questions = data["questions"]
        self.assertGreaterEqual(len(questions), 2)
        q_ids = [q["id"] for q in questions]
        self.assertIn("tb_medication", q_ids)

        # Submit perfect answers
        perfect_answers = [
            {"question_id": q["id"], "selected_option_id": "opt_correct"}
            for q in questions
        ]
        submit_resp = self.client.post(
            f"/plans/{self.token}/teach-back",
            json={"answers": perfect_answers, "by": "patient"},
        )
        self.assertEqual(submit_resp.status_code, 200)
        sub_data = submit_resp.json()
        self.assertEqual(sub_data["score_percentage"], 100.0)
        self.assertTrue(sub_data["passed"])
        self.assertEqual(len(sub_data["misunderstood_categories"]), 0)

    def test_teach_back_failed_warning_sign_escalates_to_nurse(self):
        """Failing the warning signs question triggers an automatic nurse triage request."""
        from app.services.help_store import help_store

        resp = self.client.get(f"/plans/{self.token}/teach-back")
        questions = resp.json()["questions"]

        # Deliberately pick incorrect option for warning signs
        flawed_answers = []
        for q in questions:
            if q["id"] == "tb_warning_sign":
                flawed_answers.append({"question_id": q["id"], "selected_option_id": "opt_wrong1"})
            else:
                flawed_answers.append({"question_id": q["id"], "selected_option_id": "opt_correct"})

        sub_resp = self.client.post(
            f"/plans/{self.token}/teach-back",
            json={"answers": flawed_answers, "by": "patient"},
        )
        self.assertEqual(sub_resp.status_code, 200)
        result = sub_resp.json()
        self.assertFalse(result["passed"])
        self.assertIn("warning_signs", result["misunderstood_categories"])

        # Check help inbox escalated
        active = help_store.list("active")
        teach_back_alerts = [h for h in active if h.get("run_id") == self.run_id and h.get("source") == "teach_back"]
        self.assertGreater(len(teach_back_alerts), 0)
        self.assertEqual(teach_back_alerts[0]["severity"], "critical")

    # ── 2. Discharge Waiting-Room Mode ──────────────────────────────────────
    def test_discharge_waiting_room_milestone_progression(self):
        """Coordinator advances discharge milestones and patient view reflects live status."""
        # Patient checks initial waiting room
        p_resp = self.client.get(f"/plans/{self.token}/waiting-room")
        self.assertEqual(p_resp.status_code, 200)
        p_data = p_resp.json()
        self.assertEqual(p_data["current_milestone"], "doctor_summary_ready")
        self.assertEqual(len(p_data["milestones"]), 7)

        # Staff coordinator updates milestone to TPA insurance review
        s_resp = self.client.post(
            f"/runs/{self.run_id}/waiting-room/milestone",
            json={
                "milestone": "insurance_preauth_pending",
                "note": "Awaiting final settlement response from TPA desk",
                "estimated_remaining_mins": 30,
                "updated_by": "Coordinator Rajesh",
            },
        )
        self.assertEqual(s_resp.status_code, 200)
        s_data = s_resp.json()
        self.assertEqual(s_data["current_milestone"], "insurance_preauth_pending")
        self.assertEqual(s_data["estimated_remaining_minutes"], 30)

        # Patient view reflects the update
        p_resp_updated = self.client.get(f"/plans/{self.token}/waiting-room")
        self.assertEqual(p_resp_updated.json()["current_milestone"], "insurance_preauth_pending")
        self.assertEqual(p_resp_updated.json()["estimated_remaining_minutes"], 30)

    # ── 3. Risk-Tiering & Priority Nurse Call List ───────────────────────────
    def test_risk_tiering_and_priority_call_list(self):
        """Computes clinical risk score and exposes prioritized call list."""
        resp = self.client.get("/analytics/nurse-call-list")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("tier_summary", data)
        self.assertIn("patients", data)
        self.assertGreaterEqual(data["total"], 1)

        # Single run assessment
        risk_resp = self.client.get(f"/analytics/risk/{self.run_id}")
        self.assertEqual(risk_resp.status_code, 200)
        r_data = risk_resp.json()
        self.assertIn("risk_score", r_data)
        self.assertIn("risk_tier", r_data)
        self.assertIn(r_data["risk_tier"], ("green", "amber", "red"))

    # ── 4. Affordability & First-Fill Check ─────────────────────────────────
    def test_medication_affordability_reporting_and_alerting(self):
        """Financial hardship or generic request triggers care team coordination."""
        from app.services.help_store import help_store

        # Patient reports needing cheaper generic substitution
        rep_resp = self.client.post(
            f"/plans/{self.token}/affordability",
            json={
                "status": "needs_generic",
                "note": "Brand prescribed is unaffordable; requesting doctor to switch to Jan Aushadhi generic",
                "by": "caregiver",
            },
        )
        self.assertEqual(rep_resp.status_code, 200)
        self.assertTrue(rep_resp.json()["recorded"])

        # Check status retrieval
        get_resp = self.client.get(f"/plans/{self.token}/affordability")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["current_status"], "needs_generic")

        # Verify help request was created for discharge desk
        active = help_store.list("active")
        afford_alerts = [h for h in active if h.get("run_id") == self.run_id and h.get("source") == "affordability_check"]
        self.assertGreater(len(afford_alerts), 0)

    # ── 5. Family Circle Delegation ─────────────────────────────────────────
    def test_family_circle_role_assignment(self):
        """Family members can be assigned discrete caregiving responsibilities."""
        # Create caregiver token
        cg_token = f"cg_test_{self.run_id}"
        store.register_caregiver_token(cg_token, self.run_id)

        # Assign family circle roles
        post_resp = self.client.post(
            f"/caregivers/{cg_token}/family-circle",
            json={
                "members": [
                    {
                        "name": "Pooja Sharma",
                        "phone": "+919876543211",
                        "relationship": "Daughter",
                        "roles": ["medications", "vitals"],
                        "availability": "Mornings & Evenings",
                        "primary_contact": True,
                    },
                    {
                        "name": "Amit Sharma",
                        "phone": "+919876543212",
                        "relationship": "Son",
                        "roles": ["transport", "emergency"],
                        "availability": "On-call",
                        "primary_contact": False,
                    },
                ],
                "updated_by": "Pooja Sharma",
            },
        )
        self.assertEqual(post_resp.status_code, 200)
        self.assertEqual(post_resp.json()["status"], "saved")

        # Fetch family circle
        get_resp = self.client.get(f"/caregivers/{cg_token}/family-circle")
        self.assertEqual(get_resp.status_code, 200)
        circle_data = get_resp.json()
        self.assertEqual(circle_data["total_members"], 2)
        roles = [m["roles"] for m in circle_data["members"]]
        self.assertIn(["medications", "vitals"], roles)

    # ── 6. Diabetes Recovery & Hypoglycemia Protocol ────────────────────────
    def test_glucose_logging_and_hypoglycemia_escalation(self):
        """Blood glucose < 70 returns Rule of 15; < 54 raises critical staff alert."""
        from app.services.help_store import help_store

        # 1. Normal reading
        norm_resp = self.client.post(
            f"/plans/{self.token}/glucose-log",
            json={"reading_mg_dl": 110.0, "timing": "fasting", "by": "patient"},
        )
        self.assertEqual(norm_resp.status_code, 200)
        self.assertEqual(norm_resp.json()["alert_level"], "NORMAL")

        # 2. Critical hypoglycemia (<54 mg/dL)
        crit_resp = self.client.post(
            f"/plans/{self.token}/glucose-log",
            json={"reading_mg_dl": 48.0, "timing": "pre_meal", "by": "patient"},
        )
        self.assertEqual(crit_resp.status_code, 200)
        crit_data = crit_resp.json()
        self.assertEqual(crit_data["alert_level"], "CRITICAL_HYPOGLYCEMIA")
        self.assertIn("CRITICAL", crit_data["clinical_guidance"])

        # Check history
        hist_resp = self.client.get(f"/plans/{self.token}/glucose-log")
        self.assertEqual(hist_resp.status_code, 200)
        self.assertEqual(hist_resp.json()["total_readings"], 2)

        # Check staff emergency alert created
        active = help_store.list("active")
        hypo_alerts = [h for h in active if h.get("run_id") == self.run_id and h.get("source") == "glucose_monitor"]
        self.assertGreater(len(hypo_alerts), 0)
        self.assertEqual(hypo_alerts[0]["severity"], "critical")

    # ── 7. Single-Page Clinical Audit Export ────────────────────────────────
    def test_single_page_clinical_audit_export(self):
        """Exports complete patient journey with immutable attribution and timings."""
        resp = self.client.get(f"/runs/{self.run_id}/audit-export")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("patient", data)
        self.assertIn("approval_attribution", data)
        self.assertTrue(data["approval_attribution"]["is_approved"])
        self.assertIn("clinician_modifications", data)
        self.assertIn("complete_audit_trail", data)
        self.assertGreater(len(data["complete_audit_trail"]), 0)


if __name__ == "__main__":
    unittest.main()
