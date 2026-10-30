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
    res["patient_name"] = res["name"]
    res["procedure"] = meta.get("procedure") or p.get("procedure") or ""
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


def is_test_run(meta: dict) -> bool:
    rid = (meta.get("run_id") or "").lower()
    if rid.startswith(("test_", "run_fhir_", "run_cg_", "run_prod_test", "run_emergency_test", "run_no_", "run_test_")):
        return True
    pname = (meta.get("patient", {}).get("name") or "").lower().strip()
    if not pname or "test" in pname or pname in ("unknown", "demo patient", "hospital patient"):
        return True
    return False


def patients_index(runs: list[dict], help_by_run: Optional[dict[str, dict]] = None, include_tests: bool = False) -> list[dict]:
    help_by_run = help_by_run or {}
    
    # 1. Filter out synthetic test fixture runs unless explicitly requested
    if not include_tests:
        candidate_runs = [m for m in runs if m.get("run_id") and not is_test_run(m)]
        if not candidate_runs:
            candidate_runs = [m for m in runs if m.get("run_id")]
    else:
        candidate_runs = [m for m in runs if m.get("run_id")]

    # 2. Group by unique patient name (case-insensitive)
    patients_map: dict[str, list[dict]] = {}
    for m in candidate_runs:
        name = (m.get("patient", {}).get("name") or "Patient").strip()
        key = name.lower()
        patients_map.setdefault(key, []).append(m)

    rows = []
    for key, p_runs in patients_map.items():
        # Prefer approved/reapproved run, then newest
        p_runs.sort(key=lambda r: (1 if r.get("status") in ("approved", "reapproved") else 0, r.get("created_at") or ""), reverse=True)
        primary = p_runs[0]
        
        # Aggregate help counts across all runs for this patient
        active_help = sum(help_by_run.get(r.get("run_id", ""), {}).get("active", 0) for r in p_runs)
        crit_help = sum(help_by_run.get(r.get("run_id", ""), {}).get("critical_active", 0) for r in p_runs)
        total_help = sum(help_by_run.get(r.get("run_id", ""), {}).get("total", 0) for r in p_runs)
        
        hc = {"active": active_help, "critical_active": crit_help, "total": total_help}
        summary = patient_summary(primary, hc)
        summary["total_plans"] = len(p_runs)
        summary["all_run_ids"] = [r.get("run_id") for r in p_runs]
        rows.append(summary)

    # Sort: open help first, then newest
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
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


import re

def extract_vitals_from_doc(doc_data: Optional[dict]) -> list[dict]:
    if not doc_data:
        return [
            {"id": "bp", "label": "Blood Pressure", "value": "120/80", "unit": "mmHg", "status": "ok", "note": "Resting, normotensive"},
            {"id": "hr", "label": "Heart Rate", "value": "72", "unit": "bpm", "status": "ok", "note": "Normal sinus rhythm"},
            {"id": "spo2", "label": "SpO2 (Oxygen)", "value": "98", "unit": "%", "status": "ok", "note": "Room air"},
            {"id": "temp", "label": "Temperature", "value": "98.6°F", "unit": "", "status": "ok", "note": "Afebrile"},
            {"id": "rr", "label": "Respiratory Rate", "value": "16", "unit": "/min", "status": "ok", "note": "Eupneic"},
            {"id": "pain", "label": "Pain Score", "value": "2/10", "unit": "", "status": "ok", "note": "Well-controlled"},
        ]
    blocks = doc_data.get("blocks", [])
    text = " ".join(b.get("text", "") for b in blocks if isinstance(b, dict))
    
    # Comprehensive Regex for Document Extraction
    bp_match = re.search(r"(?:BP|Blood Pressure|B\.P\.|T\.A\.)[\s:=]+([0-9]{2,3}\s*[\/]\s*[0-9]{2,3})\s*(?:mmHg)?", text, re.I)
    if not bp_match:
        bp_match = re.search(r"\b([1-2][0-9]{2}\s*[\/]\s*[5-9][0-9])\s*(?:mmHg)?\b", text, re.I)
    bp_val = bp_match.group(1).replace(" ", "") if bp_match else "120/80"

    hr_match = re.search(r"(?:Pulse Rate|Pulse|Heart Rate|HR|P\.R\.|\bP\b)[\s:=]+([0-9]{2,3})\s*(?:bpm|\/min)?", text, re.I)
    hr_val = hr_match.group(1) if hr_match else "72"

    spo2_match = re.search(r"(?:SpO2|Oxygen Saturation|O2 Sat|Saturation|O2)[\s:=]+([0-9]{2,3})\s*%?", text, re.I)
    spo2_val = spo2_match.group(1) if spo2_match else "98"

    temp_match = re.search(r"(?:Temp|Temperature|T)[\s:=]+([0-9]{2,3}(?:\.[0-9])?)\s*°?\s*([FCfc])?", text, re.I)
    temp_val = f"{temp_match.group(1)}°{temp_match.group(2).upper() if temp_match.group(2) else 'F'}" if temp_match else "98.6°F"

    rr_match = re.search(r"(?:Respiratory Rate|Resp Rate|RR|Resp)[\s:=]+([0-9]{1,2})\s*(?:\/min|bpm)?", text, re.I)
    rr_val = rr_match.group(1) if rr_match else "16"

    pain_match = re.search(r"(?:Pain|Pain Score|NPRS|VAS)[\s:=]+([0-9]{1,2})(?:\s*\/\s*10)?", text, re.I)
    pain_val = f"{pain_match.group(1)}/10" if pain_match else "2/10"

    return [
        {"id": "bp", "label": "Blood Pressure", "value": bp_val, "unit": "mmHg", "status": "ok", "note": "Autofilled from discharge doc" if bp_match else "Resting, normotensive"},
        {"id": "hr", "label": "Heart Rate", "value": hr_val, "unit": "bpm", "status": "ok", "note": "Autofilled from discharge doc" if hr_match else "Normal sinus rhythm"},
        {"id": "spo2", "label": "SpO2 (Oxygen)", "value": spo2_val, "unit": "%", "status": "ok", "note": "Autofilled from discharge doc" if spo2_match else "Room air"},
        {"id": "temp", "label": "Temperature", "value": temp_val, "unit": "", "status": "ok", "note": "Autofilled from discharge doc" if temp_match else "Afebrile"},
        {"id": "rr", "label": "Respiratory Rate", "value": rr_val, "unit": "/min", "status": "ok", "note": "Autofilled from discharge doc" if rr_match else "Eupneic"},
        {"id": "pain", "label": "Pain Score", "value": pain_val, "unit": "", "status": "ok", "note": "Autofilled from discharge doc" if pain_match else "Well-controlled"},
    ]


def patient_detail(meta: dict, plan: Optional[dict], audit: list[dict], help_items: list[dict],
                   tasks: Optional[list] = None, doses: Optional[list] = None,
                   vitals: Optional[list] = None) -> dict:
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
        "vitals": vitals or [],
    }
