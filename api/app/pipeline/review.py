"""Human review rules: what must be decided before a plan can be approved, and what approval produces.

Gap 5 fix: A completeness gate now checks that every approved plan contains at
least one item in each required clinical category before approval is permitted.
Missing categories are surfaced as synthetic blocker entries so the nurse can
see exactly what is absent rather than receiving a generic error.

Required items (evidence-based, from gap analysis):
  • medications  – at least one prescription item
  • follow_ups   – at least one follow-up appointment with a date/time
  • warning_signs – at least one warning sign the patient should act on
  • contacts     – at least one emergency or care-team contact
"""
from datetime import datetime, timezone
from typing import Optional

from app.schemas.review import FieldDecision, ReviewField

# ── Clinical completeness requirements (Gap 5) ─────────────────────────────
# Maps each required category to a human-readable description shown in blockers.
REQUIRED_CATEGORIES: dict[str, str] = {
    "medications": "at least one medication with name, dose and frequency",
    "follow_ups": "at least one follow-up appointment with a date or timeframe",
    "warning_signs": "at least one warning sign the patient should watch for",
    "contacts": "at least one emergency or care-team contact number",
}


class ReviewError(ValueError):
    pass


def blockers(items: list[ReviewField]) -> list[dict]:
    """Fields that still need a human decision. Agreed non-critical fields are pre-accepted."""
    out = []
    for it in items:
        f = it.field
        if it.decision:
            continue
        if f.status == "rejected":
            reason = "no verified value: enter it from the source document, or remove it"
        elif f.status == "conflict":
            reason = "sources disagree: confirm the correct value or edit it"
        elif f.status == "review":
            reason = f.issues[0] if f.issues else "needs a human check"
        elif f.critical:
            reason = "critical field: confirm it individually"
        else:
            continue
        out.append({"field_id": f.field_id, "category": f.category, "status": f.status, "reason": reason})

    # Gap 5: Completeness gate – ensure required clinical categories are present
    out.extend(_completeness_blockers(items))
    return out


def _completeness_blockers(items: list[ReviewField]) -> list[dict]:
    """Return synthetic blocker entries for required clinical categories that are absent
    or have been entirely rejected in the current review state.

    A category is considered present if at least one non-rejected item with a
    non-empty proposed value exists for it.
    """
    present: set[str] = set()
    for it in items:
        cat = it.field.category
        if cat not in REQUIRED_CATEGORIES:
            continue
        # Item counts as present if it has a proposed value and was not rejected
        decision_action = it.decision.action if it.decision else None
        if decision_action == "reject":
            continue
        if it.field.proposed or (it.decision and it.decision.action in ("confirm", "edit")):
            present.add(cat)

    out = []
    for cat, description in REQUIRED_CATEGORIES.items():
        if cat not in present:
            out.append({
                "field_id": f"__completeness__{cat}",
                "category": cat,
                "status": "missing",
                "reason": (
                    f"Plan is missing required category '{cat}' ({description}). "
                    "Add the information or confirm it is intentionally absent before approving."
                ),
            })
    return out


def apply_decision(items: list[ReviewField], field_id: str, action: str,
                   attrs: Optional[dict] = None, by: str = "staff", note: Optional[str] = None) -> ReviewField:
    it = next((i for i in items if i.field.field_id == field_id), None)
    if it is None:
        raise KeyError(field_id)
    if action == "confirm":
        if not it.field.proposed:
            raise ReviewError("there is no verified value to confirm: use edit to enter one, or reject")
        attrs = None
    elif action == "edit":
        if not attrs or not any(v not in (None, "") for v in attrs.values()):
            raise ReviewError("edit needs the corrected values")
    elif action == "reject":
        attrs = None
    else:
        raise ReviewError(f"unknown action {action!r}")
    it.decision = FieldDecision(action=action, attrs=attrs, by=by, at=datetime.now(timezone.utc), note=note)
    return it


def _estimate_plan_duration_days(items: list[dict]) -> Optional[int]:
    """Estimates recovery duration in days from medications and follow-ups."""
    max_days = 0
    import re
    for it in items:
        attrs = it.get("attrs") or {}
        dur = (attrs.get("duration") or "").lower()
        m_day = re.search(r"(\d+)\s*(?:days?|d)\b", dur)
        if m_day:
            max_days = max(max_days, int(m_day.group(1)))
        m_wk = re.search(r"(\d+)\s*(?:weeks?|wks?|w)\b", dur)
        if m_wk:
            max_days = max(max_days, int(m_wk.group(1)) * 7)
        when = (attrs.get("when") or "").lower()
        m_fu = re.search(r"(?:in\s+)?(\d+)\s*(?:weeks?|wks?)\b", when)
        if m_fu:
            max_days = max(max_days, int(m_fu.group(1)) * 7)
    return max_days if max_days > 0 else 14


def build_approved_plan(run_id: str, meta: dict, items: list[ReviewField], approver: str,
                        version: int = 1, note: Optional[str] = None) -> dict:
    accepted, removed = [], []
    for it in items:
        f, d = it.field, it.decision
        if d and d.action == "reject":
            removed.append({"field_id": f.field_id, "category": f.category, "by": d.by, "note": d.note})
            continue
        if d and d.action == "edit":
            attrs, how, edited_from = d.attrs, "edited", f.proposed
        elif d:
            attrs, how, edited_from = f.proposed, "confirmed", None
        else:
            attrs, how, edited_from = f.proposed, "auto", None  # agreed and not critical
        accepted.append({
            "field_id": f.field_id, "category": f.category, "attrs": attrs, "decision": how,
            "decided_by": d.by if d else None, "status_at_review": f.status,
            "edited_from": edited_from, "issues_at_review": f.issues,
            "source": {"block_id": f.block_id, "quote": f.quote, "units": f.units},
        })
    duration_days = _estimate_plan_duration_days(accepted)
    patient_token = meta.get("patient_token") or meta.get("patient", {}).get("patient_token")
    return {
        "run_id": run_id, "version": version, "approved_by": approver,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "patient": meta.get("patient", {}), "source_file": meta.get("filename"),
        "items": accepted, "removed": removed,
        "patient_token": patient_token,
        "plan_duration_days": duration_days,
        "approval_note": note,
    }
