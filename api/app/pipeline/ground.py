import difflib
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from app.pipeline.extract import iter_fields
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.plan import ExtractedPlan
from app.services.event_bus import bus

STAGE = getattr(Stage, "GROUND", Stage.PARSE)

# Fields the model derives (classifies) rather than copies; not checked against the quote.
DERIVED_KEYS = {"restriction_type"}

PLACEHOLDER = re.compile(
    r"\b(to be confirmed|tbc|tbd|to be determined|not (stated|specified|provided)|unknown|n/?a)\b",
    re.IGNORECASE,
)

_TRANSLATE = str.maketrans({
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
    "\u2015": "-", "\u2212": "-",
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
})


def norm(text: Optional[str]) -> str:
    s = unicodedata.normalize("NFKC", text or "").translate(_TRANSLATE).lower()
    return re.sub(r"\s+", " ", s).strip()


def tokens(text: Optional[str]) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)?|[a-z]+", norm(text))


@dataclass
class FieldGround:
    path: str
    quote_status: str = "ok"   # ok | fuzzy | wrong_block | missing_block | not_found | empty
    value_status: str = "ok"   # ok | mismatch | placeholder | nothing_to_check
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
    # near-exact: longest contiguous match covers >= 90% of the quote
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
    values = {
        k: v
        for k, v in item.model_dump(exclude={"source_quote", "block_id"}).items()
        if k not in DERIVED_KEYS and v not in (None, "")
    }
    if not values:
        return "nothing_to_check", []
    issues: list[str] = []
    status = "ok"
    quote_tokens = set(tokens(quote))
    quote_numbers = {t for t in quote_tokens if t[0].isdigit()}
    for key, val in values.items():
        sval = str(val)
        if PLACEHOLDER.search(sval):
            status = "placeholder"
            issues.append(f"{key}={sval!r} is a placeholder, not a real value (treat as missing)")
            continue
        vt = tokens(sval)
        absent = [t for t in vt if t not in quote_tokens]
        if absent:
            if status != "placeholder":
                status = "mismatch"
            bad_numbers = [t for t in absent if t[0].isdigit()]
            if bad_numbers:
                issues.append(f"{key}: number(s) {bad_numbers} not in quote (quote has {sorted(quote_numbers)})")
            else:
                issues.append(f"{key}: word(s) {absent} not in quote")
    return status, issues


def validate_plan(plan: Optional[ExtractedPlan], doc: SourceDocument,
                  run_id: Optional[str] = None, label: str = "") -> list[FieldGround]:
    results: list[FieldGround] = []
    if plan is None:
        return results
    for path, item in iter_fields(plan):
        fg = FieldGround(path=path)
        fg.quote_status, fg.found_in = _check_quote(item.source_quote, item.block_id, doc)
        fg.value_status, value_issues = _check_value(item, item.source_quote or "")
        fg.issues.extend(value_issues)

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
        elif fg.quote_status in ("fuzzy", "wrong_block"):
            fg.verdict = "warn"
        results.append(fg)
        if run_id:
            bus.emit(run_id, STAGE, f"ground.{label}.field", fg.to_dict())

    if run_id:
        counts = {v: sum(1 for r in results if r.verdict == v) for v in ("pass", "warn", "fail")}
        bus.emit(run_id, STAGE, f"ground.{label}.done", counts)
    return results