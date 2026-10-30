"""Deterministic recovery task generator.

Turns an approved recovery plan into discrete, actionable RecoveryTask items
with explicit schedules and clinical categorization.

Clinical Safety Rule (Gap 3):
  Dose times are NEVER guessed from frequency wording alone. The function
  ``times_for_frequency`` returns a list of suggested defaults so staff can
  review them, but any time that has not been explicitly confirmed by a
  clinician is shown to the patient as "Time not set – ask your nurse."
  The sentinel value TIME_NOT_SET is stored verbatim; the patient app must
  display the human-readable label, never the raw sentinel.
"""
import re
from datetime import date
from typing import Optional

from app.schemas.api import ApprovedPlan, MedicationSchedule, RecoveryTask

# Sentinel used when a clinician has not yet confirmed the exact dosing time.
# Patient apps MUST display this as a human-readable message, not the raw value.
TIME_NOT_SET = "time_not_set"
TIME_NOT_SET_LABEL = "Time not set – ask your nurse"


def _fmt_hour(h: int) -> str:
    hh = ((h % 24) + 24) % 24
    hour_12 = 12 if hh % 12 == 0 else hh % 12
    ampm = "AM" if hh < 12 else "PM"
    return f"{hour_12:02d}:00 {ampm}"


def times_for_frequency(freq: Optional[str]) -> list[str]:
    """Converts medication frequency text into SUGGESTED (unconfirmed) times of day.

    Clinical safety note: The returned times are derived from frequency wording
    and have NOT been reviewed by a clinician.  They are stored with the
    TIME_NOT_SET sentinel until a reviewer explicitly sets or confirms them.
    Callers that need confirmed times must check the ``times_confirmed`` flag
    on the MedicationSchedule.
    """
    f = (freq or "").strip().lower()
    if not f or any(w in f for w in ("as needed", "prn", "when required", "if needed")):
        return []

    # "every X hours"
    m = re.search(r"every\s+(\d{1,2})\s*(?:hours?|hrs?|h)\b", f)
    if m:
        n = int(m.group(1))
        if 3 <= n <= 24:
            count = max(1, 24 // n)
            return [_fmt_hour(8 + i * n) for i in range(count)]

    if re.search(r"(?:four|4)\s*times|qid", f):
        return ["08:00 AM", "12:00 PM", "04:00 PM", "08:00 PM"]
    if re.search(r"(?:three|3)\s*times|tid|thrice", f):
        return ["08:00 AM", "02:00 PM", "08:00 PM"]
    if re.search(r"twice|(?:two|2)\s*times|bid|b\.i\.d", f):
        return ["08:00 AM", "08:00 PM"]
    if re.search(r"once|daily|every day|(?:one|1)\s*time|at night|morning", f):
        return ["09:00 PM"] if re.search(r"night|bedtime|evening", f) else ["08:00 AM"]

    # Frequency present but pattern unrecognised – do not guess
    return []


def build_medication_schedules(plan: ApprovedPlan) -> list[MedicationSchedule]:
    """Extracts structured medication schedules from the approved plan items.

    Clinical safety note (Gap 3): Suggested times derived from frequency wording
    are marked as NOT clinician-confirmed.  The ``times`` list will contain the
    TIME_NOT_SET sentinel for each slot whose exact clock time has not been
    explicitly set by a clinician.  Patient apps must display TIME_NOT_SET_LABEL
    instead of the raw sentinel value.
    """
    schedules = []
    for item in plan.items:
        if item.category != "medications":
            continue
        attrs = item.attrs or {}
        freq = attrs.get("frequency")

        # Check whether a clinician has explicitly confirmed dosing times.
        # Confirmed times are stored in attrs["confirmed_times"] as a
        # comma-separated string by the review endpoint (Gap 3 fix).
        confirmed_raw = attrs.get("confirmed_times") or ""
        confirmed_times = [t.strip() for t in confirmed_raw.split(",") if t.strip()]

        if confirmed_times:
            times = confirmed_times
        else:
            # Derive suggested defaults but mark each slot as unconfirmed.
            suggested = times_for_frequency(freq)
            times = [TIME_NOT_SET] * len(suggested) if suggested else []

        schedules.append(
            MedicationSchedule(
                id=item.field_id,
                name=attrs.get("name") or "Prescribed Medication",
                dose=attrs.get("dose"),
                route=attrs.get("route"),
                frequency=freq,
                duration=attrs.get("duration"),
                times=times,
                instructions=attrs.get("instructions"),
            )
        )
    return schedules


def generate_tasks_for_plan(plan: ApprovedPlan, for_date: Optional[str] = None) -> list[RecoveryTask]:
    """Generates today's recovery tasks from an approved recovery plan.

    Clinical safety note (Gap 3): Medication tasks whose dosing time has not
    been confirmed by a clinician are scheduled with scheduled_time set to
    TIME_NOT_SET_LABEL so the patient can see they must ask their nurse.
    """
    target_date = for_date or date.today().isoformat()
    tasks: list[RecoveryTask] = []
    task_idx = 1

    # 1. Medications
    meds = build_medication_schedules(plan)
    for med in meds:
        dose_str = f" ({med.dose})" if med.dose else ""
        if med.times:
            for t in med.times:
                # Translate the sentinel to the human-readable label for task display
                display_time = TIME_NOT_SET_LABEL if t == TIME_NOT_SET else t
                tasks.append(
                    RecoveryTask(
                        task_id=f"task_{plan.run_id}_v{plan.version}_m{task_idx}",
                        run_id=plan.run_id,
                        plan_version=plan.version,
                        category="medication",
                        title=f"Take {med.name}{dose_str}",
                        description=f"{med.frequency or 'As directed'}. Route: {med.route or 'Oral'}.",
                        scheduled_time=display_time,
                        scheduled_date=target_date,
                    )
                )
                task_idx += 1
        else:
            # PRN / as-needed medication
            tasks.append(
                RecoveryTask(
                    task_id=f"task_{plan.run_id}_v{plan.version}_m{task_idx}",
                    run_id=plan.run_id,
                    plan_version=plan.version,
                    category="medication",
                    title=f"Take {med.name}{dose_str} (As needed)",
                    description=f"{med.frequency or 'Take only if required'}. Route: {med.route or 'Oral'}.",
                    scheduled_time="As needed",
                    scheduled_date=target_date,
                )
            )
            task_idx += 1

    # 2. Wound Care
    wc_idx = 1
    for item in plan.items:
        if item.category == "wound_care":
            attrs = item.attrs or {}
            instruction = attrs.get("instruction") or "Follow wound care instructions"
            tasks.append(
                RecoveryTask(
                    task_id=f"task_{plan.run_id}_v{plan.version}_wc{wc_idx}",
                    run_id=plan.run_id,
                    plan_version=plan.version,
                    category="wound_care",
                    title=f"Wound Care Check #{wc_idx}",
                    description=instruction,
                    scheduled_time="10:00 AM",
                    scheduled_date=target_date,
                )
            )
            wc_idx += 1

    # 3. Follow-Ups
    fu_idx = 1
    for item in plan.items:
        if item.category == "follow_ups":
            attrs = item.attrs or {}
            what = attrs.get("what") or "Clinical Follow-up"
            when = attrs.get("when") or "Scheduled appointment"
            where = attrs.get("where") or "Clinic"
            tasks.append(
                RecoveryTask(
                    task_id=f"task_{plan.run_id}_v{plan.version}_fu{fu_idx}",
                    run_id=plan.run_id,
                    plan_version=plan.version,
                    category="follow_up",
                    title=f"Appointment: {what}",
                    description=f"When: {when}. Location: {where}.",
                    scheduled_time="09:00 AM",
                    scheduled_date=target_date,
                )
            )
            fu_idx += 1

    # 4. Activity
    act_idx = 1
    for item in plan.items:
        if item.category == "activity":
            attrs = item.attrs or {}
            instruction = attrs.get("instruction") or "Follow activity guidelines"
            tasks.append(
                RecoveryTask(
                    task_id=f"task_{plan.run_id}_v{plan.version}_act{act_idx}",
                    run_id=plan.run_id,
                    plan_version=plan.version,
                    category="activity",
                    title=f"Daily Mobility / Activity",
                    description=instruction,
                    scheduled_time="02:00 PM",
                    scheduled_date=target_date,
                )
            )
            act_idx += 1

    return tasks
