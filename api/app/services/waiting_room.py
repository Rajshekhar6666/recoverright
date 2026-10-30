"""Discharge Waiting-Room Mode & Milestone Tracker.

Clinical & Operational Context:
Hospital discharge in India averages 332 minutes against a 180-minute standard,
with 6 in 10 patients waiting between 6 and 48 hours, primarily stalled by
billing, pharmacy dispense, and TPA insurance clearance.

Discharge Waiting-Room Mode converts this frustrating wait into the safest
period of patient recovery by:
1. Providing attendants with a live transparency timeline of billing & insurance steps.
2. Delivering pre-discharge recovery guidance and teach-back questions so patients
   absorb instructions BEFORE leaving the hospital room/bed.
3. Allowing the attendant to submit live questions to the discharge desk coordinator.
"""
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from app.services.event_bus import bus
from app.schemas.events import Stage
from app.services.storage import store

DischargeMilestone = Literal[
    "doctor_summary_ready",
    "pharmacy_reconciled",
    "billing_finalized",
    "insurance_preauth_pending",
    "insurance_approved",
    "discharge_counseling_done",
    "gate_pass_issued",
]

MILESTONE_DEFINITIONS: list[dict[str, Any]] = [
    {
        "id": "doctor_summary_ready",
        "title_en": "Doctor Clinical Summary",
        "title_hi": "डॉक्टर डिस्चार्ज सारांश",
        "description_en": "Attending physician has completed and signed the clinical recovery plan.",
        "description_hi": "डॉक्टर ने डिस्चार्ज योजना पूरी और सत्यापित कर दी है।",
        "order": 1,
    },
    {
        "id": "pharmacy_reconciled",
        "title_en": "Pharmacy & Medicine Check",
        "title_hi": "फार्मेसी व दवा सत्यापन",
        "description_en": "Pharmacist has verified discharge medications and prepared take-home pack.",
        "description_hi": "फार्मासिस्ट ने दवाओं की जांच कर पैक तैयार कर दिया है।",
        "order": 2,
    },
    {
        "id": "billing_finalized",
        "title_en": "Hospital Billing Audit",
        "title_hi": "बिलिंग ऑडिट संपन्न",
        "description_en": "Itemized hospital bill audit completed and sent for TPA submission.",
        "description_hi": "बिलिंग ऑडिट पूर्ण कर बीमा कंपनी को भेजा गया है।",
        "order": 3,
    },
    {
        "id": "insurance_preauth_pending",
        "title_en": "TPA / Insurance Approval",
        "title_hi": "टीपीए / बीमा अनुमोदन प्रक्रिया",
        "description_en": "Insurance desk is coordinating final approval with your insurer.",
        "description_hi": "बीमा कंपनी से अंतिम अनुमोदन की प्रक्रिया चल रही है।",
        "order": 4,
    },
    {
        "id": "insurance_approved",
        "title_en": "Insurance Settled & Cleared",
        "title_hi": "बीमा राशि स्वीकृत",
        "description_en": "Final approval letter received from insurance provider.",
        "description_hi": "बीमा प्रदाता से अंतिम स्वीकृति पत्र प्राप्त हो चुका है।",
        "order": 5,
    },
    {
        "id": "discharge_counseling_done",
        "title_en": "Nurse Bedside Counseling",
        "title_hi": "नर्स द्वारा परामर्श व समझ",
        "description_en": "Nurse has reviewed medications, wound care, and teach-back questions.",
        "description_hi": "नर्स ने दवाइयों और घाव की देखभाल की पूरी जानकारी दे दी है।",
        "order": 6,
    },
    {
        "id": "gate_pass_issued",
        "title_en": "Gate Pass Issued",
        "title_hi": "गेट पास जारी – विदाई हेतु तैयार",
        "description_en": "Discharge is fully complete. You may safely proceed home.",
        "description_hi": "डिस्चार्ज प्रक्रिया पूरी हो गई है। आप सुरक्षित घर जा सकते हैं।",
        "order": 7,
    },
]


def get_waiting_room_status(run_id: str) -> dict[str, Any]:
    """Retrieves live waiting-room status, completed milestones, and notes."""
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    history = []
    if store.has(run_id, "waiting_room.json"):
        try:
            history = store.read(run_id, "waiting_room.json")
        except Exception:
            history = []

    current_milestone = meta.get("waiting_room_current_milestone", "doctor_summary_ready")
    estimated_mins = meta.get("waiting_room_estimated_remaining_mins", 45)
    insurance_provider = meta.get("patient", {}).get("insurance_provider", "Corporate Health TPA")

    # Map milestone progress
    milestones_progress = []
    completed_so_far = True
    for m in MILESTONE_DEFINITIONS:
        is_current = (m["id"] == current_milestone)
        if is_current:
            status = "in_progress"
            completed_so_far = False
        elif completed_so_far:
            status = "completed"
        else:
            status = "pending"

        milestones_progress.append({
            **m,
            "status": status,
        })

    return {
        "run_id": run_id,
        "patient_name": meta.get("patient", {}).get("name", "Patient"),
        "current_milestone": current_milestone,
        "estimated_remaining_minutes": estimated_mins,
        "insurance_provider": insurance_provider,
        "milestones": milestones_progress,
        "last_updated": meta.get("waiting_room_updated_at"),
        "recent_notes": history[-3:] if history else [],
    }


def update_waiting_room_milestone(
    run_id: str,
    milestone: str,
    note: Optional[str] = None,
    estimated_remaining_mins: Optional[int] = None,
    updated_by: str = "discharge_coordinator",
) -> dict[str, Any]:
    """Updates the waiting-room milestone and emits a notification to the family."""
    with store.lock(run_id):
        existing = []
        if store.has(run_id, "waiting_room.json"):
            try:
                existing = store.read(run_id, "waiting_room.json")
            except Exception:
                existing = []

        now_iso = datetime.now(timezone.utc).isoformat()
        entry = {
            "milestone": milestone,
            "note": note,
            "updated_by": updated_by,
            "timestamp": now_iso,
            "estimated_remaining_mins": estimated_remaining_mins,
        }
        existing.append(entry)
        store.write(run_id, "waiting_room.json", existing)

        updates: dict[str, Any] = {
            "waiting_room_current_milestone": milestone,
            "waiting_room_updated_at": now_iso,
        }
        if estimated_remaining_mins is not None:
            updates["waiting_room_estimated_remaining_mins"] = estimated_remaining_mins
        store.update_meta(run_id, **updates)

        store.audit(run_id, updated_by, "waiting_room.milestone_updated",
                    milestone=milestone, note=note, remaining_mins=estimated_remaining_mins)

    bus.emit(run_id, Stage.PATIENT, "waiting_room.milestone_changed", {
        "milestone": milestone,
        "note": note,
        "estimated_mins": estimated_remaining_mins,
    })

    return get_waiting_room_status(run_id)
