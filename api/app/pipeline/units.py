"""Split a parsed document into addressable units (sentences and table cells)."""
import re

from app.pipeline.tables import detect_header
from app.schemas.document import SourceDocument
from app.schemas.units import Unit

_ABBR = re.compile(r"\b(?:dr|mr|mrs|ms|prof|vs|approx|no|e\.g|i\.e|etc)\.$", re.IGNORECASE)


def split_sentences(text: str) -> list[str]:
    # spaced scripts: split after . ! ? or the Devanagari danda when the next char is not lowercase Latin
    pieces = re.split(r"(?<=[.!?\u0964])\s+(?=[^a-z\s])", text)
    merged: list[str] = []
    for p in pieces:
        if merged and _ABBR.search(merged[-1]):
            merged[-1] += " " + p
        else:
            merged.append(p)
    out: list[str] = []
    for p in merged:  # unspaced CJK sentence ends
        out.extend(re.split(r"(?<=[\u3002\uff01\uff1f])", p))
    return [p.strip() for p in out if p.strip()]


def segment(doc: SourceDocument) -> list[Unit]:
    units: list[Unit] = []
    section = None
    headers: dict[str, dict[int, str]] = {}

    def add(**kw) -> None:
        units.append(Unit(unit_id=f"u{len(units) + 1}", section=section, **kw))

    for b in doc.blocks:
        if b.type == "heading":
            section = b.text
            add(block_id=b.block_id, kind="heading", text=b.text)
        elif b.type == "table_row" and b.cells is not None:
            hm = None
            if b.row_index == 0:
                hm = detect_header(b.cells)
                if hm:
                    headers[b.table_id] = hm
                    continue  # header row labels columns; it is not content
            hdr = headers.get(b.table_id)
            aligned = hdr is not None and len(b.cells) > max(hdr, default=-1)
            for ci, cell in enumerate(b.cells):
                if not cell.strip():
                    continue
                add(block_id=b.block_id, kind="cell", text=cell.strip(), table_id=b.table_id,
                    row_index=b.row_index, col_index=ci,
                    col_header=hdr.get(ci) if aligned else None)
        else:
            for s in split_sentences(b.text):
                add(block_id=b.block_id, kind="sentence", text=s)
    return units
