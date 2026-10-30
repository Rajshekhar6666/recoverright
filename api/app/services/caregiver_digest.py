"""Caregiver Daily Recovery Digest & Family Circle Health Summary Service."""
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel

from app.services.storage import store
from app.services.vitals import get_vitals_history


class CaregiverDailyDigest(BaseModel):
    run_id: str
    patient_name: str
    generated_at: str
    adherence_percentage: int
    doses_taken: int
    total_scheduled_doses: int
    latest_mews_score: Optional[int]
    vitals_status: str
    symptoms_reported_24h: list[str]
    next_follow_up: Optional[dict[str, str]]
    caregiver_action_items: list[str]
    care_team_contact: str


def generate_caregiver_digest(run_id: str) -> CaregiverDailyDigest:
    """Generates an actionable daily health summary for the designated family caregiver."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found")

    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient_name = meta.get("patient", {}).get("name", "Your family member")

    # 1. Adherence calculation
    reminders = store.get_reminders(run_id)
    total_doses = len(reminders)
    taken_doses = sum(1 for r in reminders if r.get("status") in ("acknowledged", "taken"))
    adherence_pct = int((taken_doses / total_doses * 100)) if total_doses > 0 else 100

    # 2. Vitals & MEWS
    vitals = get_vitals_history(run_id)
    latest_vitals = vitals[-1] if vitals else None
    latest_mews = latest_vitals.mews_score if latest_vitals else None
    vitals_status = latest_vitals.clinical_guidance if latest_vitals else "No vitals logged yet today."

    # 3. Next appointment
    plan = store.get_plan_version(run_id) or {}
    follow_ups = plan.get("follow_ups", [])
    next_fu = None
    if follow_ups:
        first = follow_ups[0]
        next_fu = {
            "what": first.get("what", "Follow-up visit"),
            "when": first.get("when", "Upcoming"),
            "where": first.get("where", "Hospital Clinic"),
        }

    # 4. Caregiver Action Checklist
    actions: list[str] = []
    if adherence_pct < 100:
        actions.append("Ensure evening medication doses are confirmed.")
    if not vitals:
        actions.append("Assist patient with logging today's blood pressure and pulse.")
    if next_fu:
        actions.append(f"Arrange transportation for upcoming visit: {next_fu['what']} ({next_fu['when']}).")
    actions.append("Inspect surgical dressing for increased redness or discharge.")

    now_iso = datetime.now(timezone.utc).isoformat()
    return CaregiverDailyDigest(
        run_id=run_id,
        patient_name=patient_name,
        generated_at=now_iso,
        adherence_percentage=adherence_pct,
        doses_taken=taken_doses,
        total_scheduled_doses=total_doses,
        latest_mews_score=latest_mews,
        vitals_status=vitals_status,
        symptoms_reported_24h=[],
        next_follow_up=next_fu,
        caregiver_action_items=actions,
        care_team_contact="+91 8000 123 456 (24/7 Ward Helpline)",
    )
