"""Unit tests for the clinical analytics engine and API."""
import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.services.analytics import calculate_clinical_analytics


class TestClinicalAnalytics(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_analytics_endpoint_200(self):
        response = self.client.get("/analytics/clinical")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("summary", data)
        self.assertIn("care_plan_completion", data)
        self.assertIn("task_distribution", data)
        self.assertIn("document_stages", data)
        self.assertIn("patients_requiring_attention", data)
        self.assertIn("activity_timeline", data)

        summary = data["summary"]
        self.assertIn("total_patients", summary)
        self.assertIn("patients_requiring_attention", summary)
        self.assertIn("care_plans_in_progress", summary)
        self.assertIn("avg_care_plan_completion", summary)
        self.assertIn("total_tasks", summary)
        self.assertIn("completed_tasks", summary)
        self.assertIn("pending_tasks", summary)
        self.assertIn("overdue_tasks", summary)

    def test_mock_analytics_calculation(self):
        mock_runs = [
            {
                "run_id": "run_test_1",
                "status": "approved",
                "approved": True,
                "created_at": "2026-10-23T10:00:00Z",
                "patient": {"name": "Priya Sharma", "procedure": "Cholecystectomy"}
            },
            {
                "run_id": "run_test_2",
                "status": "needs_review",
                "approved": False,
                "created_at": "2026-10-23T11:00:00Z",
                "counts": {"review": 2},
                "patient": {"name": "Rahul Verma", "procedure": "Appendectomy"}
            }
        ]
        res = calculate_clinical_analytics(mock_runs)
        self.assertEqual(res["summary"]["total_patients"], 2)
        self.assertEqual(res["summary"]["care_plans_in_progress"], 1)
        self.assertEqual(res["document_stages"]["approved"], 1)
        self.assertEqual(res["document_stages"]["needs_review"], 1)

        # Rahul Verma needs review -> should be in attention list
        attn_names = [a["name"] for a in res["patients_requiring_attention"]]
        self.assertIn("Rahul Verma", attn_names)


if __name__ == "__main__":
    unittest.main()
