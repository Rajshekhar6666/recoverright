"""Clinical Risk Stratification & Nurse Priority Call List.

Clinical Evidence (Woods et al. 2019 S11, Singapore Hospital-to-Home):
Random post-discharge nurse calls overwhelm staff capacity without targeted impact.
Risk-tiering identifies the 15-20% of discharged patients who drive readmissions,
so nurses can proactively call those 5 patients first.

Tier Classification:
• RED   (Score >= 60): Urgent Outreach within 24h (failed teach-back + high-risk drug or distress)
• AMBER (Score 30-59): Day 2–3 Structured Nurse Call (polypharmacy, older age, or missed doses)
• GREEN (Score < 30):  App-guided Recovery & Standard Reminder Flow
"""
import re
from datetime import datetime, timezone
from typing import Any

from app.services.help_store import help_store
from app.services.storage import store

HIGH_RISK_DRUG_PATTERNS = [
    re.compile(r"\b(warfarin|apixaban|rivaroxaban|dabigatran|heparin|enoxaparin|clopidogrel|ticagrelor)\b", re.I),
    re.compile(r"\b(insulin|glimepiride|gliclazide|metformin)\b", re.I),
    re.compile(r"\b(tramadol|morphine|fentanyl|oxycodone|codeine)\b", re.I),
    re.compile(r"\b(digoxin|amiodarone|lithium|phenytoin|methotrexate)\b", re.I),
]


def assess_patient_risk(run_id: str) -> dict[str, Any]:
    """Calculates multidimensional recovery risk score and actionable factors."""
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient_info = meta.get("patient") or {}

    score = 0
    factors: list[str] = []

    # 1. High-risk medication detection
    plan_dict = store.get_plan_version(run_id)
    med_items = []
    if plan_dict:
        med_items = [i for i in plan_dict.get("items", []) if i.get("category") == "medications"]

    high_risk_meds = []
    for m in med_items:
        name = (m.get("attrs") or {}).get("name", "")
        for pat in HIGH_RISK_DRUG_PATTERNS:
            if pat.search(name):
                high_risk_meds.append(name)
                break

    if high_risk_meds:
        score += 30
        factors.append(f"High-risk medication prescribed: {', '.join(high_risk_meds[:2])}")

    # 2. Polypharmacy (>4 meds)
    if len(med_items) >= 5:
        score += 20
        factors.append(f"Polypharmacy regimen ({len(med_items)} medications)")
    elif len(med_items) >= 3:
        score += 10

    # 3. Teach-back comprehension status
    tb_status = meta.get("teach_back_status")
    if tb_status == "misunderstanding_flagged":
        score += 35
        factors.append("Failed teach-back: patient misunderstood critical recovery steps")
    elif not tb_status and meta.get("approved"):
        score += 10
        factors.append("Teach-back comprehension check not completed")

    # 4. Missed doses from scheduler
    reminders = store.get_reminders(run_id)
    missed_count = sum(1 for r in reminders if r.get("status") == "missed")
    if missed_count > 0:
        score += min(30, missed_count * 15)
        factors.append(f"{missed_count} missed medication dose(s) logged")

    # 5. Active emergency distress / help requests
    active_help = [h for h in help_store.list("active") if h.get("run_id") == run_id]
    if any(h.get("severity") == "critical" for h in active_help):
        score += 40
        factors.append("Active CRITICAL distress alert flagged by patient/voice")
    elif active_help:
        score += 25
        factors.append(f"{len(active_help)} active nurse help request(s)")

    # 6. Vulnerability factors (older adult or no caregiver)
    caregivers = patient_info.get("caregivers") or []
    if not caregivers and not patient_info.get("guardian_name"):
        score += 15
        factors.append("Living alone / no verified caregiver contact on file")

    age = patient_info.get("age")
    if isinstance(age, (int, float)) and age >= 65:
        score += 15
        factors.append(f"Geriatric patient age {int(age)} years")

    # Determine tier
    if score >= 60:
        tier = "red"
        action = "Urgent Nurse Phone Outreach (Within 24 Hours)"
    elif score >= 30:
        tier = "amber"
        action = "Scheduled Clinical Call on Day 2–3"
    else:
        tier = "green"
        action = "Standard App Reminders & Self-Management"

    return {
        "run_id": run_id,
        "patient_name": patient_info.get("name", "Patient"),
        "phone": patient_info.get("phone", ""),
        "guardian_phone": patient_info.get("guardian_phone", ""),
        "language": patient_info.get("language", "en"),
        "risk_score": min(100, score),
        "risk_tier": tier,
        "recommended_action": action,
        "risk_factors": factors,
        "assessed_at": datetime.now(timezone.utc).isoformat(),
    }


def get_nurse_priority_call_list() -> list[dict[str, Any]]:
    """Returns all approved patients sorted by descending clinical risk for nurse calling."""
    all_runs = store.list_runs()
    approved_runs = [r for r in all_runs if r.get("approved") or r.get("status") in ("approved", "reapproved")]

    call_list = []
    for r in approved_runs:
        rid = r.get("run_id")
        if not rid:
            continue
        assessment = assess_patient_risk(rid)
        # Exclude patients with 0 risk factors who are purely green unless they missed a dose
        call_list.append(assessment)

    # Sort: highest risk score first
    call_list.sort(key=lambda x: x["risk_score"], reverse=True)
    return call_list
