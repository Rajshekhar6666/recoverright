from pathlib import Path

from app.pipeline.parse import parse_document

ROOT = Path(__file__).resolve().parents[2]
doc = parse_document(ROOT / "data" / "synthetic_docs" / "sample_knee.docx", run_id="parse1")

for b in doc.blocks:
    print(f"{b.block_id:>4} {b.type:<10} {b.text[:90]}")

print("\nevents recorded:")
print((ROOT / "data" / "recordings" / "parse1.jsonl").read_text(encoding="utf-8").splitlines()[-1])