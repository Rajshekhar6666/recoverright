"""Staff Authentication and Role-Based Access Control (RBAC) Router.

Provides session management, clinician role inspection, and security gating
for staff-only endpoints across RecoverRight.
"""
from typing import Any, Callable, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from app.services.auth import (
    PRESEEDED_STAFF,
    StaffProfile,
    authenticate_staff,
    get_default_dev_staff,
    is_auth_required,
    revoke_session,
    verify_session_token,
)
from app.services.patient_auth import (
    PatientSession,
    request_patient_otp,
    verify_patient_otp,
    verify_patient_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class PatientOTPRequest(BaseModel):
    phone: str


class PatientOTPVerify(BaseModel):
    phone: str
    otp_code: str


def get_current_patient(
    authorization: Optional[str] = Header(None),
    x_patient_token: Optional[str] = Header(None),
) -> PatientSession:
    """FastAPI dependency resolving the authenticated patient session."""
    raw_token = authorization or x_patient_token
    if raw_token:
        sess = verify_patient_session(raw_token)
        if sess:
            return sess

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Patient session required. Please log in with your phone and OTP.",
        headers={"WWW-Authenticate": "Bearer"},
    )


class LoginRequest(BaseModel):
    username: str
    password_or_pin: Optional[str] = ""


class LoginResponse(BaseModel):
    token: str
    staff: StaffProfile
    expires_in_hours: int = 12
    message: str = "Authenticated successfully"


class RoleDefinition(BaseModel):
    role: str
    title: str
    description: str
    permissions: list[str]


# ── Dependency: Get Current Authenticated Staff Member ───────────────────────

def get_current_staff(
    authorization: Optional[str] = Header(None),
    x_staff_token: Optional[str] = Header(None),
) -> StaffProfile:
    """FastAPI dependency resolving the authenticated clinician.

    Supports:
    1. 'Authorization: Bearer <token>' header
    2. 'X-Staff-Token: <token>' header
    3. Fallback: If RR_REQUIRE_AUTH is not strictly enabled (default for dev/tests),
       returns default Nurse Priya so existing workflows and test suites continue uninterrupted.
    """
    token = authorization or x_staff_token
    if token:
        profile = verify_session_token(token)
        if profile:
            return profile

    if is_auth_required():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff authentication required. Provide valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # In development/test mode, fall back to default charge nurse
    return get_default_dev_staff()


def require_role(*allowed_roles: str) -> Callable[[StaffProfile], StaffProfile]:
    """Dependency factory checking that the staff member holds one of the required roles."""
    def _role_checker(staff: StaffProfile = Depends(get_current_staff)) -> StaffProfile:
        if "admin" == staff.role or staff.role in allowed_roles:
            return staff
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Action requires one of the following roles: {', '.join(allowed_roles)}. "
                f"Current role: '{staff.role}' ({staff.name})."
            ),
        )
    return _role_checker


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
def staff_login(body: LoginRequest):
    """Authenticates a hospital clinician and issues an unguessable 12-hour session token."""
    result = authenticate_staff(body.username, body.password_or_pin or "")
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid username '{body.username}'. Select a valid clinician from the staff directory.",
        )
    token, profile = result
    return LoginResponse(token=token, staff=profile)


@router.get("/me", response_model=StaffProfile)
def get_current_clinician(staff: StaffProfile = Depends(get_current_staff)):
    """Returns the authenticated clinician profile, active role, and clinical permissions."""
    return staff


@router.post("/logout")
def staff_logout(authorization: Optional[str] = Header(None), x_staff_token: Optional[str] = Header(None)):
    """Revokes the current staff session token."""
    token = authorization or x_staff_token
    if token:
        revoke_session(token)
    return {"status": "logged_out", "message": "Staff session revoked successfully."}


@router.get("/staff-directory")
def get_staff_directory():
    """Returns the hospital clinician directory for demo fast-switching."""
    return {
        "hospital": "City Memorial Hospital",
        "total_staff": len(PRESEEDED_STAFF),
        "staff": list(PRESEEDED_STAFF.values()),
    }


@router.get("/roles", response_model=list[RoleDefinition])
def get_clinical_roles():
    """Returns the hospital clinical role hierarchy and governance permission matrices."""
    return [
        RoleDefinition(
            role="nurse",
            title="Registered Nurse (RN)",
            description="Reviews extracted recovery items, approves discharge plans, sets shift owner, answers patient distress calls.",
            permissions=["review_plan", "approve_plan", "manage_triage", "call_patient", "set_shift", "record_vitals", "schedule_reminders"],
        ),
        RoleDefinition(
            role="doctor",
            title="Attending Physician / Surgeon",
            description="Authoritative clinical sign-off, prescription adjustments, quality-check audit error injection, and clinical overrides.",
            permissions=["review_plan", "approve_plan", "override_dosing", "plant_quality_check", "view_audit", "call_patient", "emergency_escalation"],
        ),
        RoleDefinition(
            role="pharmacist",
            title="Clinical Inpatient Pharmacist",
            description="Performs admission-vs-discharge medication reconciliation, flags drug interactions, and reviews dosing schedules.",
            permissions=["review_plan", "medication_reconciliation", "adherence_audit", "generic_substitution", "call_patient"],
        ),
        RoleDefinition(
            role="coordinator",
            title="Discharge Transition Coordinator",
            description="Manages discharge waiting-room progression, delegates family circle roles, and resolves affordability barriers.",
            permissions=["view_plan", "waiting_room", "family_circle", "transport_coordination", "affordability_review", "call_patient"],
        ),
        RoleDefinition(
            role="admin",
            title="Clinical Governance & IT Administrator",
            description="System-wide administration, audit trail export, ABDM FHIR interoperability, and operational metrics.",
            permissions=["*"],
        ),
    ]


# ── Patient & Caregiver OTP Authentication ──────────────────────────────────

@router.post("/patient/request-otp")
def patient_request_otp(body: PatientOTPRequest):
    """Sends rate-limited 6-digit OTP to patient's registered mobile number."""
    try:
        return request_patient_otp(body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/patient/verify-otp", response_model=PatientSession)
def patient_verify_otp(body: PatientOTPVerify):
    """Verifies OTP and issues a 30-day mobile companion session token."""
    try:
        return verify_patient_otp(body.phone, body.otp_code)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.get("/patient/me", response_model=PatientSession)
def get_current_patient_profile(patient: PatientSession = Depends(get_current_patient)):
    """Validates session token and returns current patient identity and token."""
    return patient
