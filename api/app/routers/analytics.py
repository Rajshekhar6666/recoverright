"""Clinical Analytics router for the staff dashboard."""
from fastapi import APIRouter

from app.services.analytics import calculate_clinical_analytics
from app.services.risk_tiering import get_nurse_priority_call_list, assess_patient_risk

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/clinical")
def get_clinical_analytics():
    """Returns real operational metrics, care plan progress, task distributions, and attention triage."""
    return calculate_clinical_analytics()


@router.get("/nurse-call-list")
def get_nurse_call_list():
    """Returns prioritized patient outreach list ranked by clinical risk (Gap 11/15)."""
    call_list = get_nurse_priority_call_list()
    tier_counts = {
        "red": sum(1 for p in call_list if p["risk_tier"] == "red"),
        "amber": sum(1 for p in call_list if p["risk_tier"] == "amber"),
        "green": sum(1 for p in call_list if p["risk_tier"] == "green"),
    }
    return {
        "total": len(call_list),
        "tier_summary": tier_counts,
        "patients": call_list,
    }


@router.get("/risk/{run_id}")
def get_patient_risk_assessment(run_id: str):
    """Returns the multidimensional recovery risk assessment for a specific run."""
    return assess_patient_risk(run_id)


# ── Feature: Hospital Cockpit (Shift Owner & SLA Dashboard) ─────────────────

from pydantic import BaseModel
from typing import Optional

class ShiftOwnerUpdate(BaseModel):
    nurse_name: str
    desk_phone: str
    shift_name: Optional[str] = "Day Shift"
    on_call_backup: Optional[str] = ""


@router.get("/cockpit")
def get_hospital_cockpit():
    """Returns operational hospital cockpit metrics, shift ownership, and triage SLA response times."""
    from app.services.cockpit import calculate_cockpit_metrics
    return calculate_cockpit_metrics()


@router.post("/cockpit/shift-owner")
def update_shift_owner(body: ShiftOwnerUpdate):
    """Sets the active named nurse on duty and on-call escalation contact."""
    from app.services.cockpit import set_shift_owner
    return set_shift_owner(
        nurse_name=body.nurse_name,
        desk_phone=body.desk_phone,
        shift_name=body.shift_name or "Day Shift",
        on_call_backup=body.on_call_backup or "",
    )



# ── Gap 15: Pilot Outcomes & Appointment Attendance Analytics ────────────────

@router.get("/pilot-metrics")
def get_pilot_metrics():
    """Returns pilot outcome metrics for clinical governance and research reporting.

    Gap 15 rationale: Remote monitoring alone does not always reduce readmissions
    (BEAT-HF, S10; nurse phone follow-up, S11). This endpoint reports the metrics
    that genuinely matter during a pilot:
      - Patient understanding (teach-back comprehension pass rate)
      - Medication discrepancies caught before discharge
      - Clinician time saved vs paper-based discharge process
      - Appointment attendance compliance rate

    Do NOT claim fewer readmissions until a powered trial shows it.
    """
    from app.services.storage import store
    from app.services.teach_back import get_teach_back_stats
    from app.services.risk_tiering import get_nurse_priority_call_list

    all_runs = store.list_runs()
    total_runs = len(all_runs)

    # Teach-back comprehension
    total_teach_back_sessions = 0
    total_passed = 0
    for run_meta in all_runs:
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            stats = get_teach_back_stats(run_id)
            total_teach_back_sessions += stats.get("total_sessions", 0)
            total_passed += stats.get("passed_sessions", 0)
        except Exception:
            continue

    comprehension_rate = (
        round(total_passed / total_teach_back_sessions * 100, 1)
        if total_teach_back_sessions > 0 else None
    )

    # Medication discrepancies caught (across all reconciliation checks)
    total_discrepancies_caught = 0
    for run_meta in all_runs:
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            if store.has(run_id, "medication_reconciliation.json"):
                recon = store.read(run_id, "medication_reconciliation.json")
                discrepancies = recon.get("discrepancies", [])
                # Count discrepancies that were reviewed / flagged
                total_discrepancies_caught += sum(
                    1 for d in discrepancies
                    if d.get("status") in ("changed", "stopped", "added")
                )
        except Exception:
            continue

    # Appointment attendance (from follow-up attendance log)
    total_appointments = 0
    attended_appointments = 0
    for run_meta in all_runs:
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            if store.has(run_id, "appointment_attendance.json"):
                records = store.read(run_id, "appointment_attendance.json")
                for rec in records:
                    total_appointments += 1
                    if rec.get("status") == "attended":
                        attended_appointments += 1
        except Exception:
            continue

    attendance_rate = (
        round(attended_appointments / total_appointments * 100, 1)
        if total_appointments > 0 else None
    )

    # Clinician time saved (from review timing logs)
    total_review_minutes = 0
    runs_with_timing = 0
    for run_meta in all_runs:
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            if store.has(run_id, "review_timings.json"):
                timings = store.read(run_id, "review_timings.json")
                if timings.get("total_decision_seconds"):
                    total_review_minutes += timings["total_decision_seconds"] / 60
                    runs_with_timing += 1
        except Exception:
            continue

    avg_review_minutes = (
        round(total_review_minutes / runs_with_timing, 1)
        if runs_with_timing > 0 else None
    )

    return {
        "total_patients": total_runs,
        "pilot_metrics": {
            "patient_comprehension": {
                "teach_back_sessions": total_teach_back_sessions,
                "passed": total_passed,
                "pass_rate_pct": comprehension_rate,
                "note": "Primary pilot metric: patients who can recall their plan.",
            },
            "medication_safety": {
                "discrepancies_caught": total_discrepancies_caught,
                "note": "Unintended discrepancies caught before discharge (median 53% in literature, S1).",
            },
            "appointment_compliance": {
                "total_scheduled": total_appointments,
                "attended": attended_appointments,
                "attendance_rate_pct": attendance_rate,
                "note": "Follow-up attendance; missed appointments are a readmission risk factor.",
            },
            "clinician_efficiency": {
                "avg_review_minutes_per_patient": avg_review_minutes,
                "runs_with_timing": runs_with_timing,
                "note": "Time saved vs paper discharge process; ask nurses to time-compare.",
            },
        },
        "caution": (
            "Do NOT cite readmission reduction until a powered randomised trial "
            "or robust pre-post study demonstrates it. "
            "Reference: BEAT-HF (S10) found no 180-day readmission benefit from home monitoring."
        ),
    }
