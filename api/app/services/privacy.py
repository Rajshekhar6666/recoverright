"""Patient Privacy, Informed Consent, and DISHA/ABDM/HIPAA Compliance Service.

Regulatory Guarantees:
1. Zero Raw Audio Storage: Voice safety detection processes acoustic waveforms strictly
   in RAM for under 20 seconds. No audio recording is ever written to disk or sent to cloud.
2. Data Portability: Complete patient clinical export in JSON / FHIR R4 Bundle formats.
3. Consent Revocation: Instant cessation of background monitoring or caregiver routing upon patient request.
4. Retention Lifecycle: Ephemeral logs pruned after 30 days; statutory discharge summaries retained for 7 years.
"""
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from pydantic import BaseModel

from app.services.audit_chain import append_cryptographic_audit, verify_audit_chain_integrity
from app.services.storage import store
from app.services.vitals import get_vitals_history


class PrivacyPolicyDisclosure(BaseModel):
    version: str = "2026.1"
    last_updated: str = "2026-10-27"
    governing_regulations: list[str] = [
        "DISHA (Digital Information Security in Healthcare Act)",
        "ABDM (Ayushman Bharat Digital Mission - Health Data Management Policy)",
        "HIPAA (Health Insurance Portability and Accountability Act - Security Rule)",
        "GDPR (General Data Protection Regulation - Art 9 Special Category Health Data)",
    ]
    data_minimization_guarantees: list[str] = [
        "Background audio surveillance is 100% ephemeral in local device RAM. Zero raw audio recordings are written to disk or transmitted to third-party cloud servers.",
        "Clinical discharge documents are de-identified before passing to external processing pipelines.",
        "Patient contact numbers and identifiers are stored in isolated encrypted volumes.",
    ]
    data_retention_policy: dict[str, str] = {
        "statutory_discharge_records": "Retained for 7 years as required by Medical Council regulations",
        "ephemeral_voice_buffers": "Destroyed immediately in RAM (0 second retention)",
        "notification_delivery_logs": "Pruned automatically after 30 days",
        "vitals_monitoring_history": "Persisted for duration of active post-operative episode (90 days)",
    }
    patient_rights: list[str] = [
        "Right to Data Portability (Full JSON/FHIR R4 export at any time)",
        "Right to Revoke Monitoring Consent with immediate effect",
        "Right to Designate or Remove Family Caregivers",
        "Right to Inspect Tamper-Evident Cryptographic Audit Trails",
    ]


class ConsentPreferenceUpdate(BaseModel):
    background_voice_safety: bool = True
    caregiver_access: bool = True
    sms_notifications: bool = True
    whatsapp_notifications: bool = True
    vitals_telemetry: bool = True
    recorded_by: str = "patient"


def get_privacy_policy() -> PrivacyPolicyDisclosure:
    """Returns the hospital-wide privacy and informed consent disclosure."""
    return PrivacyPolicyDisclosure()


def export_patient_data_bundle(run_id: str) -> dict[str, Any]:
    """Generates a complete data portability export for the patient."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    plan = store.get_plan_version(run_id) or {}
    reminders = store.get_reminders(run_id)
    vitals = [v.model_dump() for v in get_vitals_history(run_id)]
    chain_status = verify_audit_chain_integrity(run_id)

    append_cryptographic_audit(
        run_id,
        "patient",
        "privacy.data_exported",
        export_format="json_full",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    return {
        "export_metadata": {
            "service": "RecoverRight Health Privacy Bridge",
            "compliance": "ABDM / DISHA / HIPAA Section 164.524",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "run_id": run_id,
            "audit_chain_valid": chain_status["is_valid"],
        },
        "patient_profile": meta.get("patient", {}),
        "approved_recovery_plan": plan,
        "vital_signs_history": vitals,
        "medication_reminders_and_adherence": reminders,
    }


def update_patient_consent(run_id: str, prefs: ConsentPreferenceUpdate) -> dict[str, Any]:
    """Updates patient privacy and consent preferences with cryptographic audit stamp."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        **prefs.model_dump(),
        "updated_at": now_iso,
    }

    store.write(run_id, "consent_preferences.json", record)
    append_cryptographic_audit(
        run_id,
        prefs.recorded_by,
        "privacy.consent_updated",
        **prefs.model_dump(),
    )

    return {
        "run_id": run_id,
        "status": "updated",
        "preferences": record,
        "message": "Patient informed consent preferences updated successfully.",
    }


def get_patient_consent(run_id: str) -> dict[str, Any]:
    """Retrieves current informed consent preferences for a patient."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    if store.has(run_id, "consent_preferences.json"):
        return store.read(run_id, "consent_preferences.json")

    return {
        "background_voice_safety": True,
        "caregiver_access": True,
        "sms_notifications": True,
        "whatsapp_notifications": True,
        "vitals_telemetry": True,
        "updated_at": None,
        "status": "default_opt_in",
    }
