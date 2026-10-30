"""10-Second Clinical Handover Note Generator (SBAR Standard).

Clinical Context:
Hospital shift changes and community nurse home visits require rapid situational
awareness without digging through dozens of raw clinical pages.

This service synthesizes:
• Situation: Patient demographics, surgical procedure, post-discharge day
• Background: Attending physician, approved plan version, primary caregiver
• Assessment: Risk tier (Red/Amber/Green), teach-back score, missed doses, recent symptoms
• Recommendation: Specific high-priority clinical action items for the incoming nurse
"""
from datetime import date, datetime, timezone
from typing import Any

from app.services.risk_tiering import assess_patient_risk
from app.services.storage import store


def generate_handover_note(run_id: str) -> dict[str, Any]:
    """Generates a concise SBAR clinical handover note for nurse shift handoff."""
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient_info = meta.get("patient") or {}
    plan_dict = store.get_plan_version(run_id)

    # 1. Situation
    name = patient_info.get("name", "Patient")
    procedure = patient_info.get("procedure") or "Clinical Recovery"
    approved_at = (plan_dict or {}).get("approved_at") or meta.get("created_at") or ""
    post_op_day = 1
    if approved_at:
        try:
            app_date = datetime.fromisoformat(approved_at.replace("Z", "+00:00")).date()
            today = date.today()
            post_op_day = max(1, (today - app_date).days + 1)
        except Exception:
            post_op_day = 1

    situation = (
        f"{name}, Post-Discharge Day {post_op_day} following {procedure}. "
        f"Language: {patient_info.get('language', 'en').upper()}."
    )

    # 2. Background
    approver = (plan_dict or {}).get("approved_by", "Clinical Team")
    caregiver = (patient_info.get("caregivers") or [{}])[0].get("name") or patient_info.get("guardian_name") or "None on file"
    med_count = len([i for i in (plan_dict or {}).get("items", []) if i.get("category") == "medications"])

    background = (
        f"Approved by {approver} (Plan v{meta.get('current_version', 1)}). "
        f"Regimen: {med_count} prescribed medication(s). Primary Caregiver: {caregiver}."
    )

    # 3. Assessment
    risk_data = assess_patient_risk(run_id)
    reminders = store.get_reminders(run_id)
    missed_count = sum(1 for r in reminders if r.get("status") == "missed")
    tb_status = meta.get("teach_back_status", "pending")
    tb_score = meta.get("teach_back_last_score")
    tb_summary = f"{tb_status} ({tb_score}%)" if tb_score is not None else tb_status

    assessment = (
        f"Risk Tier: {risk_data['risk_tier'].upper()} (Score {risk_data['risk_score']}/100). "
        f"Teach-back: {tb_summary}. "
        f"Adherence: {missed_count} missed dose(s) logged."
    )

    # 4. Recommendation
    recommendations = []
    if risk_data["risk_tier"] == "red":
        recommendations.append("Priority outreach: Contact patient/caregiver within shift to triage flagged distress.")
    if missed_count > 0:
        recommendations.append(f"Medication check: Reconcile reasons for {missed_count} missed medication dose(s).")
    if tb_status == "misunderstanding_flagged":
        recommendations.append("Reinforce education: Review red-flag warning signs and emergency helpline numbers.")
    if not recommendations:
        recommendations.append("Routine check: Maintain standard recovery monitoring; verify first follow-up appointment.")

    return {
        "run_id": run_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "patient_name": name,
        "post_op_day": post_op_day,
        "risk_tier": risk_data["risk_tier"],
        "sbar": {
            "situation": situation,
            "background": background,
            "assessment": assessment,
            "recommendation": " ".join(recommendations),
        },
        "raw_factors": risk_data["risk_factors"],
    }
