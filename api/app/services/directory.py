"""Patient directory for the care-team console: one "patient" is one discharge run.

Pure functions over plain dicts (no FastAPI / pydantic / file-store imports), so they are unit-tested in
isolation. The routers read the files and pass the data in.
"""
import json
from pathlib import Path
from typing import Any, Optional

CATEGORY_ORDER = ["procedure", "medications", "wound_care", "activity", "diet", "follow_ups", "warning_signs", "contacts"]
CATEGORY_LABEL = {
    "procedure": "Procedure", "medications": "Medications", "wound_care": "Wound care", "activity": "Activity",
    "diet": "Diet", "follow_ups": "Follow-ups", "warning_signs": "Warning signs", "contacts": "Contacts",
}
ATTR_ORDER = {
    "procedure": ["value"], "medications": ["name", "dose", "frequency", "duration", "route"],
    "wound_care": ["instruction"], "activity": ["instruction"], "diet": ["instruction"],
    "follow_ups": ["what", "when", "where"], "warning_signs": ["text"], "contacts": ["label", "value"],
}


def _patient(meta: dict) -> dict:
    p = meta.get("patient") or {}
    res = {k: p.get(k) or "" for k in ("name", "language", "phone", "guardian_name", "guardian_phone")}
    res["patient_token"] = p.get("patient_token") or meta.get("patient_token") or ""
    return res


def patient_summary(meta: dict, help_counts: Optional[dict] = None) -> dict:
    """One row of the patient list."""
    hc = help_counts or {}
    counts = meta.get("counts") or {}
    to_check = sum(counts.get(k, 0) for k in ("review", "conflict", "rejected"))
    return {
        "id": meta["run_id"],
        **_patient(meta),
        "status": meta.get("status", "queued"),
        "approved": bool(meta.get("approved")),
        "approved_by": meta.get("approved_by"),
        "filename": meta.get("filename", ""),
        "created_at": meta.get("created_at", ""),
        "patient_token": meta.get("patient_token") or meta.get("patient", {}).get("patient_token") or "",
        "current_version": meta.get("current_version", 1),
        "to_check": to_check if counts else None,
        "help_active": hc.get("active", 0),
        "help_critical_active": hc.get("critical_active", 0),
        "help_total": hc.get("total", 0),
        "patient_slug": meta.get("patient_slug") or "",
        "dashboard_url": f"/p/demo/{meta['patient_slug']}" if meta.get("patient_slug") else f"/p/{meta.get('patient_token', '')}",
    }


def patients_index(runs: list[dict], help_by_run: Optional[dict[str, dict]] = None) -> list[dict]:
    help_by_run = help_by_run or {}
    rows = [patient_summary(m, help_by_run.get(m.get("run_id", ""))) for m in runs if m.get("run_id")]
    # people who need attention first (open help), then newest first
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    rows.sort(key=lambda r: (-r["help_critical_active"], -r["help_active"]))
    return rows


def read_audit(path: Path) -> list[dict]:
    """audit.jsonl: one JSON object per line. Damaged lines are skipped, never fatal."""
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def humanize_audit(e: dict) -> dict:
    """A raw audit line becomes a sentence a nurse can read."""
    action, actor = str(e.get("action", "")), str(e.get("actor", "") or "system")
    note = e.get("note")
    tone, text = "info", action
    if action == "run.created":
        text = f"Document uploaded: {e.get('filename', 'document')}"
    elif action == "field.confirm":
        tone, text = "ok", f"Confirmed field {e.get('field_id', '')}"
    elif action == "field.edit":
        tone, text = "warn", f"Edited field {e.get('field_id', '')}"
    elif action == "field.reject":
        tone, text = "bad", f"Removed field {e.get('field_id', '')}"
    elif action == "plan.approved":
        tone, text = "ok", f"Plan approved and locked ({e.get('items', '?')} items)"
    elif action == "plan.reapproved":
        tone, text = "ok", f"Plan revised and approved as v{e.get('version', '?')} ({e.get('items', '?')} items)"
    elif action == "run.retried":
        tone, text = "info", "Extraction pipeline restarted by staff"
    elif action == "task.completed":
        tone, text = "ok", f"Task completed: {e.get('task_id', '')}"
    elif action == "medication.reported_taken":
        tone, text = "ok", f"Medication reported taken: {e.get('med_id', '')} via {e.get('via', 'app')}"
    elif action == "medication.reminder_ack":
        tone, text = "info", f"Medication reminder acknowledged: {e.get('med_id', '')}"
    return {"at": e.get("ts", ""), "actor": actor, "action": action, "text": text, "note": note, "tone": tone}


def _summarise(category: str, attrs: Optional[dict]) -> str:
    if not attrs:
        return ""
    order = ATTR_ORDER.get(category) or list(attrs)
    parts = [str(attrs[k]) for k in order if attrs.get(k)]
    parts += [str(v) for k, v in attrs.items() if k not in order and v]
    return " · ".join(parts)


def group_plan(plan: Optional[dict]) -> list[dict]:
    """Approved plan items grouped by category, in a fixed, sensible order."""
    if not plan:
        return []
    groups: dict[str, list[dict]] = {}
    for it in plan.get("items", []):
        cat = it.get("category", "other")
        groups.setdefault(cat, []).append({
            "field_id": it.get("field_id"),
            "attrs": it.get("attrs") or {},
            "summary": _summarise(cat, it.get("attrs")),
            "decision": it.get("decision"),
            "decided_by": it.get("decided_by"),
            "edited": it.get("decision") == "edited",
        })
    cats = [c for c in CATEGORY_ORDER if c in groups] + sorted(c for c in groups if c not in CATEGORY_ORDER)
    return [{"category": c, "label": CATEGORY_LABEL.get(c, c.replace("_", " ").title()), "items": groups[c]} for c in cats]


def patient_detail(meta: dict, plan: Optional[dict], audit: list[dict], help_items: list[dict],
                   tasks: Optional[list] = None, doses: Optional[list] = None) -> dict:
    hc = {"active": 0, "critical_active": 0, "total": len(help_items)}
    for h in help_items:
        if h["status"] != "resolved":
            hc["active"] += 1
            hc["critical_active"] += 1 if h["severity"] == "critical" else 0
    return {
        "summary": patient_summary(meta, hc),
        "run": {
            "run_id": meta.get("run_id"),
            "status": meta.get("status"),
            "filename": meta.get("filename"),
            "created_at": meta.get("created_at"),
            "approved": meta.get("approved"),
            "approved_by": meta.get("approved_by"),
            "error": meta.get("error"),
            "counts": meta.get("counts"),
            "patient_token": meta.get("patient_token") or meta.get("patient", {}).get("patient_token"),
            "current_version": meta.get("current_version", 1),
        },
        "plan": group_plan(plan),
        "plan_removed": (plan or {}).get("removed", []),
        "plan_approved_at": (plan or {}).get("approved_at"),
        "plan_version": (plan or {}).get("version", meta.get("current_version", 1)),
        "activity": [humanize_audit(a) for a in audit][::-1],  # newest first
        "help": help_items,
        "tasks": tasks or [],
        "doses": doses or [],
    }
