"""Shared API contracts and data models for RecoverRight.

Includes patient profiles, caregiver consent, versioned plans, recovery tasks,
medication tracking (strictly isolating reminder delivery, acknowledgement,
and reported ingestion), and server-sanitized patient delivery views.
"""
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class CaregiverContact(BaseModel):
    """Authorized caregiver contact and consent preferences."""
    name: str
    phone: str
    relationship: str = "caregiver"
    consent_status: Literal["pending", "consented", "revoked"] = "pending"
    consent_timestamp: Optional[str] = None
    notification_preferences: list[str] = Field(default_factory=lambda: ["sms"])
    verified: bool = False


class PatientProfile(BaseModel):
    """Patient demographics and linked caregiver consent."""
    patient_id: str
    run_id: str
    name: str
    language: str = "en"
    phone: str = ""
    patient_token: str
    caregivers: list[CaregiverContact] = Field(default_factory=list)
    created_at: str


class ApprovedPlanItem(BaseModel):
    """A single approved item from the discharge review."""
    field_id: str
    category: str
    attrs: Optional[dict[str, Optional[str]]] = None
    decision: str = "auto"  # "auto", "confirmed", "edited"
    decided_by: Optional[str] = None
    status_at_review: str = "agreed"
    edited_from: Optional[dict[str, Optional[str]]] = None
    issues_at_review: list[str] = Field(default_factory=list)
    source: dict[str, Any] = Field(default_factory=dict)


class PlanVersionSummary(BaseModel):
    """Summary of a specific plan version approval."""
    version: int
    approved_by: str
    approved_at: str
    items_count: int
    note: Optional[str] = None


class ApprovedPlan(BaseModel):
    """Clinician-approved recovery plan with multi-version support."""
    run_id: str
    version: int = 1
    patient_token: Optional[str] = None
    approved_by: str
    approved_at: str
    patient: dict[str, Any] = Field(default_factory=dict)
    source_file: Optional[str] = None
    items: list[ApprovedPlanItem] = Field(default_factory=list)
    removed: list[dict[str, Any]] = Field(default_factory=list)
    plan_duration_days: Optional[int] = None
    recovery_start_date: Optional[str] = None
    version_history: list[PlanVersionSummary] = Field(default_factory=list)


class MedicationSchedule(BaseModel):
    """Parsed medication instructions and daily schedule times."""
    id: str
    name: str
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    times: list[str] = Field(default_factory=list)
    instructions: Optional[str] = None


class RecoveryTask(BaseModel):
    """A discrete recovery task scheduled for a patient."""
    task_id: str
    run_id: str
    plan_version: int = 1
    category: Literal["medication", "wound_care", "activity", "diet", "follow_up", "vital_check", "general"]
    title: str
    description: str = ""
    scheduled_time: Optional[str] = None  # e.g. "08:00 AM"
    scheduled_date: Optional[str] = None  # e.g. "2026-10-23"
    status: Literal["pending", "completed", "snoozed", "missed", "cancelled"] = "pending"
    completed_at: Optional[str] = None
    completed_by: Optional[Literal["patient", "caregiver", "voice", "staff"]] = None
    notes: Optional[str] = None


class MedicationDoseRecord(BaseModel):
    """Records medication reminder delivery, acknowledgement, and reported dose taken.
    
    Clinical safety rule: Reminder delivery != acknowledgement != ingestion.
    """
    dose_id: str
    run_id: str
    plan_version: int = 1
    medication_id: str
    medication_name: str
    dose: Optional[str] = None
    scheduled_time: Optional[str] = None
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    reported_taken: bool = False
    reported_taken_at: Optional[str] = None
    reported_via: Optional[Literal["app_button", "voice", "sms_reply", "caregiver_portal", "staff"]] = None
    snooze_until: Optional[str] = None
    notes: Optional[str] = None


class PatientPlanResponse(BaseModel):
    """Sanitized patient-facing view of the approved recovery plan."""
    run_id: str
    patient_name: str
    phone: str = ""
    language: str = "en"
    version: int
    approved_at: str
    plan_duration_days: Optional[int] = None
    medications: list[MedicationSchedule] = Field(default_factory=list)
    instructions: dict[str, list[str]] = Field(default_factory=dict)
    follow_ups: list[dict[str, Any]] = Field(default_factory=list)
    contacts: list[dict[str, str]] = Field(default_factory=list)
    caregivers: list[CaregiverContact] = Field(default_factory=list)
    tasks_today: list[RecoveryTask] = Field(default_factory=list)
    demo: bool = False
    patient_slug: Optional[str] = None
    dashboard_url: Optional[str] = None


class TaskActionRequest(BaseModel):
    """Request to update a task status."""
    action: Literal["complete", "snooze", "cancel", "reset"] = "complete"
    by: Literal["patient", "caregiver", "voice", "staff"] = "patient"
    note: Optional[str] = None


class MedicationDoseActionRequest(BaseModel):
    """Request to report medication ingestion."""
    reported_taken: bool = True
    via: str = "app_button"
    note: Optional[str] = None


class MedicationAckRequest(BaseModel):
    """Request to acknowledge reminder receipt."""
    acknowledged: bool = True
    via: str = "app_button"


class ReapproveRequest(BaseModel):
    """Request to re-approve a plan with modifications, creating a new version."""
    by: str = "staff"
    note: Optional[str] = None


class PillScanRequest(BaseModel):
    """Request payload for AI pill camera verification."""
    image_data: Optional[str] = None
    sample_id: Optional[str] = None
    detected_text: Optional[str] = None
    language: str = "en"


class MatchedMedication(BaseModel):
    """Prescribed medication matched against scanned pill."""
    id: str
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    instructions: Optional[str] = None
    times: list[str] = Field(default_factory=list)


class PillScanResponse(BaseModel):
    """Clinical verification outcome for scanned pill."""
    verified: bool
    status: Literal["VERIFIED_MATCH", "SAFETY_WARNING", "DOSAGE_MISMATCH", "UNRECOGNIZED"]
    detected_name: str
    detected_dose: str
    raw_text: str = ""
    confidence: float = 1.0
    safety_alert: Optional[str] = None
    safety_alert_hi: Optional[str] = None
    warning_level: Optional[str] = None
    spoken_summary_en: str
    spoken_summary_hi: str
    matched_medication: Optional[MatchedMedication] = None


class MedicationInput(BaseModel):
    """Medication order for registration and batch intake."""
    name: str
    dose: Optional[str] = "500 mg"
    frequency: Optional[str] = "Twice daily"
    instructions: Optional[str] = "Take with water after meals"
    duration: Optional[str] = "5 days"


class PatientRegisterRequest(BaseModel):
    """Direct registration and intake schema for a patient."""
    name: str
    phone: Optional[str] = ""
    language: Optional[str] = "en"
    guardian_name: Optional[str] = ""
    guardian_phone: Optional[str] = ""
    procedure: Optional[str] = "Post-Surgical Clinical Recovery"
    medications: list[MedicationInput] = Field(default_factory=list)
    wound_care: Optional[str] = "Keep surgical dressing clean and dry."
    activity: Optional[str] = "Gentle walking as tolerated. Avoid strenuous lifting (>5kg)."
    diet: Optional[str] = "High-protein diet with plenty of fluids."
    warning_signs: Optional[str] = "Report fever >101 F, worsening pain, or redness immediately."
    follow_up: Optional[str] = "In 7 days with surgical care team"
    auto_approve: bool = True


class PatientRegisterResponse(BaseModel):
    """Result of saving a new patient record."""
    run_id: str
    patient_name: str
    phone: str
    language: str
    slug: str
    patient_token: str
    dashboard_url: str
    status: str = "saved"
    approved: bool = True
    created_at: str


class BatchImportItemResult(BaseModel):
    """Successfully imported patient item."""
    run_id: str
    patient_name: str
    phone: str
    slug: str
    patient_token: str
    dashboard_url: str
    status: str = "saved"


class BatchImportFailedResult(BaseModel):
    """Record that failed validation or duplicate check during batch import."""
    index: int
    patient_name: Optional[str] = ""
    reason: str


class BatchImportResponse(BaseModel):
    """Outcome of processing a batch of patient records."""
    total: int
    imported_count: int
    failed_count: int
    imported: list[BatchImportItemResult]
    failed: list[BatchImportFailedResult]


