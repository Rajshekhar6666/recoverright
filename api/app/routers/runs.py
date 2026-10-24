import asyncio
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.pipeline import orchestrator
from app.pipeline.review import ReviewError, apply_decision, blockers, build_approved_plan
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.review import ReviewField
from app.services.event_bus import bus
from app.services.storage import store

router = APIRouter(tags=["runs"])
ALLOWED = {".docx", ".pdf"}
MAX_BYTES = 15 * 1024 * 1024


class FieldAction(BaseModel):
    action: str
    attrs: Optional[dict[str, Optional[str]]] = None
    by: str = "staff"
    note: Optional[str] = None


class ApproveBody(BaseModel):
    by: str = "staff"
    role: str = "Registered Nurse"
    note: Optional[str] = None


def _require(run_id: str) -> dict:
    if not store.exists(run_id):
        raise HTTPException(404, "run not found")
    return store.read(run_id, "meta.json")


def _items(run_id: str) -> list[ReviewField]:
    if not store.has(run_id, "review.json"):
        raise HTTPException(409, "the run has not finished processing yet")
    return [ReviewField.model_validate(x) for x in store.read(run_id, "review.json")]


@router.post("/runs")
async def create_run(
    file: UploadFile = File(...),
    patient_name: str = Form("Demo Patient"),
    language: str = Form("en"),
    phone: str = Form(""),
    guardian_name: str = Form(""),
    guardian_phone: str = Form(""),
    use_cache: bool = Form(True),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(415, "upload a .docx or .pdf file")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file is larger than 15 MB")
    if not data:
        raise HTTPException(400, "the file is empty")
    run_id = "run_" + uuid.uuid4().hex[:8]
    patient_token = "pat_" + uuid.uuid4().hex[:12]
    stored = "source" + ext
    store.dir(run_id).mkdir(parents=True, exist_ok=True)
    (store.dir(run_id) / stored).write_bytes(data)
    caregivers = []
    if guardian_name or guardian_phone:
        caregivers.append({
            "name": guardian_name,
            "phone": guardian_phone,
            "relationship": "guardian",
            "consent_status": "pending",
            "notification_preferences": ["sms"],
            "verified": False,
        })
    meta = {
        "run_id": run_id, "status": "queued", "filename": re.sub(r"[^\w.\- ]", "_", file.filename or "document" + ext),
        "stored_name": stored, "created_at": datetime.now(timezone.utc).isoformat(),
        "patient_token": patient_token,
        "patient": {"name": patient_name, "language": language, "phone": phone,
                    "guardian_name": guardian_name, "guardian_phone": guardian_phone,
                    "caregivers": caregivers, "patient_token": patient_token},
        "counts": None, "error": None, "approved": False,
        "current_version": 1, "plan_versions": [],
    }
    store.write(run_id, "meta.json", meta)
    store.register_patient_token(patient_token, run_id)
    slug = store.generate_patient_slug(patient_name)
    store.register_patient_slug(slug, run_id)
    store.update_meta(run_id, patient_slug=slug)
    store.audit(run_id, "system", "run.created", filename=meta["filename"], patient_token=patient_token)
    asyncio.create_task(orchestrator.run_pipeline(run_id, use_cache))
    return {"run_id": run_id, "status": "queued", "patient_token": patient_token, "patient_slug": slug, "dashboard_url": f"/p/demo/{slug}"}


@router.get("/runs")
def list_runs():
    return store.list_runs()


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    return _require(run_id)


@router.get("/runs/{run_id}/source")
def get_source(run_id: str):
    meta = _require(run_id)
    return FileResponse(store.dir(run_id) / meta["stored_name"], filename=meta["filename"])


@router.get("/runs/{run_id}/review")
def get_review(run_id: str):
    meta = _require(run_id)
    items = _items(run_id)
    doc = SourceDocument.model_validate(store.read(run_id, "document.json"))
    pending = blockers(items)
    return {"run": meta, "blocks": [b.model_dump() for b in doc.blocks],
            "fields": [i.model_dump(mode="json") for i in items],
            "blockers": pending, "can_approve": not pending and not meta["approved"]}


@router.patch("/runs/{run_id}/fields/{field_id}")
def decide_field(run_id: str, field_id: str, body: FieldAction):
    meta = _require(run_id)
    if meta["approved"]:
        raise HTTPException(409, "the plan is approved and locked")
    with store.lock(run_id):
        items = _items(run_id)
        try:
            it = apply_decision(items, field_id, body.action, body.attrs, body.by, body.note)
        except KeyError:
            raise HTTPException(404, "field not found")
        except ReviewError as e:
            raise HTTPException(422, str(e))
        store.write(run_id, "review.json", items)
        store.audit(run_id, body.by, f"field.{body.action}", field_id=field_id, attrs=body.attrs, note=body.note)
    bus.emit(run_id, Stage.REVIEW, f"review.{body.action}", {"field_id": field_id, "by": body.by})
    pending = blockers(items)
    return {"field": it.model_dump(mode="json"), "blockers": pending, "can_approve": not pending}


@router.post("/runs/{run_id}/approve")
def approve(run_id: str, body: ApproveBody):
    meta = _require(run_id)
    if meta["approved"]:
        raise HTTPException(409, "already approved")
    if not body.by.strip():
        raise HTTPException(422, "staff identity is required")
    with store.lock(run_id):
        items = _items(run_id)
        pending = blockers(items)
        if pending:
            raise HTTPException(409, {"message": f"{len(pending)} field(s) still need a decision", "blockers": pending})
        actor = f"{body.by} ({body.role})" if body.role and body.role != body.by else body.by
        plan = build_approved_plan(run_id, meta, items, body.by, version=1, note=body.note)
        store.save_plan_version(run_id, plan, version=1)
        store.audit(run_id, actor, "plan.approved", version=1, items=len(plan["items"]), note=body.note)
        if not meta.get("patient_slug"):
            patient_name = meta.get("patient", {}).get("name", "patient")
            slug = store.generate_patient_slug(patient_name)
            store.register_patient_slug(slug, run_id)
            store.update_meta(run_id, patient_slug=slug)
        try:
            from app.pipeline.tasks import generate_tasks_for_plan
            from app.schemas.api import ApprovedPlan
            from app.services.reminder import schedule_reminders_for_plan
            approved_obj = ApprovedPlan.model_validate(plan)
            tasks = generate_tasks_for_plan(approved_obj)
            store.save_tasks(run_id, [t.model_dump(mode="json") for t in tasks])
            schedule_reminders_for_plan(approved_obj)
        except Exception:
            pass
    bus.emit(run_id, Stage.APPROVE, "plan.approved", {"version": 1, "approver": actor, "items": len(plan["items"])})
    return plan


@router.post("/runs/{run_id}/reapprove")
def reapprove(run_id: str, body: ApproveBody):
    meta = _require(run_id)
    if not body.by.strip():
        raise HTTPException(422, "staff identity is required")
    with store.lock(run_id):
        items = _items(run_id)
        pending = blockers(items)
        if pending:
            raise HTTPException(409, {"message": f"{len(pending)} field(s) still need a decision", "blockers": pending})
        current_v = meta.get("current_version", 1)
        new_v = current_v + 1
        actor = f"{body.by} ({body.role})" if body.role and body.role != body.by else body.by
        plan = build_approved_plan(run_id, meta, items, body.by, version=new_v, note=body.note)
        store.save_plan_version(run_id, plan, version=new_v)
        store.audit(run_id, actor, "plan.reapproved", version=new_v, items=len(plan["items"]), note=body.note)
        try:
            from app.pipeline.tasks import generate_tasks_for_plan
            from app.schemas.api import ApprovedPlan
            from app.services.reminder import cancel_stale_reminders, schedule_reminders_for_plan
            approved_obj = ApprovedPlan.model_validate(plan)
            tasks = generate_tasks_for_plan(approved_obj)
            store.save_tasks(run_id, [t.model_dump(mode="json") for t in tasks])
            cancel_stale_reminders(run_id, new_v)
            schedule_reminders_for_plan(approved_obj)
        except Exception:
            pass
    bus.emit(run_id, Stage.APPROVE, "plan.reapproved", {"version": new_v, "approver": actor, "items": len(plan["items"])})
    return plan


@router.post("/runs/{run_id}/unlock")
def unlock_run(run_id: str, body: Optional[ApproveBody] = None):
    meta = _require(run_id)
    if not meta.get("approved"):
        raise HTTPException(400, "the plan is not approved yet")
    with store.lock(run_id):
        store.update_meta(run_id, status="needs_review", approved=False)
        actor = f"{body.by} ({body.role})" if body and body.by else "staff"
        store.audit(run_id, actor, "plan.unlocked_for_revision")
    bus.emit(run_id, Stage.REVIEW, "plan.unlocked", {"by": actor})
    return {"run_id": run_id, "status": "needs_review", "approved": False}


@router.post("/runs/{run_id}/retry")
async def retry_run(run_id: str):
    meta = _require(run_id)
    if meta.get("approved"):
        raise HTTPException(409, "cannot retry an approved plan")
    with store.lock(run_id):
        store.update_meta(run_id, status="queued", error=None)
        store.audit(run_id, "staff", "run.retried")
    bus.emit(run_id, Stage.UPLOAD, "run.retried", {})
    asyncio.create_task(orchestrator.run_pipeline(run_id, use_cache=False))
    return {"run_id": run_id, "status": "queued"}


@router.get("/runs/{run_id}/plan")
def get_plan(run_id: str, version: Optional[int] = None):
    _require(run_id)
    plan = store.get_plan_version(run_id, version)
    if not plan:
        raise HTTPException(404, "the plan is not approved yet")
    return plan
