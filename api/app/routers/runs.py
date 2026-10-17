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
    stored = "source" + ext
    store.dir(run_id).mkdir(parents=True, exist_ok=True)
    (store.dir(run_id) / stored).write_bytes(data)
    meta = {
        "run_id": run_id, "status": "queued", "filename": re.sub(r"[^\w.\- ]", "_", file.filename or "document" + ext),
        "stored_name": stored, "created_at": datetime.now(timezone.utc).isoformat(),
        "patient": {"name": patient_name, "language": language, "phone": phone,
                    "guardian_name": guardian_name, "guardian_phone": guardian_phone},
        "counts": None, "error": None, "approved": False,
    }
    store.write(run_id, "meta.json", meta)
    store.audit(run_id, "system", "run.created", filename=meta["filename"])
    asyncio.create_task(orchestrator.run_pipeline(run_id, use_cache))
    return {"run_id": run_id, "status": "queued"}


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
    with store.lock(run_id):
        items = _items(run_id)
        pending = blockers(items)
        if pending:
            raise HTTPException(409, {"message": f"{len(pending)} field(s) still need a decision", "blockers": pending})
        plan = build_approved_plan(run_id, meta, items, body.by)
        store.write(run_id, "plan_v1.json", plan)
        store.update_meta(run_id, status="approved", approved=True, approved_by=body.by)
        store.audit(run_id, body.by, "plan.approved", version=1, items=len(plan["items"]))
    bus.emit(run_id, Stage.APPROVE, "plan.approved", {"version": 1, "approver": body.by, "items": len(plan["items"])})
    return plan


@router.get("/runs/{run_id}/plan")
def get_plan(run_id: str):
    _require(run_id)
    if not store.has(run_id, "plan_v1.json"):
        raise HTTPException(404, "the plan is not approved yet")
    return store.read(run_id, "plan_v1.json")
