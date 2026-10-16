"""Deterministic table understanding: find header rows and read medication tables by column."""
import re
import string
import unicodedata
from typing import Optional

from app.schemas.document import SourceDocument
from app.schemas.plan import Medication

# canonical column -> accepted header texts (lowercase, no punctuation). Extend freely.
CANON: dict[str, set[str]] = {
    "name": {"medication", "medications", "medicine", "drug", "name", "medication name", "drug name",
             "médicament", "medicamento", "nombre", "दवा", "药物", "药品"},
    "dose": {"dose", "dosage", "strength", "dosis", "खुराक", "剂量"},
    "frequency": {"frequency", "how often", "schedule", "fréquence", "frequence", "frecuencia",
                  "कितनी बार", "频率"},
    "duration": {"duration", "for how long", "length", "durée", "duree", "duración", "duracion",
                 "अवधि", "疗程", "持续时间"},
    "route": {"route", "how to take", "via", "voie", "vía", "मार्ग", "给药途径"},
}
MED_COLS = {"dose", "frequency", "duration", "route"}
_PUNCT = str.maketrans("", "", string.punctuation)


def _norm_header(text: str) -> str:
    s = unicodedata.normalize("NFKC", text or "").lower().translate(_PUNCT)
    return re.sub(r"\s+", " ", s).strip()


def detect_header(cells: list[str]) -> Optional[dict[int, str]]:
    """Return {column_index: canonical_name} if this row looks like a header row."""
    mapping: dict[int, str] = {}
    for i, cell in enumerate(cells):
        h = _norm_header(cell)
        for canon, synonyms in CANON.items():
            if h in synonyms:
                mapping[i] = canon
                break
    return mapping if len(mapping) >= 2 else None


def table_headers(doc: SourceDocument) -> dict[str, tuple[dict[int, str], int]]:
    """{table_id: ({column_index: canonical_name}, column_count)} for tables that have a header row."""
    out: dict[str, tuple[dict[int, str], int]] = {}
    for b in doc.blocks:
        if b.type == "table_row" and b.cells and b.row_index == 0:
            hm = detect_header(b.cells)
            if hm:
                out[b.table_id] = (hm, len(b.cells))
    return out


def table_medications(doc: SourceDocument) -> list[Medication]:
    """Read medication tables by header, with no AI. Misaligned rows are skipped, never guessed."""
    headers: dict[str, tuple[dict[int, str], int]] = {}
    meds: list[Medication] = []
    for b in doc.blocks:
        if b.type != "table_row" or not b.cells:
            continue
        if b.row_index == 0:
            hm = detect_header(b.cells)
            if hm and "name" in hm.values() and MED_COLS & set(hm.values()):
                headers[b.table_id] = (hm, len(b.cells))
            continue
        found = headers.get(b.table_id)
        if not found:
            continue
        hm, ncols = found
        if len(b.cells) != ncols:
            continue  # merged or ragged row: leave it to the other voters and to staff
        row = {canon: (b.cells[i].strip() or None) for i, canon in hm.items()}
        if not row.get("name"):
            continue
        meds.append(Medication(
            name=row["name"], dose=row.get("dose"), route=row.get("route"),
            frequency=row.get("frequency"), duration=row.get("duration"),
            source_quote=b.text, block_id=b.block_id,
        ))
    return meds
