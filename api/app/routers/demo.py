"""Demonstration API router for RecoverRight.

Provides endpoints to list, load, and reset the four synthetic demonstration cases
without requiring live LLM calls or real patient data.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.pipeline.demo_cases import DEMO_CASES_METADATA, get_demo_case
from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.storage import store

router = APIRouter(prefix="/demo", tags=["demo"])


def _load_single_case(case_id: str) -> dict:
    try:
        case_meta, doc, fields = get_demo_case(case_id)
    except KeyError:
        raise HTTPException(404, f"Unknown demo case: {case_id}")

    run_id = f"run_{case_id}"
    patient_token = f"pat_{case_id}"
    run_dir = store.dir(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    # Clean up prior plan versions and tasks to ensure a pristine unapproved state
    for old_file in run_dir.glob("plan_v*.json"):
        try:
            old_file.unlink()
        except OSError:
            pass
    for old_name in ("tasks.json", "doses.json", "reminders.json", "notifications.json"):
        p = run_dir / old_name
        if p.exists():
            try:
                p.unlink()
            except OSError:
                pass

    counts = {
        "agreed": sum(1 for f in fields if f.field.status == "agreed"),
        "review": sum(1 for f in fields if f.field.status == "review"),
        "conflict": sum(1 for f in fields if f.field.status == "conflict"),
        "rejected": sum(1 for f in fields if f.field.status == "rejected"),
    }

    meta = {
        "run_id": run_id,
        "case_id": case_id,
        "patient_token": patient_token,
        "status": "needs_review",
        "filename": case_meta["filename"],
        "stored_name": case_meta["filename"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "patient": {
            "name": case_meta["patient_name"],
            "language": case_meta["language"],
            "phone": "+91 98765 43210",
            "guardian_name": "Family Contact",
            "guardian_phone": "+91 98000 00000",
            "patient_token": patient_token,
            "caregivers": [
                {
                    "name": "Family Contact",
                    "phone": "+91 98000 00000",
                    "relationship": "caregiver",
                    "consent_status": "consented",
                    "notification_preferences": ["sms"],
                    "verified": True,
                }
            ],
        },
        "counts": counts,
        "error": None,
        "approved": False,
        "current_version": 1,
        "demo": True,
        "patient_slug": None,
    }

    slug = store.generate_patient_slug(case_meta["patient_name"])
    meta["patient_slug"] = slug

    # Write document and review fields
    store.write(run_id, "meta.json", meta)
    store.write(run_id, "document.json", doc)
    store.write(run_id, "review.json", [f.model_dump(mode="json") for f in fields])
    store.register_patient_token(patient_token, run_id)
    store.register_patient_slug(slug, run_id)
    store.register_caregiver_token(f"cg_{case_id}", run_id)
    store.register_caregiver_token(f"cg_{run_id}", run_id)

    # Log initial demo audit
    store.audit(run_id, "system", "run.created", filename=meta["filename"], demo=True, case_id=case_id)
    store.audit(run_id, "system", "demo.loaded", case_id=case_id)
    bus.emit(run_id, Stage.REVIEW, "review.ready", counts)

    return {
        "run_id": run_id,
        "patient_token": patient_token,
        "case_id": case_id,
        "status": "needs_review",
        "counts": counts,
        "title": case_meta["title"],
        "patient_name": case_meta["patient_name"],
        "patient_slug": slug,
        "dashboard_url": f"/p/demo/{slug}",
    }


@router.get("/cases")
def list_demo_cases():
    """Lists the 4 available synthetic clinical demonstration cases."""
    return {"cases": DEMO_CASES_METADATA}


@router.post("/cases/{case_id}/load")
def load_demo_case(case_id: str):
    """Loads a specific synthetic demonstration case into the active runs."""
    return _load_single_case(case_id)


@router.post("/reset")
def reset_all_demos():
    """Resets all 4 demonstration cases to their fresh review-ready starting state."""
    results = []
    for c in DEMO_CASES_METADATA:
        results.append(_load_single_case(c["id"]))
    return {"status": "ok", "reset_count": len(results), "cases": results}
