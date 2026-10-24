from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class CaregiverConsentUpdate(BaseModel):
    consent_status: Literal["pending", "consented", "revoked"]
    notification_preferences: Optional[list[str]] = None


class CaregiverNotifyRequest(BaseModel):
    notification_type: Literal["emergency", "missed_dose", "milestone", "daily_summary"]
    channel: Optional[Literal["sms", "whatsapp"]] = None
    custom_message: Optional[str] = None


class CaregiverNotification(BaseModel):
    notification_id: str
    run_id: str
    recipient_name: str
    recipient_phone: str
    channel: str
    notification_type: str
    message: str
    sent_at: str
    status: Literal["sent", "failed", "delivered"] = "delivered"
    details: Optional[dict[str, Any]] = None


class CaregiverPatientView(BaseModel):
    run_id: str
    patient_name: str
    language: str = "en"
    caregiver_name: str
    relationship: str
    phone: str
    consent_status: Literal["pending", "consented", "revoked"]
    notification_preferences: list[str] = Field(default_factory=lambda: ["sms"])
    plan_duration_days: int = 14
    approved_at: Optional[str] = None
    adherence_rate: float = 0.0
    tasks_today: list[dict[str, Any]] = Field(default_factory=list)
    medications: list[dict[str, Any]] = Field(default_factory=list)
    instructions: dict[str, list[str]] = Field(default_factory=dict)
    follow_ups: list[dict[str, Any]] = Field(default_factory=list)
    active_help: Optional[dict[str, Any]] = None
    recent_notifications: list[CaregiverNotification] = Field(default_factory=list)
