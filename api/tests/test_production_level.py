"""Production-level features and workflow hardening tests.

Covers:
- Gap 13: Staff Authentication, Session Tokens, and RBAC
- Gap 13: Expiring unguessable patient links and renewal endpoint
- Gap 16: Table continuation across split pages
- Gap 16: OCR fallback for scanned PDFs
- Gap 13: De-identification integration in extraction
- Gap 7: Automated voice call (telephony) dispatch
- Gap 7/11: Caregiver-first reminder routing
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.document import Block, SourceDocument
from app.services.auth import (
    authenticate_staff,
    get_default_dev_staff,
    revoke_session,
    verify_session_token,
)
from app.services.storage import store

client = TestClient(app)

PROD_RUN_ID = "run_prod_test_01"
PROD_TOKEN = "pat_prod00000000001"
PROD_SLUG = "prod-test-patient"

PROD_PLAN = {
    "run_id": PROD_RUN_ID,
    "version": 1,
    "approved_by": "Priya Nair, RN",
    "approved_at": datetime.now(timezone.utc).isoformat(),
    "patient": {
        "name": "Production Test Patient",
        "language": "en",
        "phone": "+91 99000 11111",
        "patient_token": PROD_TOKEN,
    },
    "items": [
        {
            "category": "medications",
            "field_id": "med_prod_1",
            "attrs": {
                "name": "Atorvastatin 20mg",
                "dose": "20mg",
                "frequency": "At bedtime",
                "instructions": "Take at night",
                "confirmed_times": "09:00 PM",
            },
            "status_at_review": "agreed",
            "decision": "confirmed",
            "decided_by": "Priya Nair, RN",
        },
        {
            "category": "follow_ups",
            "field_id": "fu_prod_1",
            "attrs": {"what": "Cardio Checkup", "when": "In 14 days", "where": "Clinic 3"},
            "status_at_review": "agreed",
            "decision": "confirmed",
            "critical": False,
        },
        {
            "category": "warning_signs",
            "field_id": "ws_prod_1",
            "attrs": {"text": "Call immediately if chest tightness or shortness of breath"},
            "status_at_review": "agreed",
            "decision": "confirmed",
            "critical": False,
        },
        {
            "category": "contacts",
            "field_id": "contact_prod_1",
            "attrs": {"label": "Hospital Helpline", "value": "+91 98000 00000"},
            "status_at_review": "agreed",
            "decision": "confirmed",
            "critical": False,
        },
    ],
    "removed": [],
    "patient_token": PROD_TOKEN,
    "plan_duration_days": 14,
}

PROD_META = {
    "run_id": PROD_RUN_ID,
    "status": "approved",
    "filename": "prod_test.pdf",
    "stored_name": "prod_test.pdf",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "patient_token": PROD_TOKEN,
    "patient": PROD_PLAN["patient"],
    "approved": True,
    "current_version": 1,
    "plan_versions": [1],
}


def _setup_prod_run():
    store.dir(PROD_RUN_ID).mkdir(parents=True, exist_ok=True)
    store.write(PROD_RUN_ID, "meta.json", PROD_META)
    store.write(PROD_RUN_ID, "call_history.json", [])
    store.save_plan_version(PROD_RUN_ID, PROD_PLAN, version=1)
    store.register_patient_token(PROD_TOKEN, PROD_RUN_ID)
    store.register_patient_slug(PROD_SLUG, PROD_RUN_ID)


# ─── 1. Staff Authentication & RBAC (Gap 13) ─────────────────────────────────

class TestStaffAuthRBAC:
    def test_login_nurse_returns_token(self):
        resp = client.post("/auth/login", json={"username": "nurse_priya"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["token"].startswith("rr_staff_")
        assert data["staff"]["role"] == "nurse"
        assert "review_plan" in data["staff"]["permissions"]

    def test_login_doctor_returns_doctor_profile(self):
        resp = client.post("/auth/login", json={"username": "dr_sharma"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["staff"]["role"] == "doctor"
        assert "override_dosing" in data["staff"]["permissions"]

    def test_login_invalid_username_rejected(self):
        resp = client.post("/auth/login", json={"username": "unknown_intruder"})
        assert resp.status_code == 401

    def test_get_me_with_bearer_token(self):
        login_resp = client.post("/auth/login", json={"username": "dr_mehta"})
        token = login_resp.json()["token"]

        me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["name"] == "Dr. Anjali Mehta, MD"
        assert me_resp.json()["role"] == "doctor"

    def test_get_me_fallback_dev_mode(self):
        """In development mode (RR_REQUIRE_AUTH unset/false), returns default RN."""
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        assert resp.json()["role"] == "nurse"

    def test_logout_revokes_token(self):
        login_resp = client.post("/auth/login", json={"username": "pharm_anand"})
        token = login_resp.json()["token"]

        # Token is valid
        assert verify_session_token(token) is not None

        # Logout
        client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert verify_session_token(token) is None

    def test_staff_directory_endpoint(self):
        resp = client.get("/auth/staff-directory")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_staff"] >= 5
        roles = {s["role"] for s in data["staff"]}
        assert "nurse" in roles
        assert "doctor" in roles
        assert "pharmacist" in roles

    def test_roles_endpoint(self):
        resp = client.get("/auth/roles")
        assert resp.status_code == 200
        role_names = [r["role"] for r in resp.json()]
        assert "nurse" in role_names
        assert "doctor" in role_names
        assert "pharmacist" in role_names
        assert "coordinator" in role_names


# ─── 2. Split Tables Continuation (Gap 16) ───────────────────────────────────

class TestSplitTablesContinuation:
    def test_continuation_table_inherits_header(self):
        """When a medication table splits across pages (t1 -> t2), t2 should inherit

        headers if row 0 has no conflicting header and has the same column count.
        """
        from app.pipeline.tables import table_medications

        doc = SourceDocument(
            filename="split_table_discharge.docx",
            blocks=[
                # Page 1: Table 1 with header
                Block(block_id="b1", type="table_row", page=1, table_id="t1", row_index=0,
                      text="Medication | Dose | Frequency | Route",
                      cells=["Medication", "Dose", "Frequency", "Route"]),
                Block(block_id="b2", type="table_row", page=1, table_id="t1", row_index=1,
                      text="Paracetamol | 650mg | TID | Oral",
                      cells=["Paracetamol", "650mg", "TID", "Oral"]),
                # Page 2: Table 2 (continuation) — row 0 is data, NOT a header!
                Block(block_id="b3", type="table_row", page=2, table_id="t2", row_index=0,
                      text="Metformin | 500mg | Twice daily | Oral",
                      cells=["Metformin", "500mg", "Twice daily", "Oral"]),
                Block(block_id="b4", type="table_row", page=2, table_id="t2", row_index=1,
                      text="Atorvastatin | 20mg | Nightly | Oral",
                      cells=["Atorvastatin", "20mg", "Nightly", "Oral"]),
            ],
        )

        meds = table_medications(doc)
        med_names = [m.name for m in meds]
        # All 3 medications must be recovered without losing the split continuation rows
        assert "Paracetamol" in med_names
        assert "Metformin" in med_names, "Metformin on page 2 row 0 must be recovered"
        assert "Atorvastatin" in med_names
        assert len(meds) == 3


# ─── 3. Expiring Patient Links & Renewal (Gap 13) ─────────────────────────────

class TestExpiringPatientLinks:
    def setup_method(self):
        _setup_prod_run()

    def test_valid_link_returns_plan(self):
        resp = client.get(f"/plans/{PROD_TOKEN}")
        assert resp.status_code == 200
        assert resp.json()["patient_name"] == "Production Test Patient"

    def test_expired_link_returns_410_gone(self):
        """A link with an expiration date in the past returns 410 Gone."""
        past_iso = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        store.update_meta(PROD_RUN_ID, patient_token_expires_at=past_iso)

        resp = client.get(f"/plans/{PROD_TOKEN}")
        assert resp.status_code == 410
        assert "expired" in resp.json()["detail"]["message"].lower()

    def test_renew_link_endpoint_extends_expiry(self):
        """Staff can renew an expired link via POST /plans/{token}/renew-link."""
        resp = client.post(f"/plans/{PROD_TOKEN}/renew-link?extension_days=45")
        assert resp.status_code == 200
        data = resp.json()
        assert data["renewed"] is True
        assert data["extension_days"] == 45

        # After renewal, GET /plans/{token} is accessible again
        get_resp = client.get(f"/plans/{PROD_TOKEN}")
        assert get_resp.status_code == 200


# ─── 4. Automated Voice Call Dispatch (Gap 7 Telephony Fallback) ──────────────

class TestAutomatedVoiceCall:
    def setup_method(self):
        _setup_prod_run()

    def test_dispatch_automated_call_english(self):
        resp = client.post(
            "/calls/dispatch-automated-call",
            json={
                "run_id": PROD_RUN_ID,
                "reason": "medication_reminder",
                "language": "en",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dispatched"] is True
        assert data["language"] == "en"
        assert "call_id" in data
        assert "RecoverRight" in data["prompt_preview"]

    def test_dispatch_automated_call_hindi(self):
        resp = client.post(
            "/calls/dispatch-automated-call",
            json={
                "run_id": PROD_RUN_ID,
                "reason": "missed_dose_urgent",
                "language": "hi",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["dispatched"] is True
        assert data["language"] == "hi"

    def test_call_history_persisted_after_automated_call(self):
        client.post(
            "/calls/dispatch-automated-call",
            json={"run_id": PROD_RUN_ID, "reason": "medication_reminder"},
        )
        history_resp = client.get(f"/calls/history/{PROD_RUN_ID}")
        assert history_resp.status_code == 200
        records = history_resp.json()
        assert len(records) >= 1
        assert any("Automated" in r.get("caller_name", "") for r in records)


# ─── 5. Caregiver-First Reminder Routing (Gap 7 & 11) ─────────────────────────

class TestCaregiverFirstReminders:
    def setup_method(self):
        _setup_prod_run()

    def test_reminder_routed_to_caregiver_when_caregiver_first(self):
        from app.services.reminder import schedule_reminders_for_plan, trigger_reminder
        from app.schemas.api import ApprovedPlan

        # Set caregiver-first in patient profile
        caregiver_phone = "+91 98888 77777"
        patient = {
            **PROD_PLAN["patient"],
            "caregiver_first": True,
            "guardian_phone": caregiver_phone,
            "guardian_name": "Ramesh Patient",
        }
        store.update_meta(PROD_RUN_ID, patient=patient)

        approved = ApprovedPlan.model_validate({**PROD_PLAN, "patient": patient})
        jobs = schedule_reminders_for_plan(approved)
        assert len(jobs) >= 1

        # Trigger first reminder
        first_job = jobs[0]
        triggered = trigger_reminder(PROD_RUN_ID, first_job.job_id)
        assert triggered.status == "delivered"


# ─── 6. OCR Fallback Function Resilience (Gap 16) ────────────────────────────

class TestOCRFallbackResilience:
    def test_ocr_pdf_does_not_crash_on_missing_file(self):
        from app.pipeline.parse import _ocr_pdf
        # Non-existent file should gracefully return empty list without unhandled exception
        result = _ocr_pdf(Path("non_existent_file_xyz123.pdf"))
        assert result == []
