import asyncio
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.pipeline import orchestrator
from app.pipeline.review import ReviewError, apply_decision, blockers, build_approved_plan
from app.routers.auth import get_current_staff
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.review import ReviewField
from app.services.auth import StaffProfile
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
    # Gap 4: Optional reviewer decision latency in seconds (measured client-side).
    # If provided, it is recorded in review_timings.json and flagged if < 5 s.
    decision_seconds: Optional[float] = None


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


from app.services.directory import is_test_run


@router.get("/runs")
def list_runs(include_tests: bool = False):
    all_runs = store.list_runs()
    if not include_tests:
        clinical = [r for r in all_runs if not is_test_run(r)]
        if clinical:
            return clinical
    return all_runs


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    return _require(run_id)


@router.delete("/runs/{run_id}")
def delete_run(run_id: str):
    valid_id = store.resolve_run_id(run_id) or run_id
    if not store.exists(valid_id):
        raise HTTPException(404, f"Run '{run_id}' not found.")
    store.delete_run(valid_id)
    return {"ok": True, "message": f"Run {valid_id} deleted."}


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
        # Gap 4: record reviewer decision latency if provided
        if body.decision_seconds is not None:
            store.record_review_timing(run_id, field_id, body.by, body.action, body.decision_seconds)
    bus.emit(run_id, Stage.REVIEW, f"review.{body.action}", {"field_id": field_id, "by": body.by})
    pending = blockers(items)
    return {"field": it.model_dump(mode="json"), "blockers": pending, "can_approve": not pending}


@router.post("/runs/{run_id}/approve")
def approve(run_id: str, body: ApproveBody, staff: StaffProfile = Depends(get_current_staff)):
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
        store.audit(
            run_id,
            actor,
            "plan.approved",
            version=1,
            items=len(plan["items"]),
            note=body.note,
            staff_id=staff.id if staff else None,
            staff_role=staff.role if staff else None,
        )
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


# ── Gap 2: Admission medicine comparison ──────────────────────────────────

class AdmissionMedication(BaseModel):
    """A single medication the patient was taking before admission."""
    name: str
    dose: Optional[str] = None
    frequency: Optional[str] = None
    route: Optional[str] = None
    indication: Optional[str] = None


class AdmissionMedicationList(BaseModel):
    """Pre-admission home medication list for reconciliation against discharge plan.

    Clinical context (Gap 2): Median 53% of discharged patients have a
    medication error; 50% have an unintended discrepancy (Alqenae et al. 2020,
    54 studies, 20,895 discharges). Comparing the discharge plan against what
    the patient was actually taking before admission is the first step in
    catching these discrepancies for nurse review.

    No AI dosing: this endpoint only flags and annotates – it never modifies
    the approved plan. Dosing decisions remain with the clinician.
    """
    medications: list[AdmissionMedication]
    recorded_by: str = "nurse"


@router.post("/runs/{run_id}/admission-medications")
def set_admission_medications(run_id: str, body: AdmissionMedicationList):
    """Record the patient's pre-admission medication list.

    After saving, automatically runs a reconciliation comparison against the
    approved discharge plan (if already approved) and returns a discrepancy
    report for nurse review.  Gap 2 fix.
    """
    meta = _require(run_id)
    admission_meds = [m.model_dump() for m in body.medications]
    store.update_meta(run_id, admission_medications=admission_meds,
                      admission_meds_recorded_by=body.recorded_by,
                      admission_meds_recorded_at=datetime.now(timezone.utc).isoformat())
    store.audit(run_id, body.recorded_by, "admission_meds.recorded",
                count=len(admission_meds))

    # Run reconciliation if plan is already approved
    reconciliation = None
    if meta.get("approved"):
        plan_dict = store.get_plan_version(run_id)
        if plan_dict:
            reconciliation = _reconcile_admission_vs_discharge(admission_meds, plan_dict)
            store.update_meta(run_id, medication_reconciliation=reconciliation)
            store.audit(run_id, body.recorded_by, "medication_reconciliation.completed",
                        added=len(reconciliation["added"]),
                        stopped=len(reconciliation["stopped"]),
                        changed=len(reconciliation["changed"]),
                        unchanged=len(reconciliation["unchanged"]))

    return {
        "run_id": run_id,
        "recorded": len(admission_meds),
        "reconciliation": reconciliation,
        "clinical_note": (
            "This comparison flags potential discrepancies for nurse review only. "
            "No dosing decisions are made automatically. All changes require "
            "clinician confirmation before patient communication."
        ),
    }


@router.get("/runs/{run_id}/medication-reconciliation")
def get_medication_reconciliation(run_id: str):
    """Get the latest admission-vs-discharge medication reconciliation report. Gap 2."""
    meta = _require(run_id)
    recon = meta.get("medication_reconciliation")
    admission_meds = meta.get("admission_medications") or []
    if not recon and meta.get("approved"):
        plan_dict = store.get_plan_version(run_id)
        if plan_dict and admission_meds:
            recon = _reconcile_admission_vs_discharge(admission_meds, plan_dict)
    return {
        "run_id": run_id,
        "admission_medications": admission_meds,
        "reconciliation": recon,
        "has_admission_meds": bool(admission_meds),
    }


def _normalise_med_name(name: str) -> str:
    """Canonical drug name: lowercase, strip generic suffixes and punctuation."""
    import re
    n = re.sub(r"[^\w\s]", "", (name or "").lower().strip())
    # Strip common dosage noise from the name portion
    n = re.sub(r"\s+\d+\s*(?:mg|g|ml|mcg|iu|units?)\b", "", n)
    return n.strip()


def _reconcile_admission_vs_discharge(
    admission_meds: list[dict],
    plan_dict: dict,
) -> dict:
    """Compare admission medication list against approved discharge medications.

    Returns four lists:
      unchanged: in both lists with matching dose/frequency
      changed:   name matches but dose or frequency differs
      added:     new medication on discharge (not taken before admission)
      stopped:   taken before admission but absent from discharge plan

    Clinical safety note: 'changed' and 'stopped' entries are the highest-risk
    categories per Alqenae et al. 2020. The nurse must review each one before
    the patient goes home. This function never modifies the plan.
    """
    discharge_items = [
        i for i in (plan_dict.get("items") or [])
        if i.get("category") == "medications"
    ]
    discharge_meds = [
        {
            "name": (i.get("attrs") or {}).get("name", ""),
            "dose": (i.get("attrs") or {}).get("dose"),
            "frequency": (i.get("attrs") or {}).get("frequency"),
            "field_id": i.get("field_id"),
        }
        for i in discharge_items
    ]

    matched_admission = set()
    matched_discharge = set()
    unchanged, changed, added = [], [], []

    for di, dm in enumerate(discharge_meds):
        dn = _normalise_med_name(dm["name"])
        best_ai = None
        for ai, am in enumerate(admission_meds):
            if ai in matched_admission:
                continue
            an = _normalise_med_name(am.get("name", ""))
            if not dn or not an:
                continue
            # Substring match (e.g. "atorvastatin" matches "atorvastatin calcium")
            if dn in an or an in dn:
                best_ai = ai
                break

        if best_ai is not None:
            matched_admission.add(best_ai)
            matched_discharge.add(di)
            am = admission_meds[best_ai]
            # Check for dose/frequency changes
            dose_same = _normalise_med_name(dm.get("dose") or "") == _normalise_med_name(am.get("dose") or "")
            freq_same = _normalise_med_name(dm.get("frequency") or "") == _normalise_med_name(am.get("frequency") or "")
            if dose_same and freq_same:
                unchanged.append({
                    "name": dm["name"],
                    "discharge_dose": dm.get("dose"),
                    "admission_dose": am.get("dose"),
                    "field_id": dm["field_id"],
                })
            else:
                changed.append({
                    "name": dm["name"],
                    "discharge_dose": dm.get("dose"),
                    "admission_dose": am.get("dose"),
                    "discharge_frequency": dm.get("frequency"),
                    "admission_frequency": am.get("frequency"),
                    "field_id": dm["field_id"],
                    "flag": "dose_or_frequency_changed",
                    "review_required": True,
                })
        else:
            # New medication added at discharge
            added.append({
                "name": dm["name"],
                "dose": dm.get("dose"),
                "frequency": dm.get("frequency"),
                "field_id": dm["field_id"],
                "flag": "new_at_discharge",
                "review_required": True,
            })

    stopped = []
    for ai, am in enumerate(admission_meds):
        if ai not in matched_admission:
            stopped.append({
                "name": am.get("name"),
                "dose": am.get("dose"),
                "frequency": am.get("frequency"),
                "flag": "stopped_at_discharge",
                "review_required": True,
            })

    return {
        "unchanged": unchanged,
        "changed": changed,
        "added": added,
        "stopped": stopped,
        "summary": {
            "total_admission": len(admission_meds),
            "total_discharge": len(discharge_meds),
            "unchanged_count": len(unchanged),
            "changed_count": len(changed),
            "added_count": len(added),
            "stopped_count": len(stopped),
            "has_discrepancies": bool(changed or stopped),
        },
    }


# ── Staff Discharge Waiting-Room Coordinator ───────────────────────────────

class WaitingRoomMilestoneUpdate(BaseModel):
    milestone: str
    note: Optional[str] = None
    estimated_remaining_mins: Optional[int] = None
    updated_by: str = "discharge_coordinator"


@router.get("/runs/{run_id}/waiting-room")
def get_staff_waiting_room(run_id: str):
    """Staff coordinator view of discharge waiting room status."""
    from app.services.waiting_room import get_waiting_room_status
    _require(run_id)
    return get_waiting_room_status(run_id)


@router.post("/runs/{run_id}/waiting-room/milestone")
def set_waiting_room_milestone(run_id: str, body: WaitingRoomMilestoneUpdate):
    """Updates the discharge processing milestone and notifies the attendant."""
    from app.services.waiting_room import update_waiting_room_milestone
    _require(run_id)
    return update_waiting_room_milestone(
        run_id=run_id,
        milestone=body.milestone,
        note=body.note,
        estimated_remaining_mins=body.estimated_remaining_mins,
        updated_by=body.updated_by,
    )


# ── Feature: One-Page Clinical Audit Export ─────────────────────────────────

@router.get("/runs/{run_id}/audit-export")
def get_audit_export(run_id: str):
    """Returns a comprehensive, single-document clinical audit export.

    Details:
    1. Patient demographics and admission context
    2. AI proposed extraction vs clinician modifications
    3. Immutable reviewer attribution (who edited, who confirmed, who approved)
    4. Full sequential audit events from upload to home recovery
    """
    meta = _require(run_id)
    plan_dict = store.get_plan_version(run_id)
    timings = store.get_review_timings(run_id)

    # Read audit log lines
    audit_lines = []
    audit_path = store.dir(run_id) / "audit.jsonl"
    if audit_path.exists():
        import json
        for line in audit_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            try:
                audit_lines.append(json.loads(line))
            except Exception:
                continue

    items = plan_dict.get("items", []) if plan_dict else []
    field_actions = [
        {
            "field_id": it.get("field_id"),
            "category": it.get("category"),
            "proposed": it.get("edited_from") or it.get("attrs"),
            "final_approved": it.get("attrs"),
            "decision": it.get("decision"),
            "decided_by": it.get("decided_by"),
            "status_at_review": it.get("status_at_review"),
        }
        for it in items
    ]

    return {
        "run_id": run_id,
        "export_generated_at": datetime.now(timezone.utc).isoformat(),
        "patient": meta.get("patient", {}),
        "source_document": {
            "filename": meta.get("filename"),
            "created_at": meta.get("created_at"),
        },
        "approval_attribution": {
            "is_approved": meta.get("approved", False),
            "approved_by": (plan_dict or {}).get("approved_by"),
            "approved_at": (plan_dict or {}).get("approved_at"),
            "plan_version": meta.get("current_version", 1),
            "approval_note": (plan_dict or {}).get("approval_note"),
        },
        "clinician_modifications": field_actions,
        "reviewer_timings": timings,
        "complete_audit_trail": audit_lines,
    }


# ── Feature: 'What I Actually Take' Intake Discrepancies (Denmark Gap) ───────

@router.get("/runs/{run_id}/medication-adherence-discrepancies")
def get_intake_discrepancies(run_id: str):
    """Reconciles prescribed medicines vs reported intake, pill scans, and missed doses."""
    from app.services.adherence_discrepancy import get_actual_intake_discrepancies
    _require(run_id)
    return get_actual_intake_discrepancies(run_id)


# ── Feature: 10-Second Clinical Handover Note (SBAR) ────────────────────────

@router.get("/runs/{run_id}/handover-note")
def get_clinical_handover(run_id: str):
    """Synthesizes SBAR clinical handover note for nurse shift change and home health."""
    from app.services.handover import generate_handover_note
    _require(run_id)
    return generate_handover_note(run_id)


# ── Feature: Staff Printable View ──────────────────────────────────────────

@router.get("/runs/{run_id}/printable")
def get_staff_printable_plan(run_id: str):
    """Generates large-print discharge summary structure for physical discharge binder."""
    from app.services.printable_plan import generate_printable_plan_data
    _require(run_id)
    return generate_printable_plan_data(run_id)



# ── Gap 14: FHIR R4 / ABDM Interoperability Endpoints ───────────────────────

class FHIRImportBody(BaseModel):
    bundle: dict
    auto_approve: bool = False


@router.get("/runs/{run_id}/fhir")
def export_run_as_fhir(run_id: str):
    """Exports an approved recovery plan as an HL7 FHIR R4 Document Bundle
    (LOINC 18842-5 Discharge Summary) for ABDM / hospital EHR ingestion."""
    from app.services.fhir_bridge import export_fhir_r4_bundle
    _require(run_id)
    try:
        return export_fhir_r4_bundle(run_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc))


@router.post("/runs/import-fhir")
def import_fhir_bundle(body: FHIRImportBody):
    """Ingests an incoming hospital FHIR R4 Bundle directly into RecoverRight,
    bypassing document OCR when a structured EHR feed is available."""
    from app.services.fhir_bridge import import_fhir_r4_bundle
    try:
        return import_fhir_r4_bundle(body.bundle, auto_approve=body.auto_approve)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


# ── Gap 4: Random Confirmation Gating (Anti-Rubber-Stamping) ─────────────────

class QualityCheckPlantBody(BaseModel):
    field_id: str
    planted_error: str
    original_value: Optional[str] = None


@router.post("/runs/{run_id}/quality-check/plant")
def plant_quality_check_error(
    run_id: str,
    body: QualityCheckPlantBody,
    staff: StaffProfile = Depends(get_current_staff),
):
    """Injects a deliberate discrepancy into a specific review field for quality auditing.

    Clinical rationale: Reviewers can over-trust automation (automation bias, S9).
    Randomly planted errors measure whether clinicians catch them, providing an
    objective measure of review quality. All planted errors are logged with timestamps.
    The planted field is flagged so the audit trail shows it was a quality check.
    """
    _require(run_id)
    if not store.has(run_id, "review.json"):
        raise HTTPException(409, "run has not finished processing yet")

    review_items = store.read(run_id, "review.json")
    target = next((item for item in review_items if item.get("field_id") == body.field_id), None)
    if not target:
        raise HTTPException(404, f"field_id '{body.field_id}' not found in review")

    # Record original value before planting
    original_value = body.original_value or str(target.get("attrs", {}))

    # Plant the error
    if "attrs" not in target or target["attrs"] is None:
        target["attrs"] = {}
    target["attrs"]["_planted_error"] = body.planted_error
    target["_quality_check"] = {
        "planted": True,
        "planted_at": datetime.now(timezone.utc).isoformat(),
        "original_value": original_value,
        "planted_error": body.planted_error,
        "detected": False,
        "planted_by": staff.name if staff else "quality_check",
    }
    store.write(run_id, "review.json", review_items)
    store.audit(
        run_id,
        staff.name if staff else "quality_check",
        "planted_error",
        field_id=body.field_id,
        planted_error=body.planted_error,
        staff_role=staff.role if staff else None,
    )

    return {
        "planted": True,
        "field_id": body.field_id,
        "planted_error": body.planted_error,
        "message": "Quality check error planted. Monitor review decisions to detect if caught.",
    }


@router.get("/runs/{run_id}/quality-check/results")
def get_quality_check_results(run_id: str):
    """Returns quality audit results: which planted errors were caught vs missed by reviewers."""
    _require(run_id)
    if not store.has(run_id, "review.json"):
        raise HTTPException(409, "run has not finished processing yet")

    review_items = store.read(run_id, "review.json")
    planted = [
        {
            "field_id": item.get("field_id"),
            "planted_error": item["_quality_check"]["planted_error"],
            "planted_at": item["_quality_check"]["planted_at"],
            "detected": item["_quality_check"].get("detected", False),
            "original_value": item["_quality_check"].get("original_value"),
        }
        for item in review_items
        if item.get("_quality_check", {}).get("planted")
    ]

    total = len(planted)
    detected = sum(1 for p in planted if p["detected"])
    return {
        "run_id": run_id,
        "total_planted": total,
        "detected": detected,
        "missed": total - detected,
        "detection_rate_pct": round(detected / total * 100, 1) if total else None,
        "checks": planted,
    }



# ── Gap 14: FHIR R4 / ABDM Interoperability Endpoints ───────────────────────

class FHIRImportBody(BaseModel):
    bundle: dict
    auto_approve: bool = False


@router.get("/runs/{run_id}/fhir")
def export_run_as_fhir(run_id: str):
    """Exports an approved recovery plan as an HL7 FHIR R4 Document Bundle
    (LOINC 18842-5 Discharge Summary) for ABDM / hospital EHR ingestion.

    Gap 14: Integration and local validation are top barriers to hospital adoption.
    This endpoint enables hospitals to pull structured discharge data directly
    into their EHR systems without manual re-entry, supporting ABDM compliance.
    """
    from app.services.fhir_bridge import export_fhir_r4_bundle
    _require(run_id)
    try:
        return export_fhir_r4_bundle(run_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc))


@router.post("/runs/import-fhir")
def import_fhir_bundle(body: FHIRImportBody):
    """Ingests an incoming hospital FHIR R4 Bundle directly into RecoverRight,
    bypassing document OCR when a structured EHR feed is available.

    Gap 14: Accepts standard FHIR R4 Bundles from hospital EHR systems,
    extracts Patient, Practitioner, MedicationRequest and CarePlan resources,
    and creates a fully structured recovery plan ready for clinician review.
    """
    from app.services.fhir_bridge import import_fhir_r4_bundle
    try:
        return import_fhir_r4_bundle(body.bundle, auto_approve=body.auto_approve)
    except ValueError as exc:
        raise HTTPException(422, str(exc))



