from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class Stage(str, Enum):
    UPLOAD = "upload"
    PARSE = "parse"
    EXTRACT_A = "extract_a"
    EXTRACT_B = "extract_b"
    GROUND = "ground"
    RECONCILE = "reconcile"
    REVIEW = "review"
    APPROVE = "approve"
    TASKS = "tasks"
    TRANSLATE = "translate"
    BACKCHECK = "backcheck"
    DELIVER = "deliver"
    PATIENT = "patient"
    DASHBOARD = "dashboard"


class Event(BaseModel):
    run_id: str
    seq: int
    ts: datetime
    stage: Stage
    type: str  # e.g. "ground.field.fail"
    payload: dict[str, Any] = Field(default_factory=dict)