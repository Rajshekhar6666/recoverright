"""Data models and schemas for the Real-Time Calling System."""
from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

CallRole = Literal["staff", "patient"]
CallStatus = Literal[
    "calling",
    "ringing",
    "connecting",
    "connected",
    "reconnecting",
    "ended",
    "rejected",
    "busy",
    "no_answer",
    "failed",
]


class CallSession(BaseModel):
    call_id: str
    run_id: str
    caller_id: str
    caller_role: CallRole
    caller_name: str
    target_id: str
    target_role: CallRole
    status: CallStatus = "calling"
    created_at: str
    connected_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: int = 0
    end_reason: Optional[str] = None


class CallHistoryItem(BaseModel):
    call_id: str
    run_id: str
    caller_role: CallRole
    caller_name: str
    target_role: CallRole
    status: CallStatus
    created_at: str
    connected_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: int = 0
    end_reason: Optional[str] = None


class IceServer(BaseModel):
    urls: list[str]
    username: Optional[str] = None
    credential: Optional[str] = None


class IceConfigResponse(BaseModel):
    ice_servers: list[IceServer]


class CallActionRequest(BaseModel):
    call_id: str
    action: Literal["accept", "reject", "end", "cancel"]
    reason: Optional[str] = None
    duration_seconds: Optional[int] = 0
