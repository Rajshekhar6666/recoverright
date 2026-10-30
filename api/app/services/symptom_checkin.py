"""Daily Red-Flag Symptom Check-in & Human Escalation Engine.

Clinical Evidence (BEAT-HF S10 Trial in 1,437 patients):
Remote monitoring alone failed to reduce 180-day readmissions (50.8% vs 49.2%)
because passive data collection without structured human triggers does not alter outcomes.
A daily symptom check-in must trigger an immediate human clinical response,
not merely record silent telemetry.

This engine presents a 1-tap daily check-in generated from the approved plan's
warning signs. Any positive red flag triggers an emergency triage request in the
nurse inbox.
"""
from datetime import datetime, timezone
from typing import Any, Optional

from app.schemas.api import ApprovedPlan
from app.services.event_bus import bus
from app.schemas.events import Stage
from app.services.storage import store


def get_daily_checkin_questions(plan: ApprovedPlan, lang: str = "en") -> list[dict[str, Any]]:
    """Derives daily symptom check-in questions directly from approved warning signs."""
    warning_signs = [
        (i.attrs.get("text") or i.attrs.get("instruction"))
        for i in plan.items
        if i.category == "warning_signs" and i.attrs
    ]

    questions = []
    # Core general surgical/medical checks
    if lang == "hi":
        questions.append({
            "id": "sym_fever",
            "symptom": "fever",
            "prompt": "क्या आज आपको बुखार, कंपकंपी या 100.4°F से अधिक तापमान महसूस हुआ?",
            "severity_if_yes": "critical",
        })
        questions.append({
            "id": "sym_pain",
            "symptom": "worsening_pain",
            "prompt": "क्या दवा लेने के बाद भी दर्द तेजी से बढ़ रहा है?",
            "severity_if_yes": "concern",
        })
        questions.append({
            "id": "sym_breath",
            "symptom": "shortness_of_breath",
            "prompt": "क्या आपको सांस लेने में तकलीफ या सीने में भारीपन महसूस हो रहा है?",
            "severity_if_yes": "critical",
        })
    else:
        questions.append({
            "id": "sym_fever",
            "symptom": "fever",
            "prompt": "Did you experience fever, chills, or temperature above 100.4°F today?",
            "severity_if_yes": "critical",
        })
        questions.append({
            "id": "sym_pain",
            "symptom": "worsening_pain",
            "prompt": "Is your surgical or recovery pain worsening despite taking prescribed pain medication?",
            "severity_if_yes": "concern",
        })
        questions.append({
            "id": "sym_breath",
            "symptom": "shortness_of_breath",
            "prompt": "Do you feel any shortness of breath, chest tightness, or dizziness today?",
            "severity_if_yes": "critical",
        })

    # Add specific warning signs from the discharge document if not already covered
    for idx, ws in enumerate(warning_signs[:2]):
        qid = f"sym_plan_{idx}"
        if lang == "hi":
            prompt = f"क्या आपको यह लक्षण दिखाई दिया: '{ws}'?"
        else:
            prompt = f"Have you noticed this symptom: '{ws}'?"
        questions.append({
            "id": qid,
            "symptom": ws,
            "prompt": prompt,
            "severity_if_yes": "critical",
        })

    return questions


def process_symptom_checkin(
    run_id: str,
    responses: list[dict[str, Any]],  # [{"question_id": "sym_fever", "present": True, "notes": ""}]
    submitted_by: str = "patient",
) -> dict[str, Any]:
    """Records daily check-in, flags positive symptoms, and escalates to staff inbox."""
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise KeyError("Plan not found")

    plan = ApprovedPlan.model_validate(plan_dict)
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    lang = meta.get("patient", {}).get("language", "en")

    questions = get_daily_checkin_questions(plan, lang=lang)
    q_map = {q["id"]: q for q in questions}

    positive_symptoms = []
    highest_severity = "none"

    for r in responses:
        qid = r.get("question_id")
        present = bool(r.get("present"))
        q = q_map.get(qid)
        if present and q:
            sev = q.get("severity_if_yes", "concern")
            positive_symptoms.append({
                "question_id": qid,
                "symptom": q.get("symptom"),
                "severity": sev,
                "notes": r.get("notes", ""),
            })
            if sev == "critical":
                highest_severity = "critical"
            elif highest_severity != "critical":
                highest_severity = "concern"

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "timestamp": now_iso,
        "submitted_by": submitted_by,
        "all_clear": len(positive_symptoms) == 0,
        "positive_symptoms": positive_symptoms,
        "highest_severity": highest_severity,
    }

    # Persist in run
    with store.lock(run_id):
        existing = []
        if store.has(run_id, "symptom_checkins.json"):
            try:
                existing = store.read(run_id, "symptom_checkins.json")
            except Exception:
                existing = []
        existing.append(record)
        store.write(run_id, "symptom_checkins.json", existing)
        store.audit(run_id, submitted_by, "symptom_checkin.completed",
                    all_clear=record["all_clear"],
                    positive_count=len(positive_symptoms))

    # Automatic Human Escalation if red flags detected
    if not record["all_clear"]:
        from app.services.help_store import help_store
        symptom_names = [s["symptom"] for s in positive_symptoms]
        help_req, _ = help_store.create(
            run_id=run_id,
            patient_name=meta.get("patient", {}).get("name", "Patient"),
            severity=highest_severity if highest_severity in ("critical", "concern") else "concern",
            source="button",
            heard=f"Daily check-in flagged: {', '.join(symptom_names)}",
            label="Daily Check-in Symptom Flag",
        )
        bus.emit(run_id, Stage.PATIENT, "symptom_checkin.flagged", {
            "help_id": help_req["id"],
            "symptoms": symptom_names,
            "severity": highest_severity,
        })

    return record
