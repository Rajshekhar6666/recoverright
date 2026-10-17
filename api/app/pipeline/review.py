"""Human review rules: what must be decided before a plan can be approved, and what approval produces."""
from datetime import datetime, timezone
from typing import Optional

from app.schemas.review import FieldDecision, ReviewField


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


def build_approved_plan(run_id: str, meta: dict, items: list[ReviewField], approver: str) -> dict:
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
    return {
        "run_id": run_id, "version": 1, "approved_by": approver,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "patient": meta.get("patient", {}), "source_file": meta.get("filename"),
        "items": accepted, "removed": removed,
    }
