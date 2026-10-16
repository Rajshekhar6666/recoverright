import json
from pathlib import Path

from app.pipeline.parse import parse_document
from app.pipeline.reconcile import reconcile
from app.schemas.plan import ExtractedPlan

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache"
RUN = "reconcile1"


def load(name):
    p = CACHE / name
    return ExtractedPlan.model_validate_json(p.read_text(encoding="utf-8")) if p.exists() else None


doc = parse_document(ROOT / "data" / "synthetic_docs" / "sample_knee.docx", run_id=RUN)
a, b = load("sample_knee_a.json"), load("sample_knee_b.json")
if a is None or b is None:
    raise SystemExit("No cached extractions. Run: python -m scripts.try_ground  (it creates data\\cache)")

fields = reconcile(doc, a, b, run_id=RUN)

ICON = {"agreed": "OK ", "review": "REV", "conflict": "CON", "rejected": "REJ"}
for f in fields:
    shown = f.proposed or {}
    summary = " | ".join(str(v) for v in shown.values() if v)[:60]
    voters = "+".join(f.voters)
    print(f"{ICON[f.status]} {f.category:<14} {voters:<10} {summary}")
    for issue in f.issues:
        print(f"      - {issue}")

counts = {s: sum(1 for f in fields if f.status == s) for s in ICON}
print("\nsummary:", counts)
(CACHE / "reconciled.json").write_text(
    json.dumps([f.model_dump() for f in fields], indent=2, ensure_ascii=False), encoding="utf-8")
print("saved data\\cache\\reconciled.json")
