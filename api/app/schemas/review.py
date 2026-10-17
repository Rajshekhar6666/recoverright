from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.reconcile import ReconciledField


class FieldDecision(BaseModel):
    action: Literal["confirm", "edit", "reject"]
    attrs: Optional[dict[str, Optional[str]]] = None
    by: str = "staff"
    at: datetime
    note: Optional[str] = None


class ReviewField(BaseModel):
    field: ReconciledField
    decision: Optional[FieldDecision] = None
