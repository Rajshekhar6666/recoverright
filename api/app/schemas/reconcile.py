from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["agreed", "review", "conflict", "rejected"]


class Opinion(BaseModel):
    """One voter's reading of one place in the document."""
    voter: Literal["A", "B", "rules"]
    path: str
    attrs: dict[str, Optional[str]]
    block_id: str
    quote: str
    units: list[str] = Field(default_factory=list)
    trusted: bool = True
    ground_issues: list[str] = Field(default_factory=list)


class ReconciledField(BaseModel):
    field_id: str
    category: str
    status: Status
    critical: bool
    proposed: Optional[dict[str, Optional[str]]] = None
    proposed_from: Optional[str] = None
    block_id: Optional[str] = None
    quote: Optional[str] = None
    units: list[str] = Field(default_factory=list)
    voters: list[str] = Field(default_factory=list)
    opinions: list[Opinion] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
