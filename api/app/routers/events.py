import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.schemas.events import Stage
from app.services.event_bus import RECORDINGS, bus

router = APIRouter(tags=["events"])


def _recording(run_id: str):
    return RECORDINGS / f"{run_id}.jsonl"


def _read_log(run_id: str) -> list[dict]:
    live = bus._history.get(run_id)
    if live:
        return [json.loads(e.model_dump_json()) for e in live]
    p = _recording(run_id)
    if not p.exists():
        raise HTTPException(404, "no events recorded for this run")
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


@router.get("/runs/{run_id}/events/log")
def event_log(run_id: str):
    """All events so far as JSON. The theater's replay mode and tests use this."""
    return _read_log(run_id)


@router.get("/runs/{run_id}/events")
async def stream_events(run_id: str, after: int = 0, replay: bool = False, speed: float = 1.0):
    """Server-Sent Events. Live by default; replay=true re-plays the recording with its original timing."""
    has_live = bool(bus._history.get(run_id))
    if replay or (not has_live and _recording(run_id).exists()):
        events = _read_log(run_id)

        async def replay_gen():
            prev = None
            for ev in events:
                if ev["seq"] <= after:
                    continue
                ts = datetime.fromisoformat(ev["ts"].replace("Z", "+00:00"))
                if prev is not None:
                    await asyncio.sleep(min((ts - prev).total_seconds() / max(speed, 0.1), 1.5))
                prev = ts
                yield {"id": str(ev["seq"]), "data": json.dumps(ev)}

        return EventSourceResponse(replay_gen())

    async def live_gen():
        async for ev in bus.stream(run_id, after):
            yield {"id": str(ev.seq), "data": ev.model_dump_json()}

    return EventSourceResponse(live_gen())


async def _demo(run_id: str):
    steps = [
        (Stage.UPLOAD, "run.uploaded", {"filename": "knee_replacement.docx"}),
        (Stage.PARSE, "parse.done", {"blocks": 42}),
        (Stage.EXTRACT_A, "extract.a.done", {"fields": 14}),
        (Stage.EXTRACT_B, "extract.b.done", {"fields": 13}),
        (Stage.GROUND, "ground.field.fail", {"field": "medications[1].dose", "reason": "number not in quote"}),
        (Stage.RECONCILE, "reconcile.done", {"agreed": 11, "review": 2, "conflict": 1}),
    ]
    for stage, type_, payload in steps:
        bus.emit(run_id, stage, type_, payload)
        await asyncio.sleep(1)


@router.post("/demo/emit/{run_id}")
async def demo_emit(run_id: str):
    asyncio.create_task(_demo(run_id))
    return {"ok": True}
