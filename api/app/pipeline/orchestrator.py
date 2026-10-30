"""Run the whole pipeline for one uploaded document, emitting events at every stage."""
import asyncio
import hashlib
import os
from typing import Optional

from app.pipeline.extract import extract_both, iter_fields
from app.pipeline.ground import validate_plan
from app.pipeline.parse import parse_document
from app.pipeline.reconcile import reconcile
from app.schemas.events import Stage
from app.schemas.plan import ExtractedPlan
from app.schemas.review import ReviewField
from app.services.event_bus import bus
from app.services.storage import store

try:
    from app import config
    MODEL_A, MODEL_B = str(config.MODEL_A), str(config.MODEL_B)
except Exception:  # sandbox / tests
    MODEL_A, MODEL_B = "A", "B"

from pathlib import Path  # noqa: E402

def _cache_dir() -> Path:
    rr = os.getenv("RR_RUNS_DIR")
    if rr:
        return Path(rr).parent / "cache"
    candidate = Path(__file__).resolve().parents[3]
    if candidate.exists() and candidate != Path("/"):
        return candidate / "data" / "cache"
    return Path("/app/data/cache")

CACHE = Path(os.getenv("RR_CACHE_DIR", str(_cache_dir())))


def _cache_key(path) -> str:
    h = hashlib.sha256(path.read_bytes())
    h.update(f"{MODEL_A}|{MODEL_B}".encode())
    return h.hexdigest()[:16]


async def _replay_cached(label: str, model: str, plan: Optional[ExtractedPlan], run_id: str) -> None:
    """Re-emit extraction events from a cached result so the live theater still animates."""
    stage = Stage.EXTRACT_A if label == "a" else Stage.EXTRACT_B
    bus.emit(run_id, stage, f"extract.{label}.started", {"model": model, "cached": True})
    if plan is None:
        bus.emit(run_id, stage, f"extract.{label}.failed", {"error": "no cached result"})
        return
    n = 0
    for path, item in iter_fields(plan):
        n += 1
        bus.emit(run_id, stage, f"extract.{label}.field", {
            "path": path, "value": item.model_dump(exclude={"source_quote", "block_id"}),
            "source_quote": item.source_quote, "block_id": item.block_id})
        await asyncio.sleep(0.04)
    bus.emit(run_id, stage, f"extract.{label}.done", {"fields": n, "missing": len(plan.missing), "cached": True})


async def _get_plans(doc, src, run_id: str, use_cache: bool, patient: Optional[dict] = None):
    key = _cache_key(src)
    fa, fb = CACHE / f"{key}_a.json", CACHE / f"{key}_b.json"
    if use_cache and fa.exists() and fb.exists():
        a = ExtractedPlan.model_validate_json(fa.read_text(encoding="utf-8"))
        b = ExtractedPlan.model_validate_json(fb.read_text(encoding="utf-8"))
        await asyncio.gather(_replay_cached("a", MODEL_A, a, run_id), _replay_cached("b", MODEL_B, b, run_id))
        return a, b, True
    a, b = await extract_both(doc, run_id, known_patient=patient)
    if use_cache and a is not None and b is not None:  # only cache a complete pair
        CACHE.mkdir(parents=True, exist_ok=True)
        fa.write_text(a.model_dump_json(indent=2), encoding="utf-8")
        fb.write_text(b.model_dump_json(indent=2), encoding="utf-8")
    return a, b, False


async def run_pipeline(run_id: str, use_cache: bool = True) -> None:
    meta = store.read(run_id, "meta.json")
    src = store.dir(run_id) / meta["stored_name"]
    try:
        store.update_meta(run_id, status="processing")
        bus.emit(run_id, Stage.UPLOAD, "run.uploaded", {
            "filename": meta["filename"], "size": src.stat().st_size,
            "language": meta.get("patient", {}).get("language")})
        doc = parse_document(src, run_id=run_id)
        store.write(run_id, "document.json", doc)

        plan_a, plan_b, cached = await _get_plans(doc, src, run_id, use_cache, patient=meta.get("patient"))
        store.write(run_id, "plan_a.json", plan_a if plan_a else {})
        store.write(run_id, "plan_b.json", plan_b if plan_b else {})

        validate_plan(plan_a, doc, run_id=run_id, label="a")
        validate_plan(plan_b, doc, run_id=run_id, label="b")
        fields = reconcile(doc, plan_a, plan_b, run_id=run_id)

        store.write(run_id, "review.json", [ReviewField(field=f) for f in fields])
        counts = {s: sum(1 for f in fields if f.status == s) for s in ("agreed", "review", "conflict", "rejected")}
        store.update_meta(run_id, status="needs_review", counts=counts, cached=cached)
        bus.emit(run_id, Stage.REVIEW, "review.ready", counts)
    except Exception as e:  # never leave a run stuck in "processing"
        store.update_meta(run_id, status="failed", error=str(e)[:300])
        bus.emit(run_id, Stage.UPLOAD, "run.failed", {"error": str(e)[:300]})
