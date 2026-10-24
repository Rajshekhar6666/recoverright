"""Unit tests for the AI Pill Camera Scanner and verification service."""
import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.services.pill_verifier import verify_scanned_pill


class TestPillScanner(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.prescribed_meds = [
            {
                "field_id": "med_1",
                "category": "medications",
                "attrs": {
                    "name": "Paracetamol",
                    "dose": "500 mg",
                    "frequency": "Every 6 hours",
                    "instructions": "Take with a full glass of water after meals",
                    "times": ["08:00 AM", "02:00 PM", "08:00 PM"],
                },
            },
            {
                "field_id": "med_2",
                "category": "medications",
                "attrs": {
                    "name": "Amoxicillin-Clavulanate",
                    "dose": "625 mg",
                    "frequency": "Twice daily",
                    "instructions": "Complete full course as prescribed",
                    "times": ["08:00 AM", "08:00 PM"],
                },
            },
            {
                "field_id": "med_3",
                "category": "medications",
                "attrs": {
                    "name": "Pantoprazole",
                    "dose": "40 mg",
                    "frequency": "Once daily",
                    "instructions": "Take 30 minutes before breakfast",
                    "times": ["08:00 AM"],
                },
            },
        ]

    def test_verify_prescribed_paracetamol(self):
        res = verify_scanned_pill(
            self.prescribed_meds,
            raw_text="PARACETAMOL 500mg Tablets BP\nBatch No: 4910",
        )
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED_MATCH")
        self.assertEqual(res["detected_name"], "Paracetamol")
        self.assertIsNotNone(res["matched_medication"])
        self.assertEqual(res["matched_medication"]["id"], "med_1")
        self.assertIn("Paracetamol", res["spoken_summary_en"])

    def test_verify_preset_sample_amoxicillin(self):
        res = verify_scanned_pill(
            self.prescribed_meds,
            sample_id="amoxicillin_625",
        )
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED_MATCH")
        self.assertEqual(res["matched_medication"]["id"], "med_2")

    def test_unprescribed_ibuprofen_triggers_safety_warning(self):
        res = verify_scanned_pill(
            self.prescribed_meds,
            sample_id="ibuprofen_400",
        )
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "SAFETY_WARNING")
        self.assertIn("NSAID", res["safety_alert"])
        self.assertIn("सुरक्षा चेतावनी", res["safety_alert_hi"])
        self.assertEqual(res["warning_level"], "high_risk")
        self.assertIsNone(res["matched_medication"])

    def test_dosage_mismatch_detected(self):
        res = verify_scanned_pill(
            self.prescribed_meds,
            raw_text="Paracetamol 1000 mg Extra Strength",
        )
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "DOSAGE_MISMATCH")
        self.assertIn("1000 mg", res["safety_alert"])

    def test_unrecognized_text(self):
        res = verify_scanned_pill(
            self.prescribed_meds,
            raw_text="Random blurry characters 12345",
        )
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNRECOGNIZED")

    def test_api_endpoint_verified_match(self):
        resp = self.client.post(
            "/plans/pat_demo_straightforward/scan-pill",
            json={"sample_id": "paracetamol_500", "language": "en"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["verified"])
        self.assertEqual(data["status"], "VERIFIED_MATCH")
        self.assertEqual(data["detected_name"], "Paracetamol")

    def test_api_endpoint_safety_warning(self):
        resp = self.client.post(
            "/plans/pat_demo_straightforward/scan-pill",
            json={"sample_id": "ibuprofen_400", "language": "hi"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["verified"])
        self.assertEqual(data["status"], "SAFETY_WARNING")

    def test_api_endpoint_unapproved_plan_forbidden(self):
        resp = self.client.post(
            "/plans/pat_unapproved_123/scan-pill",
            json={"sample_id": "paracetamol_500"},
        )
        self.assertEqual(resp.status_code, 403)


if __name__ == "__main__":
    unittest.main()
