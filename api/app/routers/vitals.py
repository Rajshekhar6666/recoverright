"""Vital Signs, MEWS Deterioration Surveillance, and Drug-Drug Interaction Router."""
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException

from app.routers.auth import get_current_staff
from app.services.auth import StaffProfile
from app.services.ddi_engine import check_plan_interactions
from app.services.storage import store
from app.services.vitals import VitalsReadingIn, VitalsReadingRecord, get_vitals_history, record_vitals

router = APIRouter(tags=["vitals"])


def _resolve_run_id_from_token(token: str) -> str:
    """Resolves patient token or slug to internal run_id."""
    run_id = store.resolve_run_id(token)
    if not run_id and store.exists(token):
        run_id = token
    if not run_id:
        raise HTTPException(status_code=404, detail="Invalid patient token or recovery plan not found")
    return run_id


@router.post("/plans/{token}/vitals", response_model=VitalsReadingRecord)
def submit_patient_vitals(token: str, reading: VitalsReadingIn):
    """Allows a patient or caregiver to log post-discharge vital signs with instant MEWS feedback."""
    run_id = _resolve_run_id_from_token(token)
    try:
        return record_vitals(run_id, reading)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/plans/{token}/vitals", response_model=list[VitalsReadingRecord])
def get_patient_vitals(token: str):
    """Retrieves physiological vitals trend for the patient portal."""
    run_id = _resolve_run_id_from_token(token)
    return get_vitals_history(run_id)


@router.get("/runs/{run_id}/vitals")
def get_staff_run_vitals(run_id: str, staff: StaffProfile = Depends(get_current_staff)):
    """Staff cockpit endpoint for monitoring patient vitals and MEWS trend line."""
    if not store.exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    history = get_vitals_history(run_id)
    latest_reading = history[-1] if history else None
    
    return {
        "run_id": run_id,
        "total_readings": len(history),
        "latest": latest_reading.model_dump() if latest_reading else None,
        "history": [r.model_dump() for r in history],
    }


@router.get("/runs/{run_id}/medication-safety/interactions")
def get_medication_interactions(run_id: str, staff: StaffProfile = Depends(get_current_staff)):
    """Performs real-time drug-drug interaction (DDI) and contraindication safety audit."""
    if not store.exists(run_id):
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        return check_plan_interactions(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
