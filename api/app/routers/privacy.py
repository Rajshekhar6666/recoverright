"""Privacy, Informed Consent, and Cryptographic Audit Integrity Router."""
from typing import Any
from fastapi import APIRouter, HTTPException

from app.services.audit_chain import verify_audit_chain_integrity
from app.services.privacy import (
    ConsentPreferenceUpdate,
    PrivacyPolicyDisclosure,
    export_patient_data_bundle,
    get_patient_consent,
    get_privacy_policy,
    update_patient_consent,
)
from app.services.storage import store

router = APIRouter(prefix="/privacy", tags=["privacy"])


def _resolve_run_id(token: str) -> str:
    run_id = store.resolve_run_id(token)
    if not run_id and store.exists(token):
        run_id = token
    if not run_id:
        raise HTTPException(status_code=404, detail="Patient recovery record not found")
    return run_id


@router.get("/policy", response_model=PrivacyPolicyDisclosure)
def get_privacy_and_security_policy():
    """Returns statutory privacy guarantees, zero-audio retention policy, and compliance standards."""
    return get_privacy_policy()


@router.get("/consent/{token}")
def get_consent_status(token: str):
    """Retrieves current patient informed consent and privacy preferences."""
    run_id = _resolve_run_id(token)
    try:
        return get_patient_consent(run_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/consent/{token}")
def update_consent_preferences(token: str, prefs: ConsentPreferenceUpdate):
    """Updates patient informed consent choices with cryptographic audit timestamp."""
    run_id = _resolve_run_id(token)
    try:
        return update_patient_consent(run_id, prefs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/audit-integrity/{token}")
def verify_patient_audit_integrity(token: str):
    """Cryptographically verifies that the clinical audit trail has not been tampered with."""
    run_id = _resolve_run_id(token)
    try:
        return verify_audit_chain_integrity(run_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/export/{token}")
def export_patient_data(token: str):
    """Exports all patient clinical data in compliance with DISHA/ABDM data portability."""
    run_id = _resolve_run_id(token)
    try:
        return export_patient_data_bundle(run_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
