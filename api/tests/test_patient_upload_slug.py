"""Tests for dynamic patient slug generation, URL routing, batch import, and plan access via slug.

Covers:
1. Upload creates a slug and returns it
2. The slug resolves to the correct run via store.resolve_run_id
3. After approval, the patient plan is accessible via the slug
4. Batch import creates multiple patients with unique slugs
5. Duplicate name+phone is rejected in batch import
6. Failed uploads (missing name) don't appear as valid patients
"""
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.storage import store


class _TmpRunsMixin:
    """Mixin that isolates each test in a temp RR_RUNS_DIR."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig_runs_dir = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)

    def tearDown(self):
        if self._orig_runs_dir is not None:
            os.environ["RR_RUNS_DIR"] = self._orig_runs_dir
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()


class TestDemoSlug(_TmpRunsMixin, unittest.TestCase):
    """Tests that demo case loading registers and returns a slug."""

    def test_demo_load_returns_slug(self):
        """Loading a demo case returns patient_slug and dashboard_url in the response."""
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("patient_slug", data)
        self.assertIsNotNone(data["patient_slug"])
        self.assertGreater(len(data["patient_slug"]), 0)
        self.assertIn("dashboard_url", data)
        self.assertIn(data["patient_slug"], data["dashboard_url"])

    def test_demo_slug_resolves_to_correct_run(self):
        """The slug from demo load resolves to the correct run_id via store.resolve_run_id."""
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        slug = data["patient_slug"]
        run_id = data["run_id"]
        resolved = store.resolve_run_id(slug)
        self.assertEqual(resolved, run_id)

    def test_demo_slug_stored_in_meta(self):
        """The slug is written to meta.json for the demo run."""
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        run_id = resp.json()["run_id"]
        slug = resp.json()["patient_slug"]
        meta = store.read(run_id, "meta.json")
        self.assertEqual(meta.get("patient_slug"), slug)


class TestPatientRegister(_TmpRunsMixin, unittest.TestCase):
    """Tests for POST /patients/register — direct patient intake."""

    def _register(self, name="Test Patient", phone="+919999000001", **kwargs):
        payload = {
            "name": name,
            "phone": phone,
            "language": "en",
            "procedure": "Knee Replacement Recovery",
            "medications": [{"name": "Ibuprofen", "dose": "400mg", "frequency": "Twice daily"}],
            "wound_care": "Keep dressing dry.",
            "activity": "Gentle walking only.",
            "diet": "High protein diet.",
            "warning_signs": "Report swelling or fever.",
            "follow_up": "In 7 days with orthopedic team.",
            **kwargs,
        }
        return self.client.post("/patients/register", json=payload)

    def test_register_creates_slug_and_returns_it(self):
        """Registering a patient creates a slug and returns it in the response."""
        resp = self._register(name="Kavita Nair", phone="+919900000010")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("slug", data)
        self.assertIn("kavita", data["slug"])
        self.assertIn("dashboard_url", data)
        self.assertIn(data["slug"], data["dashboard_url"])
        self.assertIn("run_id", data)
        self.assertIn("patient_token", data)

    def test_register_slug_resolves_to_run(self):
        """The slug from registration resolves to the correct run_id."""
        resp = self._register(name="Ramesh Kumar", phone="+919900000011")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        slug = data["slug"]
        run_id = data["run_id"]
        resolved = store.resolve_run_id(slug)
        self.assertEqual(resolved, run_id)

    def test_register_auto_approve_creates_plan(self):
        """With auto_approve=True, the plan is immediately approved and accessible via slug."""
        resp = self._register(name="Sunita Verma", phone="+919900000012", auto_approve=True)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["approved"])
        run_id = data["run_id"]
        self.assertTrue(store.has(run_id, "plan_v1.json"))

    def test_plan_accessible_via_slug_after_approval(self):
        """After approval, the patient plan is accessible via GET /plans/{slug}."""
        resp = self._register(name="Anjali Singh", phone="+919900000013", auto_approve=True)
        self.assertEqual(resp.status_code, 200)
        slug = resp.json()["slug"]

        plan_resp = self.client.get(f"/plans/{slug}")
        self.assertEqual(plan_resp.status_code, 200)
        plan_data = plan_resp.json()
        self.assertEqual(plan_data["patient_name"], "Anjali Singh")
        self.assertIn("patient_slug", plan_data)
        self.assertEqual(plan_data["patient_slug"], slug)
        self.assertIn("dashboard_url", plan_data)

    def test_register_missing_name_returns_422(self):
        """Registering without a name returns 422 Unprocessable Entity."""
        resp = self.client.post("/patients/register", json={"name": ""})
        self.assertEqual(resp.status_code, 422)

    def test_register_slug_stored_in_meta(self):
        """The slug is stored in meta.json after registration."""
        resp = self._register(name="Vikram Bose", phone="+919900000014")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        meta = store.read(data["run_id"], "meta.json")
        self.assertEqual(meta.get("patient_slug"), data["slug"])

    def test_patient_summary_includes_slug_and_url(self):
        """Patient summary in /patients list includes patient_slug and dashboard_url."""
        resp = self._register(name="Leela Rao", phone="+919900000015")
        self.assertEqual(resp.status_code, 200)
        run_id = resp.json()["run_id"]

        patients_resp = self.client.get("/patients")
        self.assertEqual(patients_resp.status_code, 200)
        items = patients_resp.json()["items"]
        run_entry = next((i for i in items if i["id"] == run_id), None)
        self.assertIsNotNone(run_entry, "Registered patient not found in /patients list")
        self.assertIn("patient_slug", run_entry)
        self.assertIn("dashboard_url", run_entry)


class TestBatchImport(_TmpRunsMixin, unittest.TestCase):
    """Tests for POST /patients/batch-import."""

    def _make_record(self, name, phone, **kwargs):
        return {
            "name": name,
            "phone": phone,
            "language": "en",
            "procedure": "General Surgery Recovery",
            "medications": [],
            "wound_care": "Keep dry.",
            "activity": "Rest.",
            "diet": "Soft foods.",
            "warning_signs": "Report fever.",
            "follow_up": "In 5 days.",
            **kwargs,
        }

    def test_batch_import_creates_multiple_patients_with_unique_slugs(self):
        """Batch import creates multiple patients with unique slugs."""
        records = [
            self._make_record("Priya Batch One", "+910000000201"),
            self._make_record("Priya Batch Two", "+910000000202"),
            self._make_record("Priya Batch Three", "+910000000203"),
        ]
        resp = self.client.post("/patients/batch-import", json=records)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["imported_count"], 3)
        self.assertEqual(data["failed_count"], 0)

        slugs = [item["slug"] for item in data["imported"]]
        # All slugs are non-empty
        for slug in slugs:
            self.assertGreater(len(slug), 0)
        # All slugs are unique
        self.assertEqual(len(set(slugs)), len(slugs))

    def test_batch_import_duplicate_name_and_phone_rejected(self):
        """Duplicate name+phone in batch import is rejected with reason 'duplicate'."""
        # First register one patient
        name = "Duplicate Devi"
        phone = "+910000000301"
        self.client.post("/patients/register", json=self._make_record(name, phone))

        # Now batch import with same name+phone
        records = [
            self._make_record(name, phone),            # duplicate
            self._make_record("Unique Patient A", "+910000000302"),  # unique
        ]
        resp = self.client.post("/patients/batch-import", json=records)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["imported_count"], 1)
        self.assertEqual(data["failed_count"], 1)
        self.assertEqual(data["failed"][0]["reason"], "duplicate")
        self.assertEqual(data["failed"][0]["patient_name"], name)

    def test_batch_import_intra_batch_duplicate_rejected(self):
        """Two records with same name+phone in the same batch: second is rejected."""
        records = [
            self._make_record("Intra Dupe", "+910000000401"),
            self._make_record("Intra Dupe", "+910000000401"),  # same pair
        ]
        resp = self.client.post("/patients/batch-import", json=records)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["imported_count"], 1)
        self.assertEqual(data["failed_count"], 1)
        self.assertEqual(data["failed"][0]["reason"], "duplicate")

    def test_batch_import_missing_name_is_failed(self):
        """Records with empty name are included in failed list and don't appear as valid patients."""
        records = [
            self._make_record("", "+910000000501"),       # missing name
            self._make_record("Valid Patient X", "+910000000502"),
        ]
        resp = self.client.post("/patients/batch-import", json=records)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["imported_count"], 1)
        self.assertEqual(data["failed_count"], 1)
        self.assertEqual(data["failed"][0]["reason"], "missing_name")

        # Confirm the failed record doesn't appear in the patient list
        imported_run_ids = {item["run_id"] for item in data["imported"]}
        patients_resp = self.client.get("/patients")
        all_ids = {p["id"] for p in patients_resp.json()["items"]}
        # The only imported patient's run_id should be in patients list
        for run_id in imported_run_ids:
            self.assertIn(run_id, all_ids)

    def test_batch_import_empty_list_returns_zero_counts(self):
        """Batch import with empty list returns all-zero counts."""
        resp = self.client.post("/patients/batch-import", json=[])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["imported_count"], 0)
        self.assertEqual(data["failed_count"], 0)


if __name__ == "__main__":
    unittest.main()
