import asyncio
from pathlib import Path

from app.pipeline.extract import extract_both, iter_fields
from app.pipeline.parse import parse_document

ROOT = Path(__file__).resolve().parents[2]
RUN = "extract1"


async def main():
    doc = parse_document(ROOT / "data" / "synthetic_docs" / "sample_knee.docx", run_id=RUN)
    a, b = await extract_both(doc, RUN)
    for label, plan in (("A", a), ("B", b)):
        print(f"\n=== Extractor {label} ===")
        if plan is None:
            print("FAILED (see data\\recordings\\extract1.jsonl for the error)")
            continue
        for path, item in iter_fields(plan):
            print(f"{path:<22} {item.model_dump(exclude={'source_quote', 'block_id'})}")
        print("missing:", [m.model_dump() for m in plan.missing])


asyncio.run(main())