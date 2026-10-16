import difflib
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from app.pipeline.extract import iter_fields
from app.pipeline.tables import table_headers
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.plan import ExtractedPlan
from app.services.event_bus import bus

STAGE = getattr(Stage, "GROUND", Stage.PARSE)

# Fields the model derives (classifies) rather than copies; not checked against the quote.
DERIVED_KEYS = {"restriction_type"}
# Longer free text may differ from the quote by trimmed punctuation; everything else must be verbatim.
FREE_TEXT_KEYS = {"instruction", "text"}

PLACEHOLDER = re.compile(
    r"\b(to be confirmed|tbc|tbd|to be determined|not (stated|specified|provided)|unknown|n/?a)\b",
    re.IGNORECASE,
)

_TRANSLATE = str.maketrans({
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
    "\u2015": "-", "\u2212": "-",
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
})
_RANK = {"ok": 0, "reworded": 1, "mismatch": 2, "placeholder": 3}


def norm(text: Optional[str]) -> str:
    s = unicodedata.normalize("NFKC", text or "").translate(_TRANSLATE).lower()
    return re.sub(r"\s+", " ", s).strip()


def tokens(text: Optional[str]) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)?|[a-z]+", norm(text))


def _hyphens(s: str) -> str:
    return re.sub(r"\s*-\s*", "-", s)  # "1 - 2" and "1-2" are the same text


def core(text: Optional[str]) -> str:
    """Normalized text without edge punctuation, for phrase comparison."""
    return _hyphens(norm(text)).strip(" .,;:!?\"'()[]")


@dataclass
class FieldGround:
    path: str
    quote_status: str = "ok"   # ok | fuzzy | wrong_block | missing_block | not_found | empty
    value_status: str = "ok"   # ok | reworded | mismatch | placeholder | nothing_to_check
    verdict: str = "pass"      # pass | warn | fail
    issues: list[str] = field(default_factory=list)
    found_in: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "quote_status": self.quote_status,
            "value_status": self.value_status,
            "verdict": self.verdict,
            "issues": self.issues,
            "found_in": self.found_in,
        }


def _check_quote(quote: str, block_id: str, doc: SourceDocument) -> tuple[str, Optional[str]]:
    nq = norm(quote)
    if not nq:
        return "empty", None
    blocks = {b.block_id: norm(b.text) for b in doc.blocks}
    target = blocks.get(block_id)
    if target is None:
        for bid, text in blocks.items():
            if nq in text:
                return "missing_block", bid
        return "missing_block", None
    if nq in target:
        return "ok", None
    m = difflib.SequenceMatcher(None, target, nq, autojunk=False).find_longest_match(
        0, len(target), 0, len(nq)
    )
    if m.size / len(nq) >= 0.9:
        return "fuzzy", None
    for bid, text in blocks.items():
        if bid != block_id and nq in text:
            return "wrong_block", bid
    return "not_found", None


def _check_value(item, quote: str) -> tuple[str, list[str]]:
    """Check that each extracted value is really written in the quote, as an ordered phrase.

    Token-bag checks are not enough: a duration of '6 days' passes if '6' comes from
    'Every 6 hours' and 'days' comes from '7 days'. Structured values must appear verbatim."""
    values = {
        k: v
        for k, v in item.model_dump(exclude={"source_quote", "block_id"}).items()
        if k not in DERIVED_KEYS and v not in (None, "")
    }
    if not values:
        return "nothing_to_check", []
    nq = _hyphens(norm(quote))
    quote_tokens = set(tokens(quote))
    issues: list[str] = []
    status = "ok"

    def bump(new: str) -> None:
        nonlocal status
        if _RANK[new] > _RANK[status]:
            status = new

    for key, val in values.items():
        sval = str(val)
        if PLACEHOLDER.search(sval):
            bump("placeholder")
            issues.append(f"{key}={sval!r} is a placeholder, not a real value (treat as missing)")
            continue
        nv = core(sval)
        if nv in nq:
            continue  # verbatim phrase in the quote
        absent = [t for t in tokens(sval) if t not in quote_tokens]
        absent_numbers = [t for t in absent if t[0].isdigit()]
        if key in FREE_TEXT_KEYS and not absent_numbers:
            m = difflib.SequenceMatcher(None, nq, nv, autojunk=False).find_longest_match(0, len(nq), 0, len(nv))
            if nv and m.size / len(nv) >= 0.9:
                bump("reworded")
                issues.append(f"{key}: slightly different wording from the quote")
                continue
        bump("mismatch")
        if absent_numbers:
            issues.append(f"{key}={sval!r}: number(s) {absent_numbers} are not in the quote")
        elif absent:
            issues.append(f"{key}={sval!r}: word(s) {absent} are not in the quote")
        else:
            issues.append(f"{key}={sval!r}: its words appear in the quote but not together "
                          f"(possibly assembled from different cells)")
    return status, issues


COLUMN_KEYS = ("name", "dose", "frequency", "duration", "route")


def _check_columns(item, block, headers) -> list[str]:
    """For table rows: each value must come from the cell under its own column header."""
    if block is None or block.type != "table_row" or not block.cells:
        return []
    found = headers.get(block.table_id)
    if not found:
        return []
    hm, ncols = found
    if len(block.cells) != ncols:
        return ["row does not line up with its header (merged or ragged cells): needs a human check"]
    by_canon = {canon: i for i, canon in hm.items()}
    issues: list[str] = []
    for key in COLUMN_KEYS:
        val = getattr(item, key, None)
        if val in (None, "") or key not in by_canon:
            continue
        cell = block.cells[by_canon[key]]
        if core(val) == core(cell) or (core(val) and core(val) in core(cell)):
            continue
        other = next((hm[i] for i, c in enumerate(block.cells) if core(val) and core(val) == core(c) and i in hm), None)
        where = f"it is the {other!r} cell" if other else "that cell says something else"
        issues.append(f"{key}={val!r} is not what the {key!r} column says ({cell!r}); {where}")
    return issues


def validate_plan(plan: Optional[ExtractedPlan], doc: SourceDocument,
                  run_id: Optional[str] = None, label: str = "") -> list[FieldGround]:
    results: list[FieldGround] = []
    if plan is None:
        return results
    blocks = doc.by_id()
    headers = table_headers(doc)
    for path, item in iter_fields(plan):
        fg = FieldGround(path=path)
        fg.quote_status, fg.found_in = _check_quote(item.source_quote, item.block_id, doc)
        fg.value_status, value_issues = _check_value(item, item.source_quote or "")
        fg.issues.extend(value_issues)
        column_issues = _check_columns(item, blocks.get(item.block_id), headers)
        if column_issues:
            fg.issues.extend(column_issues)
            fg.value_status = "mismatch"

        if fg.quote_status == "empty":
            fg.issues.append("no source_quote given")
        elif fg.quote_status == "missing_block":
            hint = f" (quote found in {fg.found_in})" if fg.found_in else ""
            fg.issues.append(f"block_id {item.block_id!r} does not exist{hint}")
        elif fg.quote_status == "wrong_block":
            fg.issues.append(f"quote is not in {item.block_id} but is in {fg.found_in}")
        elif fg.quote_status == "not_found":
            fg.issues.append("quote not found in the document")
        elif fg.quote_status == "fuzzy":
            fg.issues.append("quote only approximately matches the block (edited?)")

        if fg.quote_status in ("empty", "missing_block", "not_found") or fg.value_status in ("mismatch", "placeholder"):
            fg.verdict = "fail"
        elif fg.quote_status in ("fuzzy", "wrong_block") or fg.value_status == "reworded":
            fg.verdict = "warn"
        results.append(fg)
        if run_id:
            bus.emit(run_id, STAGE, f"ground.{label}.field", fg.to_dict())

    if run_id:
        counts = {v: sum(1 for r in results if r.verdict == v) for v in ("pass", "warn", "fail")}
        bus.emit(run_id, STAGE, f"ground.{label}.done", counts)
    return results
