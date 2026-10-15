import asyncio
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.schemas.events import Stage
from app.services.event_bus import bus

router = APIRouter(tags=["events"])


@router.get("/runs/{run_id}/events")
async def stream_events(run_id: str, after: int = 0):
    async def gen():
        async for ev in bus.stream(run_id, after):
            yield {"id": str(ev.seq), "data": ev.model_dump_json()}

    return EventSourceResponse(gen())


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