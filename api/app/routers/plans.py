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

from app.pipeline.tasks import build_medication_schedules, generate_tasks_for_plan
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
