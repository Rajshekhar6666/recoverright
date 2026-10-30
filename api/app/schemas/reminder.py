"""Schemas and models for the provider-independent medication reminder engine."""
from typing import Literal, Optional
from pydantic import BaseModel, Field


DeliveryChannelType = Literal["in_app", "sms", "whatsapp", "voice"]
ReminderStatus = Literal["scheduled", "attempted", "delivered", "failed", "acknowledged", "snoozed", "cancelled", "missed"]


class DeliveryResult(BaseModel):
    """Result of a reminder delivery attempt through a channel provider."""
    success: bool
    channel: DeliveryChannelType
    message_id: str
    recipient: str
    status: Literal["delivered", "failed", "simulated"]
    error: Optional[str] = None
    timestamp: str


class ReminderJob(BaseModel):
    """Discrete, idempotent reminder job scheduled for an approved medication."""
    job_id: str
    run_id: str
    plan_version: int = 1
    medication_id: str
    medication_name: str
    dose: Optional[str] = None
    scheduled_time: str  # e.g. "08:00 AM"
    scheduled_date: str  # e.g. "2026-10-23"
    timezone: str = "Asia/Kolkata"
    channel: DeliveryChannelType = "in_app"
    status: ReminderStatus = "scheduled"
    attempts: int = 0
    max_retries: int = 3
    last_attempt_at: Optional[str] = None
    delivered_at: Optional[str] = None
    acknowledged_at: Optional[str] = None
    snooze_until: Optional[str] = None
    error: Optional[str] = None
    message_body: Optional[str] = None


class ReminderTriggerRequest(BaseModel):
    """Request to deterministically trigger a reminder."""
    channel: Optional[DeliveryChannelType] = None
    simulate_failure: bool = False


class ReminderSnoozeRequest(BaseModel):
    """Request to snooze a reminder."""
    minutes: int = 10
    by: Literal["patient", "caregiver", "voice"] = "patient"


class ReminderAckRequest(BaseModel):
    """Request to acknowledge receipt of a reminder."""
    acknowledged: bool = True
    via: Literal["app_button", "voice", "sms_reply", "caregiver_portal", "staff"] = "app_button"


class ReminderListResponse(BaseModel):
    """List of reminder jobs for a patient plan."""
    run_id: str
    current_version: int
    reminders: list[ReminderJob] = Field(default_factory=list)
