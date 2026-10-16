"""Combine the voters (Extractor A, Extractor B, table rules) into one status per field.

Voters are aligned by WHERE in the document they point (shared units), not by list position,
and attributes are compared after normalization, so punctuation noise is not a disagreement."""
import re
from typing import Optional

from app.pipeline.extract import iter_fields
from app.pipeline.ground import PLACEHOLDER, core, validate_plan
from app.pipeline.tables import table_medications
from app.pipeline.units import segment
from app.schemas.document import SourceDocument
from app.schemas.events import Stage
from app.schemas.plan import ExtractedPlan
from app.schemas.reconcile import Opinion, ReconciledField
from app.schemas.units import Unit
from app.services.event_bus import bus

RANK = {"agreed": 0, "review": 1, "conflict": 2, "rejected": 3}
DERIVED = {"restriction_type"}  # guesses about meaning, never counted as evidence
CRITICAL_CATEGORIES = {"medications", "follow_ups", "warning_signs", "contacts"}
CRITICAL_ATTRS = {
    "medications": ("name", "dose", "frequency", "duration", "route"),
    "follow_ups": ("when",),
    "procedure": ("value",),
    "contacts": ("value",),
}
REQUIRED_ATTRS = {"medications": ("dose", "frequency", "duration"), "follow_ups": ("when",)}
TEXT_ATTR = {"wound_care": "instruction", "activity": "instruction", "diet": "instruction", "warning_signs": "text"}
PRIORITY = {"rules": 0, "A": 1, "B": 2}
LABEL = {"A": "Extractor A", "B": "Extractor B", "rules": "the table reader"}
FILLER = {"in", "the", "at", "a", "an", "of", "on"}

RANGE = re.compile(r"\d+(?:\.\d+)?\s*(?:-|\u2013|to|or)\s*\d+(?:\.\d+)?", re.IGNORECASE)
FLEX_FREQ = re.compile(r"\b(as needed|when needed|if needed|prn|as required|if required|as directed|as advised|as instructed)\b", re.IGNORECASE)
OPEN_END = re.compile(r"\b(until (?:review|further notice|told|advised)|ongoing)\b", re.IGNORECASE)


def canon(value: Optional[str]) -> str:
    """Comparison form: lowercase, no edge punctuation, filler words dropped.
    '5 mg' and '15 mg' stay different; 'in 2 weeks' equals '2 weeks'."""
    return " ".join(t for t in core(value).split() if t not in FILLER)


def ambiguity(category: str, attrs: dict) -> list[str]:
    """Problems in the SOURCE text itself. Agreement between models does not make these safe."""
    msgs: list[str] = []
    if category == "medications":
        dose, freq, dur = attrs.get("dose"), attrs.get("frequency"), attrs.get("duration")
        if dose and RANGE.search(dose):
            msgs.append(f"dose {dose!r} is a range: staff must confirm the exact dose")
        if freq and FLEX_FREQ.search(freq):
            msgs.append(f"frequency {freq!r} is not a fixed schedule: staff must set reminder times or mark as needed")
        if dur and (OPEN_END.search(dur) or RANGE.search(dur)):
            msgs.append(f"duration {dur!r} has no fixed end: staff must confirm a stop or review date")
    return msgs


def _clean_attrs(item) -> tuple[dict, list[str]]:
    attrs: dict[str, Optional[str]] = {}
    notes: list[str] = []
    for k, v in item.model_dump(exclude={"source_quote", "block_id"} | DERIVED).items():
        if v in (None, ""):
            attrs[k] = None
        elif PLACEHOLDER.search(str(v)):
            attrs[k] = None
            notes.append(f"{k}={str(v).strip(' .')!r} is a placeholder, treated as not stated")
        else:
            attrs[k] = str(v).strip()
    return attrs, notes


def _units_for(quote: str, block_id: str, units: list[Unit]) -> list[str]:
    cq = core(quote)
    if not cq:
        return []

    def hits(pool):
        return [u.unit_id for u in pool if u.kind != "heading" and core(u.text)
                and (core(u.text) in cq or cq in core(u.text))]

    found = hits([u for u in units if u.block_id == block_id])
    return found or hits(units)  # fall back to anywhere if the block id was wrong


def _opinions(voter: str, plan: Optional[ExtractedPlan], doc: SourceDocument, units: list[Unit]) -> list[tuple[str, Opinion, list[str]]]:
    if plan is None:
        return []
    ground = {g.path: g for g in validate_plan(plan, doc)}
    out = []
    for path, item in iter_fields(plan):
        g = ground.get(path)
        trusted = g is None or (g.quote_status in ("ok", "fuzzy", "wrong_block")
                                and g.value_status in ("ok", "reworded", "placeholder", "nothing_to_check"))
        attrs, notes = _clean_attrs(item)
        op = Opinion(voter=voter, path=path, attrs=attrs, block_id=item.block_id, quote=item.source_quote,
                     units=_units_for(item.source_quote, item.block_id, units), trusted=trusted,
                     ground_issues=(g.issues if g and not trusted else []))
        out.append((path.split("[")[0], op, notes))
    return out


def _cluster(items: list[tuple[str, Opinion, list[str]]]) -> list[list[tuple[str, Opinion, list[str]]]]:
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    seen: dict[tuple[str, str], int] = {}
    for i, (cat, op, _) in enumerate(items):
        for u in op.units:
            key = (cat, u)
            if key in seen:
                parent[find(i)] = find(seen[key])
            else:
                seen[key] = i
    groups: dict[int, list] = {}
    for i, it in enumerate(items):
        groups.setdefault(find(i), []).append(it)
    return list(groups.values())


def _worse(a: str, b: str) -> str:
    return a if RANK[a] >= RANK[b] else b


def _decide(category: str, group: list) -> ReconciledField:
    ops = [op for _, op, _ in group]
    issues: list[str] = []
    for _, op, notes in group:
        issues += [f"{LABEL[op.voter]}: {n}" for n in notes]
    voters = sorted({o.voter for o in ops}, key=lambda v: PRIORITY[v])
    trusted = [o for o in ops if o.trusted]
    for o in ops:
        if not o.trusted:
            issues.append(f"{LABEL[o.voter]} failed verification: " + "; ".join(o.ground_issues or ["quote does not support the value"]))
    all_units = sorted({u for o in ops for u in o.units}, key=lambda u: int(u[1:]))
    base = dict(category=category, critical=category in CRITICAL_CATEGORIES, units=all_units,
                voters=voters, opinions=ops)
    fid_anchor = all_units[0] if all_units else f"{ops[0].voter}{ops[0].path}"
    field_id = f"{category}:{fid_anchor}"
    if not all_units:
        issues.append("the quote could not be located in the document")
    if not trusted:
        return ReconciledField(field_id=field_id, status="rejected", issues=issues, **base)

    rep: dict[str, Opinion] = {}
    for o in sorted(trusted, key=lambda o: PRIORITY[o.voter]):
        rep.setdefault(o.voter, o)
    text_attr = TEXT_ATTR.get(category)
    if text_attr:  # keep the most complete wording: it contains the shorter fragments
        chosen = max(trusted, key=lambda o: len(o.attrs.get(text_attr) or ""))
    else:
        chosen = rep[min(rep, key=lambda v: PRIORITY[v])]

    status = "agreed"
    for attr in CRITICAL_ATTRS.get(category, ()):
        vals = {v: canon(o.attrs.get(attr)) for v, o in rep.items()}
        present = {v: x for v, x in vals.items() if x}
        if len(set(present.values())) > 1:
            status = _worse(status, "conflict")
            issues.append(f"sources disagree on {attr}: " + ", ".join(f"{LABEL[v]} says {rep[v].attrs[attr]!r}" for v in present))
        elif not present:
            if attr in REQUIRED_ATTRS.get(category, ()):
                status = _worse(status, "review")
                issues.append(f"{attr} is not stated in the document: add it or confirm it is intentionally empty")
        elif len(present) < len(rep):
            status = _worse(status, "review")
            issues.append(f"{attr} was found by only some sources")
    for msg in ambiguity(category, chosen.attrs):
        status = _worse(status, "review")
        issues.append(msg)
    if len(rep) < 2:
        status = _worse(status, "review")
        issues.append(f"only one verified source ({LABEL[next(iter(rep))]})")
    if any(not o.trusted for o in ops):
        status = _worse(status, "review")
    if category in ("contacts",) and len(ops) > 1 and len({o.voter for o in ops}) == 1:
        issues.append(f"{len(ops)} overlapping items from the same extractor were merged here")

    return ReconciledField(field_id=field_id, status=status, proposed=chosen.attrs, proposed_from=LABEL[chosen.voter],
                           block_id=chosen.block_id, quote=chosen.quote, issues=issues, **base)


def reconcile(doc: SourceDocument, plan_a: Optional[ExtractedPlan], plan_b: Optional[ExtractedPlan],
              run_id: Optional[str] = None, use_rules: bool = True) -> list[ReconciledField]:
    def emit(type_, payload=None):
        if run_id:
            bus.emit(run_id, Stage.RECONCILE, type_, payload)

    emit("reconcile.started", {"voters": ["A", "B"] + (["rules"] if use_rules else [])})
    units = segment(doc)
    items = _opinions("A", plan_a, doc, units) + _opinions("B", plan_b, doc, units)
    if use_rules:
        rule_meds = table_medications(doc)
        if rule_meds:
            items += _opinions("rules", ExtractedPlan(medications=rule_meds), doc, units)

    fields = [_decide(group[0][0], group) for group in _cluster(items)]
    fields.sort(key=lambda f: (int(f.units[0][1:]) if f.units else 10**6, f.category))
    for f in fields:
        emit("reconcile.field", {"field_id": f.field_id, "category": f.category, "status": f.status,
                                 "critical": f.critical, "voters": f.voters, "proposed": f.proposed,
                                 "issues": f.issues[:3]})
    counts = {s: sum(1 for f in fields if f.status == s) for s in RANK}
    emit("reconcile.done", counts)
    return fields
