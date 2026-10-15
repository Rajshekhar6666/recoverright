from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


class Sourced(BaseModel):
    """Every extracted item must point back to the document."""
    source_quote: str = Field(description="Exact text copied from the document")
    block_id: str = Field(description="Id of the block the quote comes from")


class Procedure(Sourced):
    value: str


class Medication(Sourced):
    name: str
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None


class Instruction(Sourced):
    instruction: str


class WoundCare(Instruction):
    pass


class Diet(Instruction):
    pass


class Activity(Instruction):
    restriction_type: Literal["avoid", "limit", "allowed", "unspecified"] = "unspecified"


class FollowUp(Sourced):
    what: str
    when: Optional[str] = None
    where: Optional[str] = None


class WarningSign(Sourced):
    text: str


class Contact(Sourced):
    label: str
    value: str


class MissingField(BaseModel):
    field: str
    reason: str


class ExtractedPlan(BaseModel):
    procedure: Optional[Procedure] = None
    medications: list[Medication] = Field(default_factory=list)
    wound_care: list[WoundCare] = Field(default_factory=list)
    activity: list[Activity] = Field(default_factory=list)
    diet: list[Diet] = Field(default_factory=list)
    follow_ups: list[FollowUp] = Field(default_factory=list)
    warning_signs: list[WarningSign] = Field(default_factory=list)
    contacts: list[Contact] = Field(default_factory=list)
    missing: list[MissingField] = Field(default_factory=list)


class GroundStatus(str, Enum):
    GROUNDED = "grounded"
    WEAK = "weak"
    FAILED = "failed"


class GroundResult(BaseModel):
    path: str  # e.g. "medications[1].dose"
    status: GroundStatus
    reason: Optional[str] = None


class FieldStatus(str, Enum):
    AGREED = "agreed"
    REVIEW = "review"
    CONFLICT = "conflict"
    REJECTED = "rejected"
    MISSING = "missing"