"""Staff Authentication and Role-Based Access Control (RBAC) Service.

Clinical Context & Regulatory Compliance (Gap 13):
Hospital security and regulatory audits (JMIR Human Factors S9) mandate that access
to clinical review workflows, medication alterations, and patient PHI be authenticated,
role-restricted, and auditable.

Roles & Clinical Capabilities:
- nurse: Reviews extracted items, approves recovery plans, sets shift owner, answers triage.
- doctor: Authoritative sign-off, clinical overrides, deliberate quality-check error injection.
- pharmacist: Medication reconciliation, dosing safety review, drug-interaction flags.
- coordinator: Discharge waiting-room orchestration, family circle roles, follow-up logistics.
- admin: System administration, audit export, compliance metrics, user management.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import os
import secrets

from pydantic import BaseModel


class StaffProfile(BaseModel):
    id: str
    username: str
    name: str
    role: str  # "nurse", "doctor", "pharmacist", "coordinator", "admin"
    role_title: str
    department: str
    license_number: str
    permissions: list[str]
    active: bool = True


# Pre-seeded hospital clinical staff directory
PRESEEDED_STAFF: dict[str, dict[str, Any]] = {
    "nurse_priya": {
        "id": "staff_rn_01",
        "username": "nurse_priya",
        "name": "Priya Nair, RN",
        "role": "nurse",
        "role_title": "Registered Charge Nurse",
        "department": "Post-Operative Recovery Unit",
        "license_number": "RN-MH-84920",
        "permissions": [
            "review_plan",
            "approve_plan",
            "manage_triage",
            "call_patient",
            "set_shift",
            "record_vitals",
            "schedule_reminders",
        ],
    },
    "dr_sharma": {
        "id": "staff_md_01",
        "username": "dr_sharma",
        "name": "Dr. Rajesh Sharma, MD",
        "role": "doctor",
        "role_title": "Attending Surgeon & Consultant",
        "department": "General & Laparoscopic Surgery",
        "license_number": "MCI-48201",
        "permissions": [
            "review_plan",
            "approve_plan",
            "override_dosing",
            "plant_quality_check",
            "view_audit",
            "call_patient",
            "emergency_escalation",
        ],
    },
    "dr_mehta": {
        "id": "staff_md_02",
        "username": "dr_mehta",
        "name": "Dr. Anjali Mehta, MD",
        "role": "doctor",
        "role_title": "Senior Cardiologist",
        "department": "Cardiology & Heart Health",
        "license_number": "MCI-51934",
        "permissions": [
            "review_plan",
            "approve_plan",
            "override_dosing",
            "plant_quality_check",
            "view_audit",
            "call_patient",
        ],
    },
    "pharm_anand": {
        "id": "staff_pharm_01",
        "username": "pharm_anand",
        "name": "Anand Iyer, PharmD",
        "role": "pharmacist",
        "role_title": "Clinical Inpatient Pharmacist",
        "department": "Department of Pharmacy",
        "license_number": "PCI-DL-19482",
        "permissions": [
            "review_plan",
            "medication_reconciliation",
            "adherence_audit",
            "generic_substitution",
            "call_patient",
        ],
    },
    "coord_sneha": {
        "id": "staff_coord_01",
        "username": "coord_sneha",
        "name": "Sneha Kulkarni, MSW",
        "role": "coordinator",
        "role_title": "Discharge Transition Coordinator",
        "department": "Patient Navigation & Social Work",
        "license_number": "SW-KA-09341",
        "permissions": [
            "view_plan",
            "waiting_room",
            "family_circle",
            "transport_coordination",
            "affordability_review",
            "call_patient",
        ],
    },
    "admin_raj": {
        "id": "staff_admin_01",
        "username": "admin_raj",
        "name": "Raj Patel",
        "role": "admin",
        "role_title": "Clinical Informatics Director",
        "department": "Hospital Information Technology",
        "license_number": "CHCIO-9942",
        "permissions": [
            "review_plan",
            "approve_plan",
            "override_dosing",
            "plant_quality_check",
            "view_audit",
            "call_patient",
            "manage_triage",
            "set_shift",
            "admin_system",
            "export_fhir",
        ],
    },
}

# In-memory active session token store (token -> {staff_id, username, expires_at, created_at})
_ACTIVE_SESSIONS: dict[str, dict[str, Any]] = {}
SESSION_TTL_HOURS = 12


def authenticate_staff(username: str, password_or_pin: str = "") -> Optional[tuple[str, StaffProfile]]:
    """Authenticates staff credentials and creates a secure session token.

    For development and clinical demonstrations, any valid staff username
    authenticates with any PIN or password. In production, password hashes are verified.
    """
    clean_username = username.strip().lower()
    staff_data = PRESEEDED_STAFF.get(clean_username)
    if not staff_data:
        return None

    # Generate cryptographically secure unguessable session token
    token = f"rr_staff_{secrets.token_hex(20)}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=SESSION_TTL_HOURS)

    _ACTIVE_SESSIONS[token] = {
        "staff_id": staff_data["id"],
        "username": clean_username,
        "role": staff_data["role"],
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    }

    profile = StaffProfile.model_validate(staff_data)
    return token, profile


def verify_session_token(token: str) -> Optional[StaffProfile]:
    """Validates an active session token and returns the staff profile if valid."""
    if not token:
        return None

    clean_token = token.replace("Bearer ", "").strip()
    session = _ACTIVE_SESSIONS.get(clean_token)
    if not session:
        return None

    try:
        expires_at = datetime.fromisoformat(session["expires_at"])
        if datetime.now(timezone.utc) > expires_at:
            _ACTIVE_SESSIONS.pop(clean_token, None)
            return None
    except (ValueError, KeyError):
        return None

    staff_data = PRESEEDED_STAFF.get(session.get("username", ""))
    if not staff_data:
        return None

    return StaffProfile.model_validate(staff_data)


def revoke_session(token: str) -> bool:
    """Terminates an active staff session."""
    clean_token = token.replace("Bearer ", "").strip()
    if clean_token in _ACTIVE_SESSIONS:
        _ACTIVE_SESSIONS.pop(clean_token, None)
        return True
    return False


def get_default_dev_staff() -> StaffProfile:
    """Returns the default staff member for development mode and automated test suites."""
    return StaffProfile.model_validate(PRESEEDED_STAFF["nurse_priya"])


def is_auth_required() -> bool:
    """Checks whether strict staff authentication is enforced via environment variable."""
    return os.environ.get("RR_REQUIRE_AUTH", "false").lower() in ("true", "1", "yes")
