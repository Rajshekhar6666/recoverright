"""Caregiver Portal and Family Notification Router.

Allows authorized family caregivers to view patient recovery progress,
manage consent and notification preferences, confirm doses and tasks,
and receive real-time notifications for emergencies, missed doses, and milestones.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.pipeline.tasks import build_medication_schedules
from app.schemas.api import ApprovedPlan, MedicationDoseActionRequest, TaskActionRequest
from app.schemas.caregiver import (
    CaregiverConsentUpdate,
    CaregiverNotification,
    CaregiverNotifyRequest,
    CaregiverPatientView,
)
from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.help_store import help_store
from app.services.reminder import channel_registry
from app.services.storage import store

router = APIRouter(prefix="/caregivers", tags=["caregivers"])


def _resolve_caregiver_run(token: str) -> tuple[str, dict, dict]:
    """Resolves caregiver token to run_id, meta, and the specific caregiver profile."""
    run_id = store.resolve_caregiver_run_id(token)
    if not run_id:
        raise HTTPException(404, "Caregiver link not found. Please verify the URL or contact the care team.")
    meta = store.read(run_id, "meta.json")
    patient = meta.get("patient") or {}
    caregivers = patient.get("caregivers") or []
    caregiver = caregivers[0] if caregivers else {
        "name": patient.get("guardian_name") or "Family Caregiver",
        "phone": patient.get("guardian_phone") or "",
        "relationship": "caregiver",
        "consent_status": "consented",
        "notification_preferences": ["sms"],
        "verified": True,
    }
    return run_id, meta, caregiver


@router.get("/{token}/patient", response_model=CaregiverPatientView)
def get_caregiver_patient_view(token: str):
    """Delivers the caregiver view of the patient recovery plan, adherence, and notifications."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)

    if not meta.get("approved"):
        raise HTTPException(
            403,
            detail={
                "error": "plan_not_approved",
                "message": "The recovery plan is still being reviewed by clinicians and will be accessible upon approval.",
            },
        )

    consent_status = caregiver.get("consent_status", "pending")
    if consent_status == "revoked":
        raise HTTPException(
            403,
            detail={
                "error": "consent_revoked",
                "message": "Caregiver portal access has been revoked by the patient or family contact.",
            },
        )

    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise HTTPException(404, "Approved recovery plan document not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    patient = meta.get("patient") or {}

    # Recovery tasks
    tasks = store.get_tasks(run_id)
    doses = store.get_dose_records(run_id)

    # Calculate adherence
    completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")
    adherence_rate = round((completed_tasks / max(1, len(tasks))) * 100, 1)

    # Active help alerts
    active_help_items = help_store.list("active", run_id=run_id, limit=1)
    active_help = active_help_items[0] if active_help_items else None

    # Notifications
    recent_notifs = [
        CaregiverNotification.model_validate(n) for n in store.get_notifications(run_id)[-10:]
    ]

    # Extract instructions and follow-ups
    instructions: dict[str, list[str]] = {
        "wound_care": [],
        "activity": [],
        "diet": [],
        "warning_signs": [],
    }
    follow_ups = []
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

    meds = [m.model_dump(mode="json") for m in build_medication_schedules(plan)]

    return CaregiverPatientView(
        run_id=run_id,
        patient_name=patient.get("name", "Patient"),
        language=patient.get("language", "en"),
        caregiver_name=caregiver.get("name", "Caregiver"),
        relationship=caregiver.get("relationship", "caregiver"),
        phone=caregiver.get("phone", ""),
        consent_status=consent_status,
        notification_preferences=caregiver.get("notification_preferences", ["sms"]),
        plan_duration_days=plan.plan_duration_days or 14,
        approved_at=meta.get("approved_at"),
        adherence_rate=adherence_rate,
        tasks_today=tasks,
        medications=meds,
        instructions=instructions,
        follow_ups=follow_ups,
        active_help=active_help,
        recent_notifications=recent_notifs,
    )


@router.post("/{token}/consent")
def update_caregiver_consent(token: str, body: CaregiverConsentUpdate):
    """Updates caregiver consent status and notification preferences."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)
    patient = meta.setdefault("patient", {})
    caregivers = patient.setdefault("caregivers", [])

    now_iso = datetime.now(timezone.utc).isoformat()
    caregiver["consent_status"] = body.consent_status
    if body.notification_preferences is not None:
        caregiver["notification_preferences"] = body.notification_preferences

    if body.consent_status == "consented":
        caregiver["verified"] = True
        caregiver["consent_timestamp"] = now_iso
    elif body.consent_status == "revoked":
        caregiver["verified"] = False

    if not any(c.get("phone") == caregiver.get("phone") for c in caregivers):
        caregivers.append(caregiver)

    store.write(run_id, "meta.json", meta)
    store.audit(run_id, "caregiver", "caregiver.consent_updated",
                status=body.consent_status, preferences=caregiver.get("notification_preferences"))
    bus.emit(run_id, Stage.CAREGIVER, "caregiver.consent_updated", {
        "consent_status": body.consent_status,
        "caregiver_name": caregiver.get("name"),
    })
    return {"status": "ok", "caregiver": caregiver}


@router.post("/{token}/tasks/{task_id}/action")
def caregiver_task_action(token: str, task_id: str, body: TaskActionRequest):
    """Allows authorized caregiver to complete, snooze, or reset a patient recovery task."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)
    if caregiver.get("consent_status") == "revoked":
        raise HTTPException(403, "Caregiver access has been revoked")

    status_map = {"complete": "completed", "snooze": "snoozed", "reset": "pending"}
    new_status = status_map[body.action]

    snooze_until = None
    if body.action == "snooze":
        snooze_until = datetime.now(timezone.utc).isoformat()

    updated = store.update_task_status(
        run_id=run_id,
        task_id=task_id,
        status=new_status,
        snooze_until=snooze_until,
        completed_by="caregiver",
    )
    if not updated:
        raise HTTPException(404, f"Task {task_id} not found")

    bus.emit(run_id, Stage.TASKS, "tasks.action", {
        "task_id": task_id,
        "action": body.action,
        "actor": "caregiver",
    })
    return updated


@router.post("/{token}/medications/{med_id}/report-dose")
def caregiver_report_dose(token: str, med_id: str, body: MedicationDoseActionRequest):
    """Allows authorized caregiver to record medication intake on behalf of the patient."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)
    if caregiver.get("consent_status") == "revoked":
        raise HTTPException(403, "Caregiver access has been revoked")

    record = store.record_dose_action(
        run_id=run_id,
        med_or_dose_id=med_id,
        reported_taken=body.reported_taken,
        via="caregiver_portal",
        note=body.note,
    )
    bus.emit(run_id, Stage.CAREGIVER, "medication.dose_reported", {
        "med_id": med_id,
        "reported_taken": body.reported_taken,
        "actor": "caregiver",
    })
    return record


@router.post("/{token}/notify", response_model=CaregiverNotification)
def notify_caregiver(token: str, body: CaregiverNotifyRequest):
    """Dispatches a notification to the caregiver across preferred channels."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)
    if caregiver.get("consent_status") == "revoked":
        raise HTTPException(403, "Caregiver access has been revoked")

    patient_name = meta.get("patient", {}).get("name", "Patient")
    recipient_phone = caregiver.get("phone", "+91 98000 00000")
    recipient_name = caregiver.get("name", "Caregiver")

    # Select channel
    channel_name = body.channel or (caregiver.get("notification_preferences") or ["sms"])[0]
    channel = channel_registry.get(channel_name) or channel_registry.get("sms")

    # Compose message
    if body.custom_message:
        message = body.custom_message
    elif body.notification_type == "emergency":
        message = f"URGENT: {patient_name} has signaled distress. Clinical care team is responding. Please check on them."
    elif body.notification_type == "missed_dose":
        message = f"Care Notice: {patient_name} has an overdue medication dose. Please verify intake in your caregiver portal."
    elif body.notification_type == "milestone":
        message = f"Recovery Milestone: {patient_name} has successfully completed all daily tasks today! Adherence is on track."
    else:
        message = f"Daily Recovery Update: {patient_name}'s recovery tasks are progressing smoothly today."

    delivery = channel.deliver(recipient_phone, message)
    now_iso = datetime.now(timezone.utc).isoformat()

    notif = CaregiverNotification(
        notification_id=f"notif_{uuid.uuid4().hex[:8]}",
        run_id=run_id,
        recipient_name=recipient_name,
        recipient_phone=recipient_phone,
        channel=channel_name,
        notification_type=body.notification_type,
        message=message,
        sent_at=now_iso,
        status="delivered" if delivery.status in ("delivered", "sent") else "failed",
        details={"error": delivery.error} if delivery.error else None,
    )

    store.save_notification(run_id, notif.model_dump())
    store.audit(run_id, "system", "caregiver.notified",
                type=body.notification_type, channel=channel_name, status=notif.status)
    bus.emit(run_id, Stage.CAREGIVER, "caregiver.notified", {
        "notification_id": notif.notification_id,
        "type": body.notification_type,
        "status": notif.status,
    })

    return notif


@router.get("/{token}/notifications", response_model=list[CaregiverNotification])
def list_caregiver_notifications(token: str):
    """Retrieves all notifications dispatched for this caregiver."""
    run_id, meta, caregiver = _resolve_caregiver_run(token)
    notifs = store.get_notifications(run_id)
    return [CaregiverNotification.model_validate(n) for n in notifs]
