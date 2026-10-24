"""Patient directory for the care-team console. One patient is one discharge run."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.pipeline.review import build_approved_plan
from app.schemas.api import (
    BatchImportFailedResult,
    BatchImportItemResult,
    BatchImportResponse,
    PatientRegisterRequest,
    PatientRegisterResponse,
)
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
    tasks = store.get_tasks(run_id) if hasattr(store, "get_tasks") else []
    doses = store.get_dose_records(run_id) if hasattr(store, "get_dose_records") else []
    reminders = store.get_reminders(run_id) if hasattr(store, "get_reminders") else []
    detail = patient_detail(meta, plan, audit, help_store.list("all", run_id=run_id), tasks=tasks, doses=doses)
    detail["reminders"] = reminders
    return detail


def _register_patient(req: PatientRegisterRequest) -> PatientRegisterResponse:
    """Core logic: create a run, build review fields from request, auto-approve if requested."""
    run_id = "run_" + uuid.uuid4().hex[:8]
    patient_token = "pat_" + uuid.uuid4().hex[:12]
    created_at = datetime.now(timezone.utc).isoformat()

    caregivers = []
    if req.guardian_name or req.guardian_phone:
        caregivers.append({
            "name": req.guardian_name or "",
            "phone": req.guardian_phone or "",
            "relationship": "guardian",
            "consent_status": "pending",
            "notification_preferences": ["sms"],
            "verified": False,
        })

    meta = {
        "run_id": run_id,
        "status": "needs_review",
        "filename": f"{req.name.replace(' ', '_')}_intake.json",
        "stored_name": f"{req.name.replace(' ', '_')}_intake.json",
        "created_at": created_at,
        "patient_token": patient_token,
        "patient": {
            "name": req.name,
            "language": req.language or "en",
            "phone": req.phone or "",
            "guardian_name": req.guardian_name or "",
            "guardian_phone": req.guardian_phone or "",
            "caregivers": caregivers,
            "patient_token": patient_token,
        },
        "counts": None,
        "error": None,
        "approved": False,
        "current_version": 1,
        "plan_versions": [],
    }

    # Build review fields from registration request
    now_iso = created_at
    review_fields = []
    field_counter = 1

    def _field(fid, category, proposed):
        return {
            "field": {
                "field_id": fid,
                "category": category,
                "status": "agreed",
                "critical": False,
                "proposed": proposed,
                "proposed_from": None,
                "issues": [],
                "block_id": None,
                "quote": None,
                "units": [],
                "voters": [],
                "opinions": [],
            },
            "decision": {"action": "confirm", "by": "system", "attrs": None, "at": now_iso, "note": None},
        }

    if req.procedure:
        review_fields.append(_field(f"f{field_counter:03d}", "procedure", {"value": req.procedure}))
        field_counter += 1

    for med in req.medications:
        review_fields.append(_field(f"f{field_counter:03d}", "medications", {
            "name": med.name,
            "dose": med.dose,
            "frequency": med.frequency,
            "duration": med.duration,
            "route": None,
        }))
        field_counter += 1

    for text_val, category in [
        (req.wound_care, "wound_care"),
        (req.activity, "activity"),
        (req.diet, "diet"),
        (req.warning_signs, "warning_signs"),
        (req.follow_up, "follow_ups"),
    ]:
        if text_val:
            attr_key = "text" if category == "warning_signs" else ("what" if category == "follow_ups" else "instruction")
            review_fields.append(_field(f"f{field_counter:03d}", category, {attr_key: text_val}))
            field_counter += 1

    store.write(run_id, "meta.json", meta)
    store.write(run_id, "review.json", review_fields)
    store.register_patient_token(patient_token, run_id)

    slug = store.generate_patient_slug(req.name)
    store.register_patient_slug(slug, run_id)
    store.update_meta(run_id, patient_slug=slug)

    if req.auto_approve:
        from app.schemas.review import ReviewField
        items = [ReviewField.model_validate(f) for f in review_fields]
        plan = build_approved_plan(run_id, meta, items, "system", version=1, note="Auto-approved on registration")
        store.save_plan_version(run_id, plan, version=1)
        store.audit(run_id, "system", "plan.approved", version=1, items=len(plan["items"]), note="Auto-approved on registration")

    store.audit(run_id, "system", "run.created", filename=meta["filename"], patient_token=patient_token)

    return PatientRegisterResponse(
        run_id=run_id,
        patient_name=req.name,
        phone=req.phone or "",
        language=req.language or "en",
        slug=slug,
        patient_token=patient_token,
        dashboard_url=f"/p/demo/{slug}",
        status="saved",
        approved=req.auto_approve,
        created_at=created_at,
    )


@router.post("/patients/register", response_model=PatientRegisterResponse)
def register_patient(req: PatientRegisterRequest):
    """Directly register a patient with pre-built discharge information."""
    if not req.name or not req.name.strip():
        raise HTTPException(422, "Patient name is required")
    return _register_patient(req)


@router.post("/patients/batch-import", response_model=BatchImportResponse)
def batch_import_patients(records: list[PatientRegisterRequest]):
    """Batch import multiple patients. Duplicates (same name + phone) are rejected."""
    imported: list[BatchImportItemResult] = []
    failed: list[BatchImportFailedResult] = []

    # Build a set of existing (name, phone) pairs to detect duplicates
    existing_runs = store.list_runs()
    existing_pairs: set[tuple[str, str]] = set()
    for run in existing_runs:
        patient = run.get("patient") or {}
        name = (patient.get("name") or "").strip().lower()
        phone = (patient.get("phone") or "").strip()
        if name:
            existing_pairs.add((name, phone))

    # Track pairs added in this batch to detect intra-batch duplicates
    batch_pairs: set[tuple[str, str]] = set()

    for idx, req in enumerate(records):
        patient_name = (req.name or "").strip()
        if not patient_name:
            failed.append(BatchImportFailedResult(index=idx, patient_name="", reason="missing_name"))
            continue

        name_key = patient_name.lower()
        phone_key = (req.phone or "").strip()
        pair = (name_key, phone_key)

        if pair in existing_pairs or pair in batch_pairs:
            failed.append(BatchImportFailedResult(index=idx, patient_name=patient_name, reason="duplicate"))
            continue

        try:
            result = _register_patient(req)
            batch_pairs.add(pair)
            imported.append(BatchImportItemResult(
                run_id=result.run_id,
                patient_name=result.patient_name,
                phone=result.phone,
                slug=result.slug,
                patient_token=result.patient_token,
                dashboard_url=result.dashboard_url,
                status=result.status,
            ))
        except Exception as exc:
            failed.append(BatchImportFailedResult(index=idx, patient_name=patient_name, reason=str(exc)))

    return BatchImportResponse(
        total=len(records),
        imported_count=len(imported),
        failed_count=len(failed),
        imported=imported,
        failed=failed,
    )

