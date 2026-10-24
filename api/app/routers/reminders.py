"""API router for medication reminder engine and delivery channels."""
from typing import Optional
from fastapi import APIRouter, HTTPException

from app.schemas.api import ApprovedPlan
from app.schemas.reminder import (
    ReminderAckRequest,
    ReminderJob,
    ReminderListResponse,
    ReminderSnoozeRequest,
    ReminderTriggerRequest,
)
from app.services.reminder import (
    acknowledge_reminder,
    get_reminders_for_run,
    schedule_reminders_for_plan,
    snooze_reminder,
    trigger_reminder,
)
from app.services.storage import store

router = APIRouter(tags=["reminders"])


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
                "message": "Your recovery plan is still being reviewed by the clinical team.",
                "status": "pending_review",
            },
        )
    return run_id, meta


@router.get("/plans/{token}/reminders", response_model=ReminderListResponse)
def get_patient_reminders(token: str):
    """Gets all scheduled and delivered reminders for the approved plan."""
    run_id, meta = _resolve_and_verify(token)
    curr_version = meta.get("current_version", 1)

    jobs = get_reminders_for_run(run_id)
    if not jobs:
        plan_dict = store.get_plan_version(run_id)
        if plan_dict:
            plan = ApprovedPlan.model_validate(plan_dict)
            jobs = schedule_reminders_for_plan(plan)

    return ReminderListResponse(
        run_id=run_id,
        current_version=curr_version,
        reminders=jobs,
    )


@router.post("/plans/{token}/reminders/{job_id}/trigger", response_model=ReminderJob)
def trigger_patient_reminder(token: str, job_id: str, body: ReminderTriggerRequest):
    """Deterministically triggers delivery of a reminder job."""
    run_id, _ = _resolve_and_verify(token)
    try:
        job = trigger_reminder(
            run_id,
            job_id,
            channel_override=body.channel,
            simulate_failure=body.simulate_failure,
        )
        return job
    except KeyError:
        raise HTTPException(404, f"Reminder job {job_id} not found")


@router.post("/plans/{token}/reminders/{job_id}/snooze", response_model=ReminderJob)
def snooze_patient_reminder(token: str, job_id: str, body: ReminderSnoozeRequest):
    """Snoozes a reminder for a designated period (default 10 minutes)."""
    run_id, _ = _resolve_and_verify(token)
    try:
        return snooze_reminder(run_id, job_id, minutes=body.minutes, by=body.by)
    except KeyError:
        raise HTTPException(404, f"Reminder job {job_id} not found")


@router.post("/plans/{token}/reminders/{job_id}/acknowledge", response_model=ReminderJob)
def ack_patient_reminder(token: str, job_id: str, body: Optional[ReminderAckRequest] = None, via: str = "app_button"):
    """Acknowledges receipt of a reminder."""
    run_id, _ = _resolve_and_verify(token)
    ack_via = body.via if body else via
    try:
        return acknowledge_reminder(run_id, job_id, via=ack_via)
    except KeyError:
        raise HTTPException(404, f"Reminder job {job_id} not found")


@router.get("/runs/{run_id}/reminders", response_model=ReminderListResponse)
def get_staff_reminders(run_id: str):
    """Staff endpoint to inspect reminder delivery attempts and failure logs."""
    if not store.exists(run_id):
        raise HTTPException(404, "Run not found")
    meta = store.read(run_id, "meta.json")
    jobs = get_reminders_for_run(run_id)
    return ReminderListResponse(
        run_id=run_id,
        current_version=meta.get("current_version", 1),
        reminders=jobs,
    )
