from pathlib import Path

from app.pipeline.parse import parse_document
from app.pipeline.tables import table_medications
from app.pipeline.units import segment

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "data" / "synthetic_docs" / "sample_knee.docx"
import sys
if len(sys.argv) > 1:
    path = Path(sys.argv[1])

doc = parse_document(path, run_id="units1")
units = segment(doc)

print(f"{len(doc.blocks)} blocks -> {len(units)} units\n")
for u in units:
    extra = f"[{u.col_header}]" if u.col_header else ""
    print(f"{u.unit_id:>4} {u.block_id:>4} {u.kind:<8} {(u.section or '')[:14]:<14} {extra:<12} {u.text[:70]}")

print("\n=== Medications read from tables by header (no AI) ===")
for m in table_medications(doc):
    print(m.model_dump(exclude={'source_quote'}))
