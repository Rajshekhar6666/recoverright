"""Patient directory for the care-team console. One patient is one discharge run."""
from fastapi import APIRouter, HTTPException

from app.services.directory import patient_detail, patients_index, read_audit
from app.services.help_store import help_store, valid_run_id
from app.services.storage import store

router = APIRouter(tags=["patients"])


@router.get("/patients")
def list_patients():
    return {"items": patients_index(store.list_runs(), help_store.counts_by_run())}


@router.get("/patients/{run_id}")
def get_patient(run_id: str):
    if not valid_run_id(run_id) or not store.exists(run_id):
        raise HTTPException(404, "patient not found")
    meta = store.read(run_id, "meta.json")
    plan = store.read(run_id, "plan_v1.json") if store.has(run_id, "plan_v1.json") else None
    audit = read_audit(store.dir(run_id) / "audit.jsonl")
    return patient_detail(meta, plan, audit, help_store.list("all", run_id=run_id))
