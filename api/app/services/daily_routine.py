"""Circadian Schedule & Daily Routine Alignment Engine.

Clinical Context (Gap 3 & Research Evidence):
Arbitrary dosing times (such as 08:00 AM and 08:00 PM) frequently fail because they
do not match the patient's actual waking hours, meal times, or work routine.
"After food" must correspond to when the patient actually eats; otherwise,
medications requiring a full stomach are taken on an empty stomach, causing GI distress.

This service allows the patient or caregiver to input their daily rhythm once,
then automatically aligns medication reminders and recovery tasks to their
real day.
"""
from datetime import datetime, time, timezone
from typing import Any, Optional

from app.services.storage import store


DEFAULT_ROUTINE: dict[str, str] = {
    "wake_time": "07:00 AM",
    "breakfast_time": "08:30 AM",
    "lunch_time": "01:30 PM",
    "dinner_time": "08:30 PM",
    "bedtime": "10:30 PM",
}


def _parse_time_str(t_str: str) -> Optional[time]:
    """Parse time string like '08:30 AM' into datetime.time."""
    if not t_str:
        return None
    try:
        dt = datetime.strptime(t_str.strip(), "%I:%M %p")
        return dt.time()
    except ValueError:
        try:
            dt = datetime.strptime(t_str.strip(), "%H:%M")
            return dt.time()
        except ValueError:
            return None


def align_schedule_to_routine(
    frequency: Optional[str],
    instructions: Optional[str] = None,
    routine: Optional[dict[str, str]] = None,
) -> list[str]:
    """Places medication dosing times around the patient's actual meals and sleep."""
    r = {**DEFAULT_ROUTINE, **(routine or {})}
    freq = (frequency or "").lower()
    instr = (instructions or "").lower()

    if not freq or any(w in freq for w in ("as needed", "prn", "when required")):
        return []

    # Bedtime only
    if any(w in freq for w in ("night", "bedtime", "evening", "hs", "nocte")) or "bedtime" in instr:
        if "twice" not in freq and "three" not in freq and "thrice" not in freq:
            return [r["bedtime"]]

    # Four times daily (QID)
    if "four" in freq or "4 times" in freq or "qid" in freq:
        return [r["breakfast_time"], r["lunch_time"], r["dinner_time"], r["bedtime"]]

    # Three times daily (TID)
    if "three" in freq or "3 times" in freq or "tid" in freq or "thrice" in freq:
        return [r["breakfast_time"], r["lunch_time"], r["dinner_time"]]

    # Twice daily (BID)
    if "twice" in freq or "2 times" in freq or "bid" in freq or "b.i.d" in freq:
        return [r["breakfast_time"], r["dinner_time"]]

    # Once daily (OD)
    if "once" in freq or "daily" in freq or "1 time" in freq or "od" in freq:
        if "night" in freq or "bedtime" in freq:
            return [r["bedtime"]]
        return [r["breakfast_time"]]

    return [r["breakfast_time"]]


def update_patient_routine(
    run_id: str,
    routine_data: dict[str, str],
    updated_by: str = "patient",
) -> dict[str, Any]:
    """Saves the patient's daily routine and realigns approved plan medication schedules."""
    with store.lock(run_id):
        routine = {**DEFAULT_ROUTINE, **routine_data}
        store.write(run_id, "daily_routine.json", routine)
        store.audit(run_id, updated_by, "daily_routine.updated", **routine)

        # Realign medication schedules if plan exists
        plan_dict = store.get_plan_version(run_id)
        if plan_dict:
            items = plan_dict.get("items") or []
            updated_any = False
            for it in items:
                if it.get("category") == "medications":
                    attrs = it.get("attrs") or {}
                    freq = attrs.get("frequency")
                    instr = attrs.get("instructions")
                    # Calculate personalized times
                    aligned_times = align_schedule_to_routine(freq, instr, routine)
                    if aligned_times:
                        attrs["confirmed_times"] = ", ".join(aligned_times)
                        it["attrs"] = attrs
                        updated_any = True

            if updated_any:
                curr_v = plan_dict.get("version", 1)
                store.save_plan_version(run_id, plan_dict, version=curr_v)

                # Re-generate tasks with aligned times
                from app.schemas.api import ApprovedPlan
                from app.pipeline.tasks import generate_tasks_for_plan
                approved_obj = ApprovedPlan.model_validate(plan_dict)
                new_tasks = generate_tasks_for_plan(approved_obj)
                store.save_tasks(run_id, [t.model_dump(mode="json") for t in new_tasks])

    return routine


def get_patient_routine(run_id: str) -> dict[str, str]:
    """Retrieves the stored or default daily routine for a patient."""
    if store.has(run_id, "daily_routine.json"):
        try:
            return store.read(run_id, "daily_routine.json")
        except Exception:
            pass
    return DEFAULT_ROUTINE.copy()
