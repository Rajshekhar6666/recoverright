"""Help requests. The patient app POSTs one; the care-team console lists them and acts on them.

All rules live in app/services/help_store.py (unit-tested); these handlers only translate HTTP <-> that module.
NOTE: like the rest of this prototype these endpoints have no login. Add authentication before real use.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.help_store import HelpError, RESOLUTIONS, help_store, valid_run_id
from app.services.reminder import channel_registry
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
    target: Optional[Literal["patient", "guardian", "caregiver"]] = None


def _fail(e: HelpError):
    raise HTTPException(e.status, e.message)


@router.post("/help", status_code=201)
def create_help(body: HelpIn):
    token = body.token
    resolve_fn = getattr(store, "resolve_run_id", None)
    resolved_run_id = resolve_fn(token) if resolve_fn and token != "demo" else (token if token == "demo" else None)
    run_id = resolved_run_id or token
    meta = None
    if run_id != "demo" and store.exists(run_id):
        meta = store.read(run_id, "meta.json")

    patient_data = (meta or {}).get("patient")
    patient_name = body.patient_name or ((patient_data or {}).get("name") if patient_data else "") or ""

    try:
        item, created = help_store.create(
            run_id=run_id, heard=body.heard, severity=body.severity, label=body.label, source=body.source,
            demo=body.demo, client_id=body.client_id, patient_name=patient_name,
            patient=patient_data, client_time=body.client_time)
    except HelpError as e:
        _fail(e)

    if run_id != "demo" and store.exists(run_id):
        bus.emit(run_id, Stage.HELP, f"help.{body.severity}", {
            "help_id": item["id"],
            "severity": body.severity,
            "heard": body.heard,
            "source": body.source,
            "label": body.label,
        })
        if created and hasattr(store, "audit"):
            store.audit(run_id, actor="patient", action="help_requested",
                        severity=body.severity, heard=body.heard, help_id=item["id"], source=body.source)

        # Proactively notify consented caregivers on critical emergency
        if created and body.severity == "critical":
            caregivers = (patient_data or {}).get("caregivers") or []
            for cg in caregivers:
                if cg.get("consent_status") == "consented":
                    phone = cg.get("phone")
                    if phone:
                        channel_name = (cg.get("notification_preferences") or ["sms"])[0]
                        channel = channel_registry.get(channel_name) or channel_registry.get("sms")
                        msg = f"EMERGENCY ALERT: {patient_name} reported distress ({body.label or 'help requested'}). Hospital care team alerted."
                        delivery = channel.deliver(phone, msg)
                        notif = {
                            "notification_id": f"notif_{uuid.uuid4().hex[:8]}",
                            "run_id": run_id,
                            "recipient_name": cg.get("name", "Caregiver"),
                            "recipient_phone": phone,
                            "channel": channel_name,
                            "notification_type": "emergency",
                            "message": msg,
                            "sent_at": datetime.now(timezone.utc).isoformat(),
                            "status": "delivered" if delivery.status in ("delivered", "sent") else "failed",
                            "details": {"error": delivery.error} if delivery.error else None,
                        }
                        if hasattr(store, "save_notification"):
                            store.save_notification(run_id, notif)
                        bus.emit(run_id, Stage.CAREGIVER, "caregiver.emergency_alert", {
                            "caregiver_name": cg.get("name"),
                            "phone": phone,
                            "notification_id": notif["notification_id"],
                        })

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
        res = help_store.act(help_id, body.action, body.by, body.note, body.resolution, body.target)
    except HelpError as e:
        _fail(e)

    item_run_id = res.get("run_id")
    if item_run_id and item_run_id != "demo" and store.exists(item_run_id):
        bus.emit(item_run_id, Stage.HELP, f"help.action.{body.action}", {
            "help_id": help_id,
            "action": body.action,
            "by": body.by,
            "target": body.target,
            "resolution": body.resolution,
        })
        if hasattr(store, "audit"):
            store.audit(item_run_id, actor=body.by, action=f"help_{body.action}",
                        help_id=help_id, note=body.note, resolution=body.resolution, target=body.target)

    return res
