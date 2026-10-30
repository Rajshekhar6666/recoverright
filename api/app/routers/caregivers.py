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


# ── Feature: Family Circle Delegation ──────────────────────────────────────

from pydantic import BaseModel, Field

class FamilyMemberRole(BaseModel):
    name: str
    phone: str = ""
    relationship: str = "Family Member"
    roles: list[str] = Field(default_factory=list)  # ["medications", "wound_care", "transport", "emergency"]
    availability: str = "Full-time"
    primary_contact: bool = False


class FamilyCircleUpdate(BaseModel):
    members: list[FamilyMemberRole]
    updated_by: str = "caregiver"


@router.get("/{token}/family-circle")
def get_family_circle(token: str):
    """Retrieves assigned family circle caregiving roles and emergency hierarchy."""
    run_id, meta, _ = _resolve_caregiver_run(token)
    circle = store.read(run_id, "family_circle.json") if store.has(run_id, "family_circle.json") else []
    return {
        "run_id": run_id,
        "patient_name": meta.get("patient", {}).get("name", "Patient"),
        "total_members": len(circle),
        "members": circle,
        "available_role_definitions": [
            {"id": "medications", "label": "Medicine Administration", "description": "Responsible for daily pill reminders and logging doses"},
            {"id": "wound_care", "label": "Wound Care & Dressing", "description": "Monitors surgical dressing, cleanliness, and signs of infection"},
            {"id": "vitals", "label": "Vitals & Glucose", "description": "Takes and records BP, temperature, and blood glucose"},
            {"id": "transport", "label": "Clinic Follow-Up Driver", "description": "Coordinates travel to scheduled clinical appointments"},
            {"id": "emergency", "label": "Primary Hospital Contact", "description": "Called first in case of critical distress or triage escalation"},
        ],
    }


@router.post("/{token}/family-circle")
def update_family_circle(token: str, body: FamilyCircleUpdate):
    """Updates designated family roles (medication admin, driver, primary contact)."""
    run_id, _, _ = _resolve_caregiver_run(token)
    members_data = [m.model_dump() for m in body.members]
    with store.lock(run_id):
        store.write(run_id, "family_circle.json", members_data)
        store.audit(run_id, body.updated_by, "family_circle.updated", count=len(members_data))
    bus.emit(run_id, Stage.CAREGIVER, "family_circle.updated", {"count": len(members_data)})
    return {"status": "saved", "members": members_data}


# ── Gap 7 & 11: Caregiver Phone Verification & Consent (Caregiver-First Mode) ──

class CaregiverPhoneVerifyRequest(BaseModel):
    phone: str
    caregiver_name: Optional[str] = None
    relationship: Optional[str] = "family"


class CaregiverConsentRequest(BaseModel):
    consented: bool
    consent_type: str = "sms_reminders"  # "sms_reminders", "plan_view", "emergency_alerts"
    recorded_by: str = "caregiver"
    notes: Optional[str] = None


@router.post("/{token}/verify-phone")
def verify_caregiver_phone(token: str, body: CaregiverPhoneVerifyRequest):
    """Registers and verifies a caregiver's phone number for caregiver-first delivery mode.

    Gap 7 & 11 (Gaps S6, S12): Older adults and patients with low digital literacy
    may not use smartphones directly. The caregiver-first model routes reminders,
    alerts, and plan summaries to a verified family member's phone instead of
    (or in addition to) the patient's phone. This endpoint registers the phone
    and marks it 'verified' — in production, a real OTP would be sent and confirmed.
    """
    run_id, meta, _ = _resolve_caregiver_run(token)
    patient = meta.get("patient", {})

    # Validate phone — basic format check (E.164 or Indian 10-digit)
    import re as _re
    phone_clean = _re.sub(r"[\s\-\(\)]", "", body.phone)
    if not _re.match(r"^\+?[0-9]{7,15}$", phone_clean):
        raise HTTPException(422, "phone number format invalid – use E.164 (+91XXXXXXXXXX) or 10-digit Indian format")

    # Store caregiver phone in meta
    caregiver_profile = {
        "phone": phone_clean,
        "caregiver_name": body.caregiver_name or "Family Caregiver",
        "relationship": body.relationship or "family",
        "verified": True,  # In production: set False until OTP confirmed
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "caregiver_first": True,  # Enables caregiver-first reminder routing
    }

    with store.lock(run_id):
        # Merge with existing patient meta
        existing_patient = store.read(run_id, "meta.json").get("patient", {})
        existing_patient["guardian_phone"] = phone_clean
        existing_patient["guardian_name"] = body.caregiver_name or existing_patient.get("guardian_name", "")
        existing_patient["caregiver_first"] = True
        existing_patient["caregiver_profile"] = caregiver_profile
        store.update_meta(run_id, patient=existing_patient)
        store.audit(run_id, body.caregiver_name or "caregiver", "caregiver.phone_verified",
                    phone=phone_clean, caregiver_first=True)

    bus.emit(run_id, Stage.CAREGIVER, "caregiver.phone_verified", {
        "phone": phone_clean,
        "caregiver_name": caregiver_profile["caregiver_name"],
        "caregiver_first_enabled": True,
    })

    return {
        "verified": True,
        "caregiver_first_enabled": True,
        "phone": phone_clean,
        "caregiver_name": caregiver_profile["caregiver_name"],
        "message": (
            "Phone registered. Reminders and alerts will now be routed to this number. "
            "In production, an OTP confirmation would be required."
        ),
    }


@router.post("/{token}/record-consent")
def record_caregiver_consent(token: str, body: CaregiverConsentRequest):
    """Records explicit caregiver consent for data sharing, notifications, and plan access.

    Gap 11 (S6): Families reinforced instructions and acted as interpreters.
    Informed consent for caregivers must be recorded before PHI is shared with them.
    This endpoint captures consent type (plan_view, sms_reminders, emergency_alerts)
    and the timestamp — creating an auditable consent record.
    """
    VALID_CONSENT_TYPES = {"sms_reminders", "plan_view", "emergency_alerts", "all"}
    if body.consent_type not in VALID_CONSENT_TYPES:
        raise HTTPException(422, f"consent_type must be one of {sorted(VALID_CONSENT_TYPES)}")

    run_id, meta, caregiver = _resolve_caregiver_run(token)

    consent_record = {
        "consent_type": body.consent_type,
        "consented": body.consented,
        "recorded_by": body.recorded_by,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "notes": body.notes or "",
    }

    with store.lock(run_id):
        existing_consents: list = []
        if store.has(run_id, "caregiver_consents.json"):
            try:
                existing_consents = store.read(run_id, "caregiver_consents.json")
            except Exception:
                existing_consents = []
        existing_consents.append(consent_record)
        store.write(run_id, "caregiver_consents.json", existing_consents)
        store.audit(run_id, body.recorded_by, "caregiver.consent_recorded",
                    consent_type=body.consent_type, consented=body.consented)

    bus.emit(run_id, Stage.CAREGIVER, "caregiver.consent_recorded", consent_record)

    return {
        "recorded": True,
        "consent_type": body.consent_type,
        "consented": body.consented,
        "message": (
            f"Consent {'granted' if body.consented else 'declined'} for '{body.consent_type}'."
        ),
    }


@router.get("/{token}/consents")
def get_caregiver_consents(token: str):
    """Returns all recorded consent entries for this caregiver."""
    run_id, _, _ = _resolve_caregiver_run(token)
    if not store.has(run_id, "caregiver_consents.json"):
        return {"run_id": run_id, "consents": [], "total": 0}
    try:
        consents = store.read(run_id, "caregiver_consents.json")
    except Exception:
        consents = []
    return {"run_id": run_id, "consents": consents, "total": len(consents)}


@router.get("/{token}/daily-digest")
def get_caregiver_daily_digest(token: str):
    """Returns an actionable daily recovery digest for family caregivers."""
    from app.services.caregiver_digest import generate_caregiver_digest
    run_id, _, _ = _resolve_caregiver_run(token)
    try:
        return generate_caregiver_digest(run_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
