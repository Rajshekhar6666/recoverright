"""Tests for Privacy Policies, Tamper-Evident Audit Hash Chain, and Patient OTP/Session Security."""
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.audit_chain import append_cryptographic_audit, verify_audit_chain_integrity
from app.services.patient_auth import _check_rate_limit, request_patient_otp, verify_patient_otp
from app.services.storage import store

client = TestClient(app)


@pytest.fixture
def mock_patient_record():
    uid = uuid.uuid4().hex[:8]
    run_id = f"test_run_sec_{uid}"
    token = f"pat_token_sec_{uid}"
    store.register_patient_token(token, run_id)
    
    meta = {
        "run_id": run_id,
        "patient": {"name": "Kamala Devi", "phone": "9876540000", "guardian_phone": "9876541111"},
        "status": "approved",
    }
    store.write(run_id, "meta.json", meta)

    plan = {
        "run_id": run_id,
        "patient_name": "Kamala Devi",
        "medications": [{"name": "Amlodipine", "dose": "5mg"}],
        "instructions": {},
    }
    store.save_plan_version(run_id, plan, version=1)
    yield run_id, token


def test_cryptographic_audit_chain_integrity(mock_patient_record):
    run_id, _ = mock_patient_record

    # Append 3 cryptographic entries
    e1 = append_cryptographic_audit(run_id, "nurse_priya", "plan.reviewed", field="medications")
    e2 = append_cryptographic_audit(run_id, "dr_sharma", "plan.approved", version=1)
    e3 = append_cryptographic_audit(run_id, "patient", "dose.taken", med="Amlodipine")

    assert e1.index == 0
    assert e2.prev_hash == e1.entry_hash
    assert e3.prev_hash == e2.entry_hash

    # Verify integrity
    verif = verify_audit_chain_integrity(run_id)
    assert verif["is_valid"] is True
    assert verif["total_entries"] == 3

    # Tamper test: manually alter entry 1 on disk
    entries = store.read(run_id, "audit_chain.json")
    entries[1]["data"]["version"] = 999  # Unauthorized retroactive edit
    store.write(run_id, "audit_chain.json", entries)

    tampered_verif = verify_audit_chain_integrity(run_id)
    assert tampered_verif["is_valid"] is False
    assert tampered_verif["tampered_at_index"] == 1
    assert "Hash mismatch" in tampered_verif["message"]


def test_privacy_policy_endpoint():
    res = client.get("/privacy/policy")
    assert res.status_code == 200
    data = res.json()
    assert "DISHA" in str(data["governing_regulations"])
    assert "ABDM" in str(data["governing_regulations"])
    assert any("RAM" in g for g in data["data_minimization_guarantees"])
    assert data["data_retention_policy"]["statutory_discharge_records"]


def test_consent_and_data_export_endpoints(mock_patient_record):
    run_id, token = mock_patient_record

    # 1. Default consent status
    res_get = client.get(f"/privacy/consent/{token}")
    assert res_get.status_code == 200
    assert res_get.json()["background_voice_safety"] is True

    # 2. Update consent preferences
    res_update = client.post(f"/privacy/consent/{token}", json={
        "background_voice_safety": False,
        "caregiver_access": True,
        "sms_notifications": True,
        "whatsapp_notifications": False,
        "vitals_telemetry": True,
    })
    assert res_update.status_code == 200
    assert res_update.json()["preferences"]["background_voice_safety"] is False

    # 3. Audit integrity endpoint
    res_audit = client.get(f"/privacy/audit-integrity/{token}")
    assert res_audit.status_code == 200
    assert res_audit.json()["is_valid"] is True

    # 4. Data export endpoint
    res_exp = client.get(f"/privacy/export/{token}")
    assert res_exp.status_code == 200
    exp_data = res_exp.json()
    assert exp_data["patient_profile"]["name"] == "Kamala Devi"
    assert "export_metadata" in exp_data


def test_patient_otp_request_and_verification(mock_patient_record):
    _, _ = mock_patient_record
    test_phone = "9876540000"

    # 1. Request OTP
    res_req = client.post("/auth/patient/request-otp", json={"phone": test_phone})
    assert res_req.status_code == 200
    assert res_req.json()["status"] == "otp_sent"

    # 2. Wrong OTP fails with 401
    res_bad = client.post("/auth/patient/verify-otp", json={"phone": test_phone, "otp_code": "000000"})
    assert res_bad.status_code == 401

    # 3. Correct OTP issues session token
    # (Phone ending in 0000 generates deterministic test OTP 123456)
    res_ok = client.post("/auth/patient/verify-otp", json={"phone": test_phone, "otp_code": "123456"})
    assert res_ok.status_code == 200
    sess = res_ok.json()
    assert sess["session_token"].startswith("psess_")
    assert sess["patient_name"] == "Kamala Devi"

    # 4. Access protected /auth/patient/me
    token_header = sess["session_token"]
    res_me = client.get("/auth/patient/me", headers={"Authorization": f"Bearer {token_header}"})
    assert res_me.status_code == 200
    assert res_me.json()["patient_name"] == "Kamala Devi"

    # 5. Invalid token rejected with 401
    res_bad_token = client.get("/auth/patient/me", headers={"Authorization": "Bearer psess_invalid"})
    assert res_bad_token.status_code == 401
