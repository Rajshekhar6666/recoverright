"""Vital Signs and Modified Early Warning Score (MEWS) Clinical Service.

Clinical Context & Safety:
Post-discharge clinical deterioration is often preceded by physiological derangements
several hours before acute collapse. Calculating the Modified Early Warning Score (MEWS)
provides an objective threshold to trigger automated care team notifications before ICU readmission.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.help_store import help_store
from app.services.storage import store


class VitalsReadingIn(BaseModel):
    systolic_bp: int = Field(..., ge=40, le=300, description="Systolic Blood Pressure (mmHg)")
    diastolic_bp: Optional[int] = Field(None, ge=20, le=200, description="Diastolic Blood Pressure (mmHg)")
    heart_rate: int = Field(..., ge=20, le=250, description="Heart Rate (bpm)")
    respiratory_rate: int = Field(16, ge=4, le=60, description="Respiratory Rate (breaths/min)")
    temperature: float = Field(..., ge=30.0, le=115.0, description="Body Temperature (C or F)")
    temperature_unit: Literal["C", "F"] = "C"
    spo2: int = Field(98, ge=50, le=100, description="Blood Oxygen Saturation (%)")
    consciousness: Literal["Alert", "Voice", "Pain", "Unresponsive"] = "Alert"
    notes: Optional[str] = None
    taken_by: str = "patient"  # "patient", "caregiver", "visiting_nurse"


class VitalsReadingRecord(BaseModel):
    id: str
    run_id: str
    recorded_at: str
    systolic_bp: int
    diastolic_bp: Optional[int]
    heart_rate: int
    respiratory_rate: int
    temperature_c: float
    temperature_f: float
    spo2: int
    consciousness: str
    mews_score: int
    risk_level: Literal["normal", "low_medium", "medium_high", "critical"]
    clinical_guidance: str
    escalation_triggered: bool
    notes: Optional[str]
    taken_by: str


def calculate_mews(
    systolic_bp: int,
    heart_rate: int,
    respiratory_rate: int,
    temp_c: float,
    consciousness: str,
    spo2: int,
) -> tuple[int, Literal["normal", "low_medium", "medium_high", "critical"], str]:
    """Calculates Modified Early Warning Score (MEWS) and determines clinical risk."""
    score = 0

    # Systolic BP
    if systolic_bp <= 70:
        score += 3
    elif systolic_bp <= 80:
        score += 2
    elif systolic_bp <= 100:
        score += 1
    elif systolic_bp >= 200:
        score += 2

    # Heart Rate
    if heart_rate < 40:
        score += 2
    elif heart_rate <= 50:
        score += 1
    elif heart_rate <= 100:
        score += 0
    elif heart_rate <= 110:
        score += 1
    elif heart_rate <= 129:
        score += 2
    else:
        score += 3

    # Respiratory Rate
    if respiratory_rate < 9:
        score += 2
    elif respiratory_rate <= 20:
        score += 0
    elif respiratory_rate <= 29:
        score += 2
    else:
        score += 3

    # Temperature (Celsius)
    if temp_c < 35.0:
        score += 2
    elif temp_c >= 38.5:
        score += 2

    # Consciousness / Neurological State
    if consciousness == "Voice":
        score += 1
    elif consciousness == "Pain":
        score += 2
    elif consciousness == "Unresponsive":
        score += 3

    # SpO2
    if spo2 < 92:
        score += 3
    elif spo2 <= 93:
        score += 2
    elif spo2 <= 95:
        score += 1

    # Risk Level & Guidance
    if score >= 7 or spo2 < 90 or systolic_bp <= 70:
        risk = "critical"
        guidance = "CRITICAL ALERT: Immediate clinician review required. Emergency response triggered."
    elif score >= 5:
        risk = "medium_high"
        guidance = "Elevated risk. Ward nurse or triage coordinator informed for follow-up review."
    elif score >= 3:
        risk = "low_medium"
        guidance = "Mild physiological derangement. Re-evaluate vitals in 4 hours."
    else:
        risk = "normal"
        guidance = "Vital signs within normal post-operative target parameters. Continue plan."

    return score, risk, guidance


def record_vitals(run_id: str, reading: VitalsReadingIn) -> VitalsReadingRecord:
    """Records a patient vitals observation, computes MEWS, and triggers auto-escalations."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    # Standardize temperature
    if reading.temperature_unit == "F":
        temp_f = round(reading.temperature, 1)
        temp_c = round((reading.temperature - 32) * 5 / 9, 1)
    else:
        temp_c = round(reading.temperature, 1)
        temp_f = round(reading.temperature * 9 / 5 + 32, 1)

    mews_score, risk, guidance = calculate_mews(
        reading.systolic_bp,
        reading.heart_rate,
        reading.respiratory_rate,
        temp_c,
        reading.consciousness,
        reading.spo2,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    record_id = f"vit_{uuid.uuid4().hex[:8]}"
    escalation_triggered = False

    # Auto-escalation if critical or high MEWS
    if risk in ("critical", "medium_high"):
        escalation_triggered = True
        try:
            help_store.create(
                run_id=run_id,
                heard=f"Vitals Alert: MEWS={mews_score} ({risk.upper()}). BP={reading.systolic_bp}/{reading.diastolic_bp or '-'} HR={reading.heart_rate} SpO2={reading.spo2}% Temp={temp_c}C",
                severity="critical" if risk == "critical" else "concern",
                label="Abnormal Vitals Deterioration",
                source="button",
                patient_name="Patient",
            )
        except Exception:
            pass

    record = VitalsReadingRecord(
        id=record_id,
        run_id=run_id,
        recorded_at=now_iso,
        systolic_bp=reading.systolic_bp,
        diastolic_bp=reading.diastolic_bp,
        heart_rate=reading.heart_rate,
        respiratory_rate=reading.respiratory_rate,
        temperature_c=temp_c,
        temperature_f=temp_f,
        spo2=reading.spo2,
        consciousness=reading.consciousness,
        mews_score=mews_score,
        risk_level=risk,
        clinical_guidance=guidance,
        escalation_triggered=escalation_triggered,
        notes=reading.notes,
        taken_by=reading.taken_by,
    )

    # Persist in run storage
    records = get_vitals_history(run_id)
    records.append(record)
    store.write(run_id, "vitals_history.json", [r.model_dump() for r in records])

    # Emit telemetry event
    bus.emit(run_id, Stage.PATIENT, "vitals.recorded", {
        "vitals_id": record_id,
        "mews": mews_score,
        "risk": risk,
        "escalated": escalation_triggered,
    })

    store.audit(run_id, reading.taken_by, "vitals.recorded", mews=mews_score, risk=risk)
    return record


def get_vitals_history(run_id: str) -> list[VitalsReadingRecord]:
    """Retrieves all past vitals readings for a given run."""
    if not store.has(run_id, "vitals_history.json"):
        return []
    raw = store.read(run_id, "vitals_history.json")
    return [VitalsReadingRecord.model_validate(r) for r in raw]
