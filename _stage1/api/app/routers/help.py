"""Help requests. The patient app POSTs one; the care-team console lists them and acts on them.

All rules live in app/services/help_store.py (unit-tested); these handlers only translate HTTP <-> that module.
NOTE: like the rest of this prototype these endpoints have no login. Add authentication before real use.
"""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.help_store import HelpError, RESOLUTIONS, help_store, valid_run_id
from app.services.storage import store

router = APIRouter(tags=["help"])


class HelpIn(BaseModel):
    token: str                                   # the patient link token (= run id), or "demo"
    patient_name: str = ""
    heard: str
    severity: Literal["critical", "concern"]
    label: str = ""
    source: Literal["voice", "button", "test"] = "voice"
    demo: bool = False
    client_time: str = ""
    client_id: Optional[str] = None              # lets the app retry safely: the same alert is never created twice


class ActionIn(BaseModel):
    action: Literal["acknowledge", "call", "escalate", "resolve", "note"]
    by: str = "Care team"
    note: Optional[str] = None
    resolution: Optional[str] = None
    target: Optional[Literal["patient", "guardian"]] = None


def _fail(e: HelpError):
    raise HTTPException(e.status, e.message)


@router.post("/help", status_code=201)
def create_help(body: HelpIn):
    meta = None
    if valid_run_id(body.token) and body.token != "demo" and store.exists(body.token):
        meta = store.read(body.token, "meta.json")
    try:
        item, created = help_store.create(
            run_id=body.token, heard=body.heard, severity=body.severity, label=body.label, source=body.source,
            demo=body.demo, client_id=body.client_id, patient_name=body.patient_name,
            patient=(meta or {}).get("patient"), client_time=body.client_time)
    except HelpError as e:
        _fail(e)
    return {"id": item["id"], "status": item["status"], "duplicate": not created, "item": item}


@router.get("/help")
def list_help(status: str = "active", include_test: bool = True, run_id: Optional[str] = None, limit: int = Query(200, ge=1, le=500)):
    """status: active (default) | all | open | acknowledged | escalated | resolved | comma list."""
    try:
        items = help_store.list(status, run_id, include_test, limit)
    except HelpError as e:
        _fail(e)
    return {"items": items, "summary": help_store.summary(include_test), "resolutions": RESOLUTIONS}


@router.get("/help/summary")
def help_summary(include_test: bool = True):
    return help_store.summary(include_test)


@router.get("/help/{help_id}")
def get_help(help_id: str):
    try:
        return help_store.get(help_id)
    except HelpError as e:
        _fail(e)


@router.post("/help/{help_id}/action")
def help_action(help_id: str, body: ActionIn):
    try:
        return help_store.act(help_id, body.action, body.by, body.note, body.resolution, body.target)
    except HelpError as e:
        _fail(e)
