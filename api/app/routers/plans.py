"""Patient recovery plan delivery and task tracking endpoints.

Enforces server-side clinical safety:
1. Patients access only approved plans via secure token (pat_... or permitted run_id).
2. Unapproved plans are refused with 403 (never leaking draft or rejected clinical items).
3. Raw blocks, extraction evidence, and staff review blockers are excluded from patient responses.
4. Reminder delivery, reminder acknowledgement, and self-reported dose ingestion are distinct and auditable.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.pipeline.tasks import build_medication_schedules, generate_tasks_for_plan, TIME_NOT_SET, TIME_NOT_SET_LABEL
from app.pipeline.translate import translate_plan_view, SUPPORTED_LANGUAGES
from app.schemas.api import (
    ApprovedPlan,
    MedicationAckRequest,
    MedicationDoseActionRequest,
    MedicationSchedule,
    PatientPlanResponse,
    PillScanRequest,
    PillScanResponse,
    TaskActionRequest,
)
from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.pill_verifier import verify_scanned_pill
from app.services.storage import store

router = APIRouter(tags=["plans"])


def _resolve_and_verify(token: str) -> tuple[str, dict]:
    """Resolves token to run_id and verifies approval status on the server."""
    run_id = store.resolve_run_id(token)
    if not run_id:
        raise HTTPException(404, "Plan not found. Please check your link or contact your care team.")
    meta = store.read(run_id, "meta.json")

    # Gap 13: Expiring unguessable patient links
    expires_at_str = meta.get("patient_token_expires_at")
    if expires_at_str:
        try:
            exp = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(
                    410,
                    detail={
                        "error": "token_expired",
                        "message": "This patient recovery link has expired (post-discharge access window). Please contact your hospital care team for a renewed link.",
                    },
                )
        except (ValueError, TypeError):
            pass

    if not meta.get("approved"):
        raise HTTPException(
            403,
            detail={
                "error": "plan_not_approved",
                "message": "Your recovery plan is still being reviewed by the clinical team. It will be available immediately upon approval.",
                "status": "pending_review",
            },
        )
    return run_id, meta


@router.get("/plans/{token}", response_model=PatientPlanResponse)
def get_patient_plan(token: str):
    """Secure patient-facing endpoint delivering only the current approved recovery plan."""
    run_id, meta = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan document not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    patient_info = meta.get("patient") or {}

    # Extract clean patient-safe instructions
    instructions: dict[str, list[str]] = {
        "wound_care": [],
        "activity": [],
        "diet": [],
        "warning_signs": [],
    }
    follow_ups = []
    contacts = []

    for item in plan.items:
        attrs = item.attrs or {}
        cat = item.category
        if cat in instructions:
            text = attrs.get("instruction") or attrs.get("text")
            if text:
                instructions[cat].append(text)
        elif cat == "follow_ups":
            follow_ups.append({
                "id": item.field_id,
                "what": attrs.get("what") or "Follow-up",
                "when": attrs.get("when"),
                "where": attrs.get("where"),
            })
        elif cat == "contacts":
            val = attrs.get("value")
            if val:
                contacts.append({
                    "label": attrs.get("label") or "Care team",
                    "value": val,
                })

    # Get or generate today's tasks
    tasks = store.get_tasks(run_id)
    if not tasks:
        generated = generate_tasks_for_plan(plan)
        tasks = [t.model_dump(mode="json") for t in generated]
        store.save_tasks(run_id, tasks)

    return PatientPlanResponse(
        run_id=run_id,
        patient_name=patient_info.get("name") or "Patient",
        phone=patient_info.get("phone") or "",
        language=patient_info.get("language") or "en",
        version=plan.version,
        approved_at=plan.approved_at,
        plan_duration_days=plan.plan_duration_days or 14,
        medications=build_medication_schedules(plan),
        instructions=instructions,
        follow_ups=follow_ups,
        contacts=contacts,
        caregivers=patient_info.get("caregivers") or [],
        tasks_today=tasks,
        demo=False,
        patient_slug=meta.get("patient_slug"),
        dashboard_url=f"/p/demo/{meta['patient_slug']}" if meta.get("patient_slug") else None,
    )


@router.get("/plans/{token}/tasks")
def get_patient_tasks(token: str):
    """Gets today's recovery tasks for the authenticated patient."""
    run_id, _ = _resolve_and_verify(token)
    tasks = store.get_tasks(run_id)
    if not tasks:
        plan_dict = store.get_plan_version(run_id)
        if plan_dict:
            plan = ApprovedPlan.model_validate(plan_dict)
            generated = generate_tasks_for_plan(plan)
            tasks = [t.model_dump(mode="json") for t in generated]
            store.save_tasks(run_id, tasks)
    return {"tasks": tasks}


@router.post("/plans/{token}/tasks/{task_id}/action")
def update_patient_task(token: str, task_id: str, body: TaskActionRequest):
    """Updates the status of a specific recovery task."""
    run_id, _ = _resolve_and_verify(token)
    status_map = {
        "complete": "completed",
        "snooze": "snoozed",
        "cancel": "cancelled",
        "reset": "pending",
    }
    target_status = status_map.get(body.action, body.action)
    updated = store.update_task_status(run_id, task_id, target_status, completed_by=body.by, notes=body.note)
    if not updated:
        raise HTTPException(404, "Task not found")

    bus.emit(run_id, Stage.TASKS, f"task.{target_status}", {"task_id": task_id, "by": body.by})
    return {"task": updated}


@router.post("/plans/{token}/medications/{med_id}/report-dose")
def report_medication_dose(token: str, med_id: str, body: MedicationDoseActionRequest):
    """Records that the patient or caregiver reported taking a prescribed dose."""
    run_id, _ = _resolve_and_verify(token)
    record = store.record_dose_action(
        run_id,
        med_id,
        reported_taken=body.reported_taken,
        via=body.via,
        note=body.note,
    )
    bus.emit(run_id, Stage.PATIENT, "medication.reported_taken", {
        "medication_id": med_id,
        "reported_taken": body.reported_taken,
        "via": body.via,
    })
    return {"dose_record": record}


@router.post("/plans/{token}/medications/{med_id}/acknowledge")
def acknowledge_medication_reminder(token: str, med_id: str, body: MedicationAckRequest):
    """Records that a medication reminder was seen/heard (distinct from ingestion)."""
    run_id, _ = _resolve_and_verify(token)
    record = store.record_dose_ack(run_id, med_id, acknowledged=body.acknowledged, via=body.via)
    bus.emit(run_id, Stage.REMINDER, "medication.reminder_ack", {
        "medication_id": med_id,
        "acknowledged": body.acknowledged,
        "via": body.via,
    })
    return {"dose_record": record}


@router.post("/plans/{token}/scan-pill", response_model=PillScanResponse)
def scan_and_verify_pill(token: str, body: PillScanRequest):
    """AI Pill Scanner endpoint: Verifies pill bottle/strip against approved prescription."""
    run_id, _ = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan document not found")

    items = plan_dict.get("items") or []
    med_items = [i for i in items if i.get("category") == "medications"]

    result = verify_scanned_pill(
        prescribed_items=med_items,
        raw_text=body.detected_text or "",
        sample_id=body.sample_id or "",
        image_data=body.image_data,
        language=body.language,
    )

    bus.emit(run_id, Stage.PATIENT, "pill.scanned", {
        "status": result["status"],
        "detected_name": result["detected_name"],
        "detected_dose": result["detected_dose"],
        "verified": result["verified"],
    })

    return result


@router.get("/runs/{run_id}/versions")
def list_plan_versions(run_id: str):
    """Staff endpoint to inspect all historical approved plan versions."""
    if not store.exists(run_id):
        raise HTTPException(404, "Run not found")
    meta = store.read(run_id, "meta.json")
    versions = store.list_plan_versions(run_id)
    return {
        "run_id": run_id,
        "current_version": meta.get("current_version", 1),
        "approved": meta.get("approved", False),
        "versions": versions,
        "history": meta.get("plan_versions", []),
    }


# ── Gap 8: Translation endpoint ────────────────────────────────────────────

@router.get("/plans/{token}/translate/{lang}")
def get_translated_plan(token: str, lang: str):
    """Return a localised read-only view of the approved plan.

    Clinical safety rules (Gap 8):
    - Only patient-facing instruction/warning text is translated.
    - Medication names, doses, and times are locked (never translated).
    - Every translated field shows the original approved text alongside it.
    - Items flagged needs_review MUST be verified by a bilingual clinician.
    """
    from app.pipeline.translate import translate_plan_view, SUPPORTED_LANGUAGES
    run_id, meta = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan not found")

    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            400,
            f"Language '{lang}' is not supported. Supported: {list(SUPPORTED_LANGUAGES.keys())}"
        )

    items = plan_dict.get("items") or []
    result = translate_plan_view(items, target_lang=lang)
    store.audit(run_id, "patient", "plan.translated", lang=lang,
                needs_review_count=result.get("needs_review_count", 0))
    return result


@router.get("/languages")
def list_supported_languages():
    """Return the list of languages supported for plan translation (Gap 8)."""
    from app.pipeline.translate import SUPPORTED_LANGUAGES
    return {
        "languages": [
            {"code": code, **meta}
            for code, meta in SUPPORTED_LANGUAGES.items()
        ]
    }


# ── Gap 4: Reviewer timing endpoint ───────────────────────────────────────

@router.get("/runs/{run_id}/review-timings")
def get_review_timings(run_id: str):
    """Staff endpoint: returns per-field reviewer decision timing data.

    Used to surface potential rubber-stamping (decisions made in < 5 seconds
    without reading the source quote).  Gap 4 fix.
    """
    if not store.exists(run_id):
        raise HTTPException(404, "Run not found")
    timings = store.get_review_timings(run_id)
    fast_count = sum(1 for t in timings if t.get("fast_review_flag"))
    return {
        "run_id": run_id,
        "total_decisions": len(timings),
        "fast_review_flags": fast_count,
        "timings": timings,
        "note": (
            "fast_review_flag=true means decision was made in under 5 seconds. "
            "These should be checked to confirm the reviewer read the source quote."
        ),
    }


# ── Feature: Teach-Back Comprehension Loop ──────────────────────────────────

class TeachBackAnswer(BaseModel):
    question_id: str
    selected_option_id: str


class TeachBackSubmission(BaseModel):
    answers: list[TeachBackAnswer]
    by: str = "patient"


@router.get("/plans/{token}/teach-back")
def get_plan_teach_back(token: str, lang: Optional[str] = None):
    """Generates tailored teach-back questions grounded in the approved recovery plan."""
    from app.services.teach_back import generate_teach_back_questions
    run_id, meta = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    target_lang = lang or meta.get("patient", {}).get("language", "en")
    questions = generate_teach_back_questions(plan, lang=target_lang)

    history = store.read(run_id, "teach_back_history.json") if store.has(run_id, "teach_back_history.json") else []

    return {
        "run_id": run_id,
        "patient_name": meta.get("patient", {}).get("name", "Patient"),
        "language": target_lang,
        "questions": questions,
        "has_completed_previous": bool(history),
        "last_result": history[-1] if history else None,
    }


@router.post("/plans/{token}/teach-back")
def submit_plan_teach_back(token: str, body: TeachBackSubmission):
    """Evaluates teach-back answers, records score, and auto-alerts nurse on misunderstanding."""
    from app.services.teach_back import evaluate_teach_back_submission
    run_id, _ = _resolve_and_verify(token)
    answers_dicts = [a.model_dump() for a in body.answers]
    result = evaluate_teach_back_submission(run_id, answers_dicts, submitted_by=body.by)
    return result


# ── Feature: Discharge Waiting-Room Mode ───────────────────────────────────

@router.get("/plans/{token}/waiting-room")
def get_patient_waiting_room(token: str):
    """Patient/Attendant view of live hospital discharge status & milestone tracking."""
    from app.services.waiting_room import get_waiting_room_status
    run_id, _ = _resolve_and_verify(token)
    return get_waiting_room_status(run_id)


# ── Feature: Affordability & First-Fill Check ──────────────────────────────

class AffordabilityReport(BaseModel):
    status: str  # "purchased" | "needs_generic" | "out_of_stock" | "financial_hardship"
    note: Optional[str] = None
    by: str = "patient"


@router.post("/plans/{token}/affordability")
def report_medication_affordability(token: str, body: AffordabilityReport):
    """Logs medication purchase status and alerts care team if generic substitution or assistance needed."""
    run_id, meta = _resolve_and_verify(token)
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "status": body.status,
        "note": body.note,
        "by": body.by,
        "reported_at": now_iso,
    }
    with store.lock(run_id):
        records = store.read(run_id, "affordability.json") if store.has(run_id, "affordability.json") else []
        records.append(record)
        store.write(run_id, "affordability.json", records)
        store.update_meta(run_id, affordability_status=body.status, affordability_reported_at=now_iso)
        store.audit(run_id, body.by, "affordability.reported", status=body.status, note=body.note)

    if body.status in ("needs_generic", "financial_hardship", "out_of_stock"):
        from app.services.help_store import help_store
        help_req, _ = help_store.create(
            run_id=run_id,
            patient_name=meta.get("patient", {}).get("name", "Patient"),
            severity="concern",
            source="affordability_check",
            heard=f"Medication access barrier: {body.status} ({body.note or 'Assistance requested'})",
            label="Medication Affordability Assistance",
        )
        bus.emit(run_id, Stage.PATIENT, "affordability.assistance_needed", record)

    return {"recorded": True, "record": record}


@router.get("/plans/{token}/affordability")
def get_medication_affordability(token: str):
    """Retrieves patient affordability reports and access status."""
    run_id, meta = _resolve_and_verify(token)
    records = store.read(run_id, "affordability.json") if store.has(run_id, "affordability.json") else []
    return {
        "run_id": run_id,
        "current_status": meta.get("affordability_status", "pending_check"),
        "history": records,
    }


# ── Feature: Diabetes & Metabolic Recovery Pack ────────────────────────────

class GlucoseLogEntry(BaseModel):
    reading_mg_dl: float
    timing: str = "fasting"  # "fasting", "pre_meal", "post_meal_2h", "bedtime", "random"
    note: Optional[str] = None
    by: str = "patient"


@router.post("/plans/{token}/glucose-log")
def log_blood_glucose(token: str, body: GlucoseLogEntry):
    """Logs blood glucose reading with automatic hypoglycemia alert & Rule of 15 guidance."""
    run_id, meta = _resolve_and_verify(token)
    now_iso = datetime.now(timezone.utc).isoformat()
    reading = body.reading_mg_dl

    # Clinical evaluation
    if reading < 54.0:
        alert_level = "CRITICAL_HYPOGLYCEMIA"
        clinical_guidance = (
            "CRITICAL: Glucose dangerously low (<54 mg/dL). Consume 15-20g rapid sugar (fruit juice / 3 sugar packets) "
            "immediately. Call hospital emergency or care team if symptoms do not improve within 15 minutes."
        )
    elif reading < 70.0:
        alert_level = "HYPOGLYCEMIA"
        clinical_guidance = (
            "Rule of 15: Take 15g fast-acting carbohydrate (half cup juice or 3 glucose tablets). "
            "Rest and re-check blood glucose in exactly 15 minutes."
        )
    elif reading > 250.0:
        alert_level = "HYPERGLYCEMIA"
        clinical_guidance = (
            "Elevated blood sugar (>250 mg/dL). Drink water, take prescribed diabetes medication as scheduled, "
            "and contact doctor if reading remains elevated across two consecutive checks."
        )
    else:
        alert_level = "NORMAL"
        clinical_guidance = "Reading within target range. Continue prescribed recovery diet and medication regimen."

    entry = {
        "reading_mg_dl": reading,
        "timing": body.timing,
        "alert_level": alert_level,
        "clinical_guidance": clinical_guidance,
        "note": body.note,
        "by": body.by,
        "logged_at": now_iso,
    }

    with store.lock(run_id):
        logs = store.read(run_id, "glucose_logs.json") if store.has(run_id, "glucose_logs.json") else []
        logs.append(entry)
        store.write(run_id, "glucose_logs.json", logs)
        store.audit(run_id, body.by, "glucose.logged", reading=reading, timing=body.timing, alert=alert_level)

    # Emergency escalation for critical low blood sugar
    if alert_level in ("CRITICAL_HYPOGLYCEMIA", "HYPOGLYCEMIA"):
        from app.services.help_store import help_store
        severity = "critical" if alert_level == "CRITICAL_HYPOGLYCEMIA" else "concern"
        help_req, _ = help_store.create(
            run_id=run_id,
            patient_name=meta.get("patient", {}).get("name", "Patient"),
            severity=severity,
            source="glucose_monitor",
            heard=f"Hypoglycemia reading {reading} mg/dL ({body.timing})",
            label="Hypoglycemia Protocol Escalation",
        )
        bus.emit(run_id, Stage.PATIENT, "glucose.hypoglycemia_alert", entry)

    return entry


@router.get("/plans/{token}/glucose-log")
def get_glucose_logs(token: str):
    """Retrieves blood glucose monitoring history for diabetes recovery."""
    run_id, _ = _resolve_and_verify(token)
    logs = store.read(run_id, "glucose_logs.json") if store.has(run_id, "glucose_logs.json") else []
    return {
        "run_id": run_id,
        "total_readings": len(logs),
        "readings": logs,
    }


# ── Feature: Circadian Daily Routine Dosing Alignment ──────────────────────

class DailyRoutineInput(BaseModel):
    wake_time: Optional[str] = "07:00 AM"
    breakfast_time: Optional[str] = "08:30 AM"
    lunch_time: Optional[str] = "01:30 PM"
    dinner_time: Optional[str] = "08:30 PM"
    bedtime: Optional[str] = "10:30 PM"
    by: str = "patient"


@router.get("/plans/{token}/daily-routine")
def get_patient_daily_routine(token: str):
    """Retrieves patient's daily meal & waking hours used for personalized dosing."""
    from app.services.daily_routine import get_patient_routine
    run_id, _ = _resolve_and_verify(token)
    return {"run_id": run_id, "routine": get_patient_routine(run_id)}


@router.post("/plans/{token}/daily-routine")
def set_patient_daily_routine(token: str, body: DailyRoutineInput):
    """Aligns medication reminders and daily tasks to the patient's actual meals and sleep."""
    from app.services.daily_routine import update_patient_routine
    run_id, _ = _resolve_and_verify(token)
    data = body.model_dump(exclude={"by"})
    updated = update_patient_routine(run_id, data, updated_by=body.by)
    return {"status": "aligned", "routine": updated}


# ── Feature: Daily Symptom & Red-Flag Check-in ─────────────────────────────

class SymptomResponse(BaseModel):
    question_id: str
    present: bool
    notes: Optional[str] = ""


class DailyCheckinSubmission(BaseModel):
    responses: list[SymptomResponse]
    by: str = "patient"


@router.get("/plans/{token}/daily-checkin")
def get_patient_daily_checkin(token: str, lang: Optional[str] = None):
    """Returns today's 1-tap red-flag symptom questions grounded in the recovery plan."""
    from app.services.symptom_checkin import get_daily_checkin_questions
    run_id, meta = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    target_lang = lang or meta.get("patient", {}).get("language", "en")
    questions = get_daily_checkin_questions(plan, lang=target_lang)

    history = store.read(run_id, "symptom_checkins.json") if store.has(run_id, "symptom_checkins.json") else []

    return {
        "run_id": run_id,
        "questions": questions,
        "has_checked_in_today": bool(history),
        "recent_checkins": history[-3:] if history else [],
    }


@router.post("/plans/{token}/daily-checkin")
def submit_patient_daily_checkin(token: str, body: DailyCheckinSubmission):
    """Processes 1-tap daily symptom check-in and escalates any red-flag to nurse triage."""
    from app.services.symptom_checkin import process_symptom_checkin
    run_id, _ = _resolve_and_verify(token)
    responses_data = [r.model_dump() for r in body.responses]
    result = process_symptom_checkin(run_id, responses_data, submitted_by=body.by)
    return result


# ── Feature: 'What to Do, Who to Call' Emergency Action Cards (Gap 10) ──────

@router.get("/plans/{token}/action-cards")
def get_patient_action_cards(token: str, lang: Optional[str] = None):
    """Returns plain-language emergency action cards derived from plan warning signs."""
    from app.services.action_cards import generate_action_cards
    run_id, meta = _resolve_and_verify(token)
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved plan not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    target_lang = lang or meta.get("patient", {}).get("language", "en")
    cards = generate_action_cards(plan, lang=target_lang)

    return {
        "run_id": run_id,
        "language": target_lang,
        "total_cards": len(cards),
        "cards": cards,
    }


# ── Feature: Printable Large-Print Plan (Frugal Channel) ───────────────────

@router.get("/plans/{token}/printable")
def get_patient_printable_plan(token: str):
    """Generates high-contrast large-print plan structure for bedside/discharge printing."""
    from app.services.printable_plan import generate_printable_plan_data
    run_id, _ = _resolve_and_verify(token)
    return generate_printable_plan_data(run_id)



# ── Gap 15: Follow-Up Appointment Attendance Tracking ───────────────────────

class FollowUpAttendanceBody(BaseModel):
    status: str  # "confirmed", "attended", "reschedule_requested", "missed"
    appointment_id: Optional[str] = None
    notes: Optional[str] = None
    by: str = "patient"


ATTENDANCE_STATUSES = {"confirmed", "attended", "reschedule_requested", "missed"}


@router.post("/plans/{token}/follow-up/attendance")
def record_follow_up_attendance(token: str, body: FollowUpAttendanceBody):
    """Records follow-up appointment attendance for pilot outcome tracking.

    Gap 15 / S6: Disability, language and transport barriers stop patients
    attending follow-up (Okrainec et al. 2019). This endpoint captures attendance
    status so nurses can proactively contact patients who missed appointments —
    a key leading indicator of readmission risk.

    Statuses:
      - confirmed: patient confirmed they will attend
      - attended: appointment completed
      - reschedule_requested: patient needs to reschedule
      - missed: patient did not attend and did not contact the team
    """
    if body.status not in ATTENDANCE_STATUSES:
        raise HTTPException(
            422,
            f"status must be one of {sorted(ATTENDANCE_STATUSES)}",
        )
    run_id, meta = _resolve_and_verify(token)

    record = {
        "appointment_id": body.appointment_id or f"appt_{run_id}",
        "status": body.status,
        "notes": body.notes or "",
        "recorded_by": body.by,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }

    # Persist to appointment_attendance.json
    existing: list = []
    if store.has(run_id, "appointment_attendance.json"):
        try:
            existing = store.read(run_id, "appointment_attendance.json")
        except Exception:
            existing = []
    existing.append(record)
    store.write(run_id, "appointment_attendance.json", existing)
    store.audit(run_id, body.by, "follow_up.attendance_recorded",
                appointment_id=record["appointment_id"], status=body.status)

    # Escalate missed appointments to nurse queue
    if body.status == "missed":
        from app.services.help_store import help_store
        patient_name = meta.get("patient", {}).get("name", "Patient")
        help_store.create(
            run_id=run_id,
            heard=f"Missed follow-up appointment (ID: {record['appointment_id']}). Notes: {body.notes or 'None'}",
            severity="concern",
            source="button",
            label="Missed Follow-Up Appointment",
            patient_name=patient_name,
        )
        bus.emit(run_id, Stage.PATIENT, "follow_up.missed", {
            "appointment_id": record["appointment_id"],
            "patient_name": patient_name,
        })

    return {
        "recorded": True,
        "run_id": run_id,
        "record": record,
        "message": (
            "Attendance recorded. Missed appointments are escalated to the nursing team."
            if body.status == "missed" else "Attendance recorded."
        ),
    }


@router.get("/plans/{token}/follow-up/attendance")
def get_follow_up_attendance(token: str):
    """Returns all recorded follow-up attendance records for a patient."""
    run_id, _ = _resolve_and_verify(token)
    if not store.has(run_id, "appointment_attendance.json"):
        return {"run_id": run_id, "records": [], "total": 0}
    try:
        records = store.read(run_id, "appointment_attendance.json")
    except Exception:
        records = []
    return {"run_id": run_id, "records": records, "total": len(records)}



# ── Feature: Patient Access Link Renewal (Gap 13 Expiring Links) ─────────────

from datetime import timedelta

@router.post("/plans/{token}/renew-link")
def renew_patient_recovery_link(token: str, extension_days: int = 30):
    """Renews an expiring or expired patient recovery link for an additional window.

    Gap 13: Time-limited access protects patient privacy post-discharge.
    Clinicians can grant link extensions when follow-up care requires longer access.
    """
    run_id = store.resolve_run_id(token)
    if not run_id:
        raise HTTPException(404, "Plan not found")
    meta = store.read(run_id, "meta.json")
    new_exp = (datetime.now(timezone.utc) + timedelta(days=extension_days)).isoformat()
    store.update_meta(run_id, patient_token_expires_at=new_exp, link_renewed_at=datetime.now(timezone.utc).isoformat())
    store.audit(run_id, "staff", "patient_token.renewed", extension_days=extension_days, expires_at=new_exp)
    return {
        "renewed": True,
        "run_id": run_id,
        "new_expires_at": new_exp,
        "extension_days": extension_days,
        "message": f"Recovery plan access link renewed for {extension_days} days.",
    }
