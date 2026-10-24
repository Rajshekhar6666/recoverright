"""Tests for RecoverRight Phase 3: Four-Case Live Demonstration Registry."""
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import store


class TestPhase3DemoCases(unittest.TestCase):
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

    def test_list_demo_cases(self):
        """Lists the four synthetic demonstration cases with required clinical metadata."""
        resp = self.client.get("/demo/cases")
        self.assertEqual(resp.status_code, 200)
        cases = resp.json()["cases"]
        self.assertEqual(len(cases), 4)
        ids = [c["id"] for c in cases]
        self.assertEqual(ids, ["demo_straightforward", "demo_disagreement", "demo_medication_table", "demo_ambiguous"])

    def test_case1_straightforward_can_approve_immediately(self):
        """Case 1 (Priya Sharma): Clean agreement, 0 blockers, can approve immediately."""
        load_resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(load_resp.status_code, 200)
        run_id = load_resp.json()["run_id"]
        pat_token = load_resp.json()["patient_token"]

        # Review screen
        rv = self.client.get(f"/runs/{run_id}/review").json()
        self.assertEqual(rv["blockers"], [])
        self.assertTrue(rv["can_approve"])

        # Approve directly
        ap = self.client.post(f"/runs/{run_id}/approve", json={"by": "Nurse Sunita", "role": "Registered Nurse"})
        self.assertEqual(ap.status_code, 200)
        plan = ap.json()
        self.assertEqual(plan["version"], 1)
        self.assertEqual(len(plan["items"]), 11)

        # Check patient delivery
        p_resp = self.client.get(f"/plans/{pat_token}")
        self.assertEqual(p_resp.status_code, 200)
        p_plan = p_resp.json()
        self.assertEqual(p_plan["patient_name"], "Priya Sharma")
        self.assertEqual(len(p_plan["medications"]), 3)

    def test_case2_disagreement_blocks_approval_until_decided(self):
        """Case 2 (Jane Example): Conflicting evidence blocks approval until human decisions."""
        load_resp = self.client.post("/demo/cases/demo_disagreement/load")
        self.assertEqual(load_resp.status_code, 200)
        run_id = load_resp.json()["run_id"]

        # Review screen
        rv = self.client.get(f"/runs/{run_id}/review").json()
        self.assertTrue(len(rv["blockers"]) > 0)
        self.assertFalse(rv["can_approve"])

        # Early approval refused
        early_ap = self.client.post(f"/runs/{run_id}/approve", json={"by": "Nurse"})
        self.assertEqual(early_ap.status_code, 409)

    def test_case3_complex_medication_table(self):
        """Case 3 (Vikram Malhotra): Structured multi-drug table parsed into daily schedules."""
        load_resp = self.client.post("/demo/cases/demo_medication_table/load")
        self.assertEqual(load_resp.status_code, 200)
        run_id = load_resp.json()["run_id"]
        pat_token = load_resp.json()["patient_token"]

        rv = self.client.get(f"/runs/{run_id}/review").json()
        med_fields = [f for f in rv["fields"] if f["field"]["category"] == "medications"]
        self.assertEqual(len(med_fields), 5)

        # Approve
        ap = self.client.post(f"/runs/{run_id}/approve", json={"by": "Clinical Pharmacist Dave", "role": "Clinical Pharmacist"})
        self.assertEqual(ap.status_code, 200)

        # Patient plan delivers structured schedules
        p_plan = self.client.get(f"/plans/{pat_token}").json()
        med_names = [m["name"] for m in p_plan["medications"]]
        self.assertIn("Atorvastatin", med_names)
        self.assertIn("Metoprolol Succinate", med_names)
        self.assertIn("Aspirin (Ecosprin)", med_names)

        # Tasks include scheduled times
        self.assertTrue(len(p_plan["tasks_today"]) >= 5)

    def test_case4_ambiguous_blocks_approval(self):
        """Case 4 (Margaret Chen): Missing / unverified items strictly block approval."""
        load_resp = self.client.post("/demo/cases/demo_ambiguous/load")
        self.assertEqual(load_resp.status_code, 200)
        run_id = load_resp.json()["run_id"]

        rv = self.client.get(f"/runs/{run_id}/review").json()
        self.assertFalse(rv["can_approve"])
        self.assertTrue(any(b["status"] == "rejected" for b in rv["blockers"]))

        # Attempted approval blocked
        ap_fail = self.client.post(f"/runs/{run_id}/approve", json={"by": "Nurse"})
        self.assertEqual(ap_fail.status_code, 409)

    def test_reset_all_demos(self):
        """POST /demo/reset resets all 4 demonstration runs to unapproved review state."""
        # First approve Case 1
        self.client.post("/demo/cases/demo_straightforward/load")
        self.client.post("/runs/run_demo_straightforward/approve", json={"by": "Nurse"})
        self.assertTrue(store.read("run_demo_straightforward", "meta.json")["approved"])

        # Reset all
        reset_resp = self.client.post("/demo/reset")
        self.assertEqual(reset_resp.status_code, 200)
        self.assertEqual(reset_resp.json()["reset_count"], 4)

        # Verify Case 1 is now unapproved and clean
        meta1 = store.read("run_demo_straightforward", "meta.json")
        self.assertFalse(meta1["approved"])
        self.assertEqual(meta1["status"], "needs_review")


if __name__ == "__main__":
    unittest.main()
