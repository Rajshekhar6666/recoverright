import asyncio
from pathlib import Path

from app.pipeline.extract import extract_both
from app.pipeline.ground import validate_plan
from app.pipeline.parse import parse_document
from app.schemas.plan import ExtractedPlan

ROOT = Path(__file__).resolve().parents[2]
RUN = "ground1"
CACHE = ROOT / "data" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)


async def load_plans(doc):
    fa, fb = CACHE / "sample_knee_a.json", CACHE / "sample_knee_b.json"
    if fa.exists() and fb.exists():
        print("(using cached extractions; delete data\\cache to re-run the models)")
        return (ExtractedPlan.model_validate_json(fa.read_text(encoding="utf-8")),
                ExtractedPlan.model_validate_json(fb.read_text(encoding="utf-8")))
    a, b = await extract_both(doc, RUN)
    if a is not None and b is not None:  # only cache a complete pair
        fa.write_text(a.model_dump_json(indent=2), encoding="utf-8")
        fb.write_text(b.model_dump_json(indent=2), encoding="utf-8")
    return a, b


async def main():
    doc = parse_document(ROOT / "data" / "synthetic_docs" / "sample_knee.docx", run_id=RUN)
    a, b = await load_plans(doc)
    for label, plan in (("a", a), ("b", b)):
        results = validate_plan(plan, doc, run_id=RUN, label=label)
        print(f"\n=== Grounding: Extractor {label.upper()} ===")
        if not results:
            print("no plan to check")
            continue
        for r in results:
            print(f"{r.path:<20} {r.verdict.upper():<5} quote={r.quote_status:<13} value={r.value_status}")
            for issue in r.issues:
                print(f"{'':<20}   - {issue}")
        print("summary:", {v: sum(1 for r in results if r.verdict == v) for v in ("pass", "warn", "fail")})


asyncio.run(main())