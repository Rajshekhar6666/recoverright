"""Clinical analytics service: aggregates real patient, task, document, and triage data.

Calculates metrics strictly from stored runs, tasks, audit trails, and help requests.
Zero fabricated statistics or invented predictions.
"""
from datetime import datetime, timezone
from typing import Any, Optional

from app.services.directory import patients_index
from app.services.help_store import help_store
from app.services.storage import store


def calculate_clinical_analytics(runs: Optional[list[dict]] = None) -> dict[str, Any]:
    """Computes comprehensive operational and clinical recovery metrics."""
    if runs is None:
        runs = store.list_runs()

    help_counts = help_store.counts_by_run()
    patients = patients_index(runs, help_counts)

    total_patients = len(patients)
    care_plans_in_progress = 0
    total_completion_sum = 0
    patients_with_tasks = 0

    total_tasks = 0
    completed_tasks = 0
    pending_tasks = 0
    overdue_tasks = 0
    snoozed_tasks = 0

    doc_stages = {
        "uploaded": 0,
        "processing": 0,
        "needs_review": 0,
        "approved": 0,
        "failed": 0,
    }

    patient_progress_list = []
    attention_list = []
    activity_timeline: dict[str, int] = {}

    for p in patients:
        rid = p["id"]
        status = p.get("status", "queued")

        # Document lifecycle counts
        if status in ("approved", "reapproved"):
            doc_stages["approved"] += 1
        elif status == "needs_review":
            doc_stages["needs_review"] += 1
        elif status in ("queued", "processing"):
            doc_stages["processing"] += 1
        elif status == "failed":
            doc_stages["failed"] += 1
        else:
            doc_stages["uploaded"] += 1

        # Tasks metrics
        tasks = store.get_tasks(rid)
        p_total_tasks = len(tasks)
        p_completed_tasks = sum(1 for t in tasks if t.get("status") == "completed")
        p_overdue_tasks = sum(1 for t in tasks if t.get("status") == "overdue")
        p_pending_tasks = sum(1 for t in tasks if t.get("status") == "pending")
        p_snoozed_tasks = sum(1 for t in tasks if t.get("status") == "snoozed")

        total_tasks += p_total_tasks
        completed_tasks += p_completed_tasks
        pending_tasks += p_pending_tasks
        overdue_tasks += p_overdue_tasks
        snoozed_tasks += p_snoozed_tasks

        # Completion rate
        completion_pct = round((p_completed_tasks / p_total_tasks * 100), 1) if p_total_tasks > 0 else 0.0

        if p.get("approved"):
            care_plans_in_progress += 1
            if p_total_tasks > 0:
                total_completion_sum += completion_pct
                patients_with_tasks += 1

        # Check procedure / diagnosis from plan or meta
        meta = store.read(rid, "meta.json") if store.has(rid, "meta.json") else {}
        patient_info = meta.get("patient") or {}
        procedure = patient_info.get("procedure") or patient_info.get("condition") or "Post-Discharge Recovery"

        patient_progress_list.append({
            "id": rid,
            "name": p.get("name", "Patient"),
            "procedure": procedure,
            "status": status,
            "approved": p.get("approved", False),
            "completion_percentage": completion_pct,
            "tasks_total": p_total_tasks,
            "tasks_completed": p_completed_tasks,
            "tasks_pending": p_pending_tasks,
            "tasks_overdue": p_overdue_tasks,
            "help_active": p.get("help_active", 0),
            "created_at": p.get("created_at", ""),
        })

        # Attention triage evaluation
        needs_attn = False
        reasons = []
        severity = "normal"

        if p.get("help_active", 0) > 0:
            needs_attn = True
            is_critical = p.get("help_critical_active", 0) > 0
            severity = "critical" if is_critical else "high"
            reasons.append(f"{p['help_active']} active help request(s)")

        if p_overdue_tasks > 0:
            needs_attn = True
            if severity != "critical":
                severity = "high"
            reasons.append(f"{p_overdue_tasks} overdue care task(s)")

        if status == "needs_review":
            needs_attn = True
            if severity == "normal":
                severity = "medium"
            to_check = p.get("to_check") or 1
            reasons.append(f"Discharge plan awaiting clinician review ({to_check} fields)")

        if status == "failed":
            needs_attn = True
            severity = "high"
            reasons.append("Document extraction failed")

        if needs_attn:
            attention_list.append({
                "id": rid,
                "name": p.get("name", "Patient"),
                "status": status,
                "severity": severity,
                "reasons": reasons,
                "primary_reason": reasons[0] if reasons else "Requires clinical follow-up",
                "target_route": f"/staff/runs/{rid}/review" if status == "needs_review" else f"/staff/patients/{rid}",
                "tasks_pending": p_pending_tasks,
                "tasks_overdue": p_overdue_tasks,
            })

        # Audit timeline aggregation
        audit_path = store.dir(rid) / "audit.jsonl"
        if audit_path.exists():
            try:
                for line in audit_path.read_text(encoding="utf-8", errors="replace").splitlines():
                    if not line.strip():
                        continue
                    try:
                        import json
                        ev = json.loads(line)
                        ts = ev.get("ts", "")
                        if ts and len(ts) >= 10:
                            day = ts[:10]
                            activity_timeline[day] = activity_timeline.get(day, 0) + 1
                    except Exception:
                        continue
            except Exception:
                pass

    avg_completion = round(total_completion_sum / patients_with_tasks, 1) if patients_with_tasks > 0 else 0.0

    # Sort attention list: critical first, then high, medium
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "normal": 3}
    attention_list.sort(key=lambda a: sev_rank.get(a["severity"], 3))

    # Sort timeline by day
    sorted_timeline = [
        {"date": day, "events": count}
        for day, count in sorted(activity_timeline.items())
    ]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_patients": total_patients,
            "patients_requiring_attention": len(attention_list),
            "care_plans_in_progress": care_plans_in_progress,
            "avg_care_plan_completion": avg_completion,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "overdue_tasks": overdue_tasks,
            "snoozed_tasks": snoozed_tasks,
            "documents_awaiting_review": doc_stages["needs_review"],
            "documents_processed": doc_stages["approved"],
            "documents_total": len(runs),
        },
        "care_plan_completion": sorted(patient_progress_list, key=lambda x: x["completion_percentage"], reverse=True),
        "task_distribution": {
            "completed": completed_tasks,
            "pending": pending_tasks,
            "overdue": overdue_tasks,
            "snoozed": snoozed_tasks,
            "total": total_tasks,
        },
        "document_stages": doc_stages,
        "patients_requiring_attention": attention_list,
        "activity_timeline": sorted_timeline,
    }
