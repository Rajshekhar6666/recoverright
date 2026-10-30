"""Clinical Teach-Back Comprehension Engine.

Clinical context (Okrainec et al. 2019, S6 in Gap Analysis):
Over 90% of discharged patients believe they understand their recovery plan,
yet approximately half demonstrate clinically significant misunderstandings upon
structured testing. Merely asking "Did you understand?" fails.

This engine deterministically generates 2–3 comprehension questions grounded
strictly in the approved plan:
1. Medication schedule & safe administration
2. Critical red-flag warning signs requiring emergency contact
3. Scheduled follow-up visit

If the patient submits incorrect answers or expresses confusion, an alert is
automatically dispatched to the staff inbox so the nurse can follow up before
an adverse drug event occurs.
"""
from datetime import datetime, timezone
from typing import Any, Optional

from app.schemas.api import ApprovedPlan
from app.services.event_bus import bus
from app.schemas.events import Stage
from app.services.storage import store


def generate_teach_back_questions(plan: ApprovedPlan, lang: str = "en") -> list[dict[str, Any]]:
    """Generates tailored teach-back questions grounded in the approved plan items."""
    questions: list[dict[str, Any]] = []

    # 1. Medication question
    meds = [i for i in plan.items if i.category == "medications" and i.attrs and i.attrs.get("name")]
    if meds:
        target_med = meds[0]
        name = target_med.attrs.get("name", "prescribed medicine")
        freq = target_med.attrs.get("frequency", "as directed")
        dose = target_med.attrs.get("dose", "")
        dose_str = f" ({dose})" if dose else ""

        if lang == "hi":
            q_text = f"आपको अपनी मुख्य दवा '{name}'{dose_str} कब और कैसे लेनी चाहिए?"
            opt_correct = f"डॉक्टर के निर्देशानुसार: {freq}"
            opt_wrong1 = "केवल तभी जब बहुत तेज दर्द या बुखार हो"
            opt_wrong2 = "भोजन छोड़ कर दिन में चार बार"
        else:
            q_text = f"How and when should you take your medication '{name}'{dose_str}?"
            opt_correct = f"As directed by your care team: {freq}"
            opt_wrong1 = "Only when feeling severe sudden pain"
            opt_wrong2 = "Four times a day on an empty stomach regardless of instructions"

        questions.append({
            "id": "tb_medication",
            "category": "medication",
            "question": q_text,
            "options": [
                {"id": "opt_correct", "text": opt_correct, "correct": True},
                {"id": "opt_wrong1", "text": opt_wrong1, "correct": False},
                {"id": "opt_wrong2", "text": opt_wrong2, "correct": False},
            ],
            "target_item": name,
        })

    # 2. Warning Signs question
    warning_signs = [
        (i.attrs.get("text") or i.attrs.get("instruction"))
        for i in plan.items
        if i.category == "warning_signs" and i.attrs
    ]
    if warning_signs:
        real_warning = warning_signs[0]
        if lang == "hi":
            q_text = "इनमें से कौन सा लक्षण होने पर आपको तुरंत अस्पताल कॉल करना चाहिए?"
            opt_correct = f"चेतावनी संकेत: {real_warning}"
            opt_wrong1 = "हल्की सामान्य भूख लगना"
            opt_wrong2 = "दवा लेने के बाद 10 मिनट आराम करने का मन होना"
        else:
            q_text = "Which of the following symptoms requires you to immediately contact the hospital?"
            opt_correct = f"Emergency Warning Sign: {real_warning}"
            opt_wrong1 = "Mild normal appetite after walking"
            opt_wrong2 = "Feeling slightly sleepy 10 minutes after medication"

        questions.append({
            "id": "tb_warning_sign",
            "category": "warning_signs",
            "question": q_text,
            "options": [
                {"id": "opt_correct", "text": opt_correct, "correct": True},
                {"id": "opt_wrong1", "text": opt_wrong1, "correct": False},
                {"id": "opt_wrong2", "text": opt_wrong2, "correct": False},
            ],
            "target_item": real_warning,
        })

    # 3. Follow-up question
    follow_ups = [i for i in plan.items if i.category == "follow_ups" and i.attrs and i.attrs.get("when")]
    if follow_ups:
        fu = follow_ups[0]
        when = fu.attrs.get("when", "scheduled time")
        what = fu.attrs.get("what", "Clinical review")

        if lang == "hi":
            q_text = f"आपकी अनुवर्ती नियुक्ति ({what}) कब निर्धारित है?"
            opt_correct = f"निर्धारित समय: {when}"
            opt_wrong1 = "अगले साल किसी भी दिन"
            opt_wrong2 = "अनुवर्ती जांच की कोई आवश्यकता नहीं है"
        else:
            q_text = f"When is your scheduled follow-up appointment for {what}?"
            opt_correct = f"Scheduled timeframe: {when}"
            opt_wrong1 = "Next year whenever convenient"
            opt_wrong2 = "No follow-up appointment is necessary"

        questions.append({
            "id": "tb_follow_up",
            "category": "follow_up",
            "question": q_text,
            "options": [
                {"id": "opt_correct", "text": opt_correct, "correct": True},
                {"id": "opt_wrong1", "text": opt_wrong1, "correct": False},
                {"id": "opt_wrong2", "text": opt_wrong2, "correct": False},
            ],
            "target_item": when,
        })

    return questions


def evaluate_teach_back_submission(
    run_id: str,
    answers: list[dict[str, str]],  # [{"question_id": "tb_medication", "selected_option_id": "opt_correct"}]
    submitted_by: str = "patient",
) -> dict[str, Any]:
    """Evaluates teach-back answers, logs score, and escalates misunderstandings."""
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise KeyError(f"Plan not found for run {run_id}")

    plan = ApprovedPlan.model_validate(plan_dict)
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    lang = meta.get("patient", {}).get("language", "en")

    questions = generate_teach_back_questions(plan, lang=lang)
    q_map = {q["id"]: q for q in questions}

    total = len(questions)
    correct_count = 0
    evaluations = []
    misunderstood_categories = []

    for ans in answers:
        qid = ans.get("question_id")
        opt_id = ans.get("selected_option_id")
        q = q_map.get(qid)
        if not q:
            continue

        selected_opt = next((o for o in q["options"] if o["id"] == opt_id), None)
        is_correct = bool(selected_opt and selected_opt.get("correct"))
        if is_correct:
            correct_count += 1
        else:
            misunderstood_categories.append(q["category"])

        evaluations.append({
            "question_id": qid,
            "category": q["category"],
            "is_correct": is_correct,
            "selected_option_id": opt_id,
            "selected_text": selected_opt.get("text") if selected_opt else "",
        })

    score_pct = round((correct_count / total * 100), 1) if total > 0 else 100.0
    passed = score_pct >= 80.0 and "warning_signs" not in misunderstood_categories

    result = {
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "submitted_by": submitted_by,
        "total_questions": total,
        "correct_count": correct_count,
        "score_percentage": score_pct,
        "passed": passed,
        "evaluations": evaluations,
        "misunderstood_categories": misunderstood_categories,
    }

    # Persist in storage
    with store.lock(run_id):
        existing = []
        if store.has(run_id, "teach_back_history.json"):
            try:
                existing = store.read(run_id, "teach_back_history.json")
            except Exception:
                existing = []
        existing.append(result)
        store.write(run_id, "teach_back_history.json", existing)
        store.update_meta(run_id, teach_back_status="passed" if passed else "misunderstanding_flagged",
                          teach_back_last_score=score_pct)
        store.audit(run_id, submitted_by, "teach_back.evaluated",
                    passed=passed, score=score_pct,
                    misunderstood=misunderstood_categories)

    # Escalation to nurse if misunderstanding detected
    if not passed:
        from app.services.help_store import help_store
        severity = "critical" if "warning_signs" in misunderstood_categories else "concern"
        patient_name = meta.get("patient", {}).get("name", "Patient")
        help_req, _ = help_store.create(
            run_id=run_id,
            patient_name=patient_name,
            severity=severity,
            source="teach_back",
            heard=f"Teach-back score {score_pct}%. Misunderstood: {', '.join(misunderstood_categories)}",
            label="Teach-Back Misunderstanding",
        )
        bus.emit(run_id, Stage.PATIENT, "teach_back.escalated", {
            "help_id": help_req["id"],
            "score": score_pct,
            "misunderstood": misunderstood_categories,
        })

    return result



def get_teach_back_stats(run_id: str) -> dict:
    """Returns aggregate teach-back statistics for a run (used by pilot metrics).

    Returns counts of sessions, passed sessions, and average score.
    Returns zeroed stats if no teach-back history exists.
    """
    if not store.has(run_id, "teach_back_history.json"):
        return {"total_sessions": 0, "passed_sessions": 0, "avg_score_pct": None}

    try:
        history = store.read(run_id, "teach_back_history.json")
    except Exception:
        return {"total_sessions": 0, "passed_sessions": 0, "avg_score_pct": None}

    if not history:
        return {"total_sessions": 0, "passed_sessions": 0, "avg_score_pct": None}

    total = len(history)
    passed = sum(1 for h in history if h.get("passed", False))
    scores = [h.get("score_percentage", 0) for h in history if h.get("score_percentage") is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    return {
        "total_sessions": total,
        "passed_sessions": passed,
        "avg_score_pct": avg_score,
    }
