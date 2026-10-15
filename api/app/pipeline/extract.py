import asyncio
from pathlib import Path
from typing import Iterator, Optional

from app import config
from app.llm.factory import get_provider
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.plan import ExtractedPlan
from app.services.event_bus import bus

PROMPTS = Path(__file__).resolve().parents[1] / "llm" / "prompts"
LISTS = ["medications", "wound_care", "activity", "diet", "follow_ups", "warning_signs", "contacts"]


def iter_fields(plan: ExtractedPlan) -> Iterator[tuple[str, object]]:
    if plan.procedure:
        yield "procedure", plan.procedure
    for name in LISTS:
        for i, item in enumerate(getattr(plan, name)):
            yield f"{name}[{i}]", item


def format_blocks(doc: SourceDocument) -> str:
    lines = [f"DOCUMENT: {doc.filename}", "BLOCKS (format: [id] (type) text):"]
    lines += [f"[{b.block_id}] ({b.type}) {b.text}" for b in doc.blocks]
    return "\n".join(lines)


async def _extract_one(label: str, model: str, prompt_file: str,
                       doc: SourceDocument, run_id: str) -> Optional[ExtractedPlan]:
    stage = Stage.EXTRACT_A if label == "a" else Stage.EXTRACT_B
    bus.emit(run_id, stage, f"extract.{label}.started", {"model": model})
    system = (PROMPTS / prompt_file).read_text(encoding="utf-8")
    try:
        plan = await get_provider(model).generate_structured(system, format_blocks(doc), ExtractedPlan)
    except Exception as e:  # one failing model must not kill the whole run
        bus.emit(run_id, stage, f"extract.{label}.failed", {"error": str(e)[:300]})
        return None
    n = 0
    for path, item in iter_fields(plan):
        n += 1
        bus.emit(run_id, stage, f"extract.{label}.field", {
            "path": path,
            "value": item.model_dump(exclude={"source_quote", "block_id"}),
            "source_quote": item.source_quote,
            "block_id": item.block_id,
        })
        await asyncio.sleep(0.04)  # small gap so the live UI can animate field by field
    bus.emit(run_id, stage, f"extract.{label}.done", {"fields": n, "missing": len(plan.missing)})
    return plan


async def extract_both(doc: SourceDocument, run_id: str):
    if not config.HAS_KEY:
                raise RuntimeError("GROQ_API_KEY is not set in E:\\recoverright\\.env")
    return await asyncio.gather(
        _extract_one("a", config.MODEL_A, "extract_a.md", doc, run_id),
        _extract_one("b", config.MODEL_B, "extract_b.md", doc, run_id),
    )