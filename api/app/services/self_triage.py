"""Clinical Triage, Severity Classification, and Self-Managed Recovery Engine.

Allows patients not affiliated with an EHR-integrated hospital to:
1. Register with their mobile number and upload their doctor's prescription or discharge slip.
2. Clinically classify severity into 'non_severe' (mild/moderate common recovery) vs 'severe' (high-risk/critical).
3. Auto-approve 7 to 15 days recovery plans for non-severe conditions with tailored alarms and persona voice.
4. Flag severe conditions with clinical advisory: requiring consultation with a doctor before relying solely on mobile alarms.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field

from app.services.storage import store

# High-risk / Critical conditions requiring authoritative physician sign-off
SEVERE_KEYWORDS = {
    # Cardiac & Vascular
    "cardiac", "heart attack", "myocardial", "infarct", "infarction", "angioplasty",
    "cabg", "bypass", "stent", "pacemaker", "heart failure", "chf", "arrhythmia",
    "atrial fibrillation", "aneurysm", "deep vein thrombosis", "dvt", "pulmonary embolism",
    # Neurological
    "stroke", "cva", "transient ischemic", "brain hemorrhage", "aneurysm", "seizure",
    "epilepsy", "paralysis", "concussion", "head trauma", "meningitis",
    # Oncology & Organ Failure
    "cancer", "carcinoma", "chemotherapy", "radiation therapy", "oncology", "tumor",
    "leukemia", "lymphoma", "organ transplant", "kidney transplant", "liver failure",
    "cirrhosis", "dialysis", "chronic kidney disease", "ckd",
    # Acute/Critical Care
    "sepsis", "septic shock", "icu", "ventilator", "internal hemorrhage", "bleeding",
    "multiple trauma", "pulmonary edema", "ketoacidosis", "dka",
    # High-Risk Hindi terms
    "दिल का दौरा", "हार्ट अटैक", "कैंसर", "स्ट्रोक", "लकवा", "आईसीयू", "गंभीर", "ऑपरेशन"
}

# High-risk medications with narrow therapeutic index or significant bleed/arrhythmia risk
HIGH_RISK_MEDICATIONS = {
    "warfarin", "heparin", "enoxaparin", "dabigatran", "apixaban", "rivaroxaban",
    "clopidogrel", "ticagrelor", "prasugrel",
    "digoxin", "amiodarone", "flecainide", "sotalol",
    "lithium", "phenytoin", "carbamazepine", "valproate",
    "methotrexate", "tacrolimus", "cyclosporine", "mycophenolate",
    "chemotherapy", "cisplatin", "doxorubicin", "paclitaxel",
    "morphine", "fentanyl", "oxycodone", "pethidine",
}

# Common non-severe recovery conditions
NON_SEVERE_KEYWORDS = {
    "fever", "viral fever", "flu", "cold", "cough", "pharyngitis", "sore throat",
    "bronchitis", "tonsillitis", "sinusitis", "gastroenteritis", "food poisoning",
    "stomach infection", "acidity", "gastritis", "diarrhea", "vomiting",
    "sprain", "minor fracture", "hairline fracture", "plaster", "crepe bandage",
    "tooth extraction", "dental", "root canal", "wisdom tooth",
    "dermatitis", "allergy", "rash", "skin infection", "acne", "boil",
    "conjunctivitis", "eye infection",
    "mild migraine", "tension headache",
    "routine hypertension", "high bp checkup", "routine diabetes",
    "stitch removal", "minor cut", "dressing", "wound dressing",
    "urinary tract infection", "uti", "dysuria",
    # Hindi non-severe terms
    "बुखार", "वायरल", "सर्दी", "जुकाम", "खांसी", "दांत", "हड्डी", "मोच", "पेट खराब", "उल्टी", "दस्त"
}


class SelfMedicationItem(BaseModel):
    name: str
    dose: str = "1 tablet"
    frequency: str = "Once daily"
    duration: str = "7 days"
    instructions: Optional[str] = "Take after meals with water"
    times: list[str] = Field(default_factory=lambda: ["09:00", "21:00"])


class TriageEvaluationResult(BaseModel):
    severity: str  # "non_severe" | "severe"
    is_auto_approved: bool
    plan_duration_days: int
    detected_risk_factors: list[str]
    detected_non_severe_indicators: list[str]
    advisory_en: str
    advisory_hi: str
    requires_doctor_consultation: bool


def evaluate_prescription_severity(
    diagnosis_or_symptoms: str,
    medications: list[SelfMedicationItem] | list[dict[str, Any]],
    extracted_text: str = "",
) -> TriageEvaluationResult:
    """Classifies condition severity and determines if a 7-15 day self-plan can be auto-approved."""
    combined_text = f"{diagnosis_or_symptoms} {extracted_text}".lower()

    detected_risks: list[str] = []
    detected_non_severe: list[str] = []

    # 1. Check for severe condition keywords
    for keyword in SEVERE_KEYWORDS:
        if keyword.lower() in combined_text:
            detected_risks.append(f"Condition: '{keyword.title()}'")

    # 2. Check for high-risk medications
    med_names: list[str] = []
    for med in medications:
        if isinstance(med, dict):
            m_name = med.get("name", "").lower()
        else:
            m_name = med.name.lower()
        med_names.append(m_name)
        for hrm in HIGH_RISK_MEDICATIONS:
            if hrm in m_name:
                detected_risks.append(f"High-Risk Drug: '{hrm.title()}' in '{m_name}'")

    # 3. Check for non-severe indicators
    for kw in NON_SEVERE_KEYWORDS:
        if kw.lower() in combined_text:
            detected_non_severe.append(kw.title())

    # Decision Matrix
    is_severe = len(detected_risks) > 0

    if not is_severe:
        # Determine duration between 7 to 15 days
        # Viral / flu / fever -> 7 days
        # Dental / fracture / antibiotic -> 10 to 14 days
        # Routine care -> 15 days
        if any(k in combined_text for k in ["fracture", "plaster", "dental", "surgery", "wound"]):
            duration_days = 14
        elif any(k in combined_text for k in ["antibiotic", "infection", "gastroenteritis", "uti"]):
            duration_days = 10
        elif any(k in combined_text for k in ["hypertension", "diabetes", "maintenance"]):
            duration_days = 15
        else:
            duration_days = 7

        return TriageEvaluationResult(
            severity="non_severe",
            is_auto_approved=True,
            plan_duration_days=duration_days,
            detected_risk_factors=[],
            detected_non_severe_indicators=detected_non_severe or ["Common Post-Acute Recovery"],
            advisory_en=(
                f"✅ Your {duration_days}-day self-care recovery routine has been auto-approved. "
                "Medication alarms and caring voice guidance are active."
            ),
            advisory_hi=(
                f"✅ आपका {duration_days} दिनों का सेल्फ-केयर रिकवरी प्लान स्वीकृत हो गया है। "
                "दवाई अलार्म और केयरिंग वॉइस असिस्टेंट सक्रिय हैं।"
            ),
            requires_doctor_consultation=False,
        )
    else:
        # Severe condition
        return TriageEvaluationResult(
            severity="severe",
            is_auto_approved=False,
            plan_duration_days=14,
            detected_risk_factors=detected_risks,
            detected_non_severe_indicators=detected_non_severe,
            advisory_en=(
                "⚠️ Clinical Safety Advisory: Your prescription indicates a high-risk or specialized medical condition. "
                "For your safety, medical guidelines require this recovery plan to be confirmed with your attending doctor. "
                "Alarms are available in Supervised Caution Mode."
            ),
            advisory_hi=(
                "⚠️ क्लिनिकल सुरक्षा सलाह: आपके पर्चे में गंभीर या विशेष स्वास्थ्य स्थिति पाई गई है। "
                "आपकी सुरक्षा के लिए, डॉक्टर से इस प्लान की पुष्टि करना अनिवार्य है। "
                "अलार्म निगरानी सावधानी मोड में उपलब्ध हैं।"
            ),
            requires_doctor_consultation=True,
        )


def create_self_managed_plan(
    patient_name: str,
    phone: str,
    language: str = "en",
    diagnosis_or_symptoms: str = "",
    medications: list[SelfMedicationItem] | None = None,
    extracted_text: str = "",
    preferred_duration_days: int = 10,
    hospital_name: Optional[str] = None,
) -> dict[str, Any]:
    """Generates a complete recovery plan for self-registering patients."""
    if medications is None:
        medications = [
            SelfMedicationItem(
                name="Paracetamol 650mg",
                dose="1 tablet",
                frequency="Twice daily after food",
                duration="5 days",
                instructions="Take with water if fever or pain occurs",
                times=["09:00", "21:00"],
            )
        ]

    # Evaluate severity
    triage = evaluate_prescription_severity(diagnosis_or_symptoms, medications, extracted_text)

    # Use triage duration or user preferred (clamped 7-15)
    plan_days = max(7, min(15, preferred_duration_days or triage.plan_duration_days))

    run_id = f"self_{uuid.uuid4().hex[:8]}"
    patient_token = f"pat_self_{uuid.uuid4().hex[:10]}"
    created_at = datetime.now(timezone.utc).isoformat()

    # Format medications for plan_v1.json
    plan_meds = []
    for idx, m in enumerate(medications):
        plan_meds.append({
            "id": f"med_{idx+1}",
            "name": m.name,
            "dose": m.dose,
            "frequency": m.frequency,
            "instructions": m.instructions or "As directed",
            "times": m.times or ["09:00", "21:00"],
            "confirmed_times": m.times or ["09:00", "21:00"],
            "status": "pending",
        })

    # Build structured review items
    review_items = []
    review_items.append({
        "field_id": "f_diag",
        "category": "procedure",
        "status": "agreed",
        "critical": False,
        "proposed": {"value": diagnosis_or_symptoms or "Self-Managed Recovery"},
    })

    for idx, med in enumerate(medications):
        review_items.append({
            "field_id": f"f_med_{idx+1}",
            "category": "medications",
            "status": "agreed",
            "critical": False,
            "proposed": {
                "name": med.name,
                "dose": med.dose,
                "frequency": med.frequency,
                "duration": f"{plan_days} days",
                "route": "oral",
            },
        })

    review_items.append({
        "field_id": "f_warn",
        "category": "warning_signs",
        "status": "agreed",
        "critical": True,
        "proposed": {
            "text": "High fever above 102°F, shortness of breath, severe chest pain, or uncontrollable bleeding"
        },
    })

    # Build Plan V1
    approved_status = "approved" if triage.is_auto_approved else "pending_doctor_review"
    plan_v1 = {
        "run_id": run_id,
        "patient_name": patient_name,
        "phone": phone,
        "language": language,
        "version": 1,
        "approved_at": created_at if triage.is_auto_approved else None,
        "approved_by": "Self-Care Auto-Approval Engine" if triage.is_auto_approved else None,
        "approval_note": triage.advisory_en,
        "hospital_name": hospital_name or "Self-Managed (Independent Care)",
        "is_self_managed": True,
        "severity": triage.severity,
        "plan_duration_days": plan_days,
        "items": review_items,
        "medications": plan_meds,
        "instructions": {
            "activity": ["Rest adequately during the recovery period", "Avoid strenuous physical exertion"],
            "diet": ["Drink plenty of warm fluids / water", "Eat easily digestible home-cooked meals"],
            "warning_signs": ["Fever above 102°F", "Severe weakness or persistent vomiting"],
        },
        "follow_ups": [
            {
                "id": "fu_1",
                "what": "Routine Recovery Progress Review",
                "when": f"Day {plan_days} of Recovery",
                "where": hospital_name or "Local Clinic / Teleconsultation",
            }
        ],
        "contacts": [
            {"label": "National Emergency Helpline", "value": "112"},
            {"label": "National Ambulance Helpline", "value": "108"},
        ],
    }

    # Meta record
    meta = {
        "run_id": run_id,
        "status": approved_status,
        "approved": triage.is_auto_approved,
        "filename": f"{patient_name.replace(' ', '_')}_self_prescription.json",
        "stored_name": f"{patient_name.replace(' ', '_')}_self_prescription.json",
        "created_at": created_at,
        "patient_token": patient_token,
        "hospital_name": hospital_name or "Self-Managed Care",
        "is_self_managed": True,
        "severity": triage.severity,
        "plan_duration_days": plan_days,
        "patient": {
            "name": patient_name,
            "language": language,
            "phone": phone,
            "patient_token": patient_token,
            "hospital_name": hospital_name or "Self-Managed Care",
            "caregivers": [],
        },
        "current_version": 1,
        "plan_versions": [plan_v1],
    }

    # Save to storage
    store.write(run_id, "meta.json", meta)
    store.save_plan_version(run_id, plan_v1, version=1)
    store.register_patient_token(patient_token, run_id)
    slug = store.generate_patient_slug(patient_name)
    store.register_patient_slug(slug, run_id)
    store.update_meta(run_id, patient_slug=slug)

    store.audit(
        run_id,
        "system",
        "self_plan.created",
        severity=triage.severity,
        auto_approved=triage.is_auto_approved,
        duration_days=plan_days,
        patient_token=patient_token,
    )

    return {
        "run_id": run_id,
        "patient_name": patient_name,
        "phone": phone,
        "patient_token": patient_token,
        "patient_slug": slug,
        "severity": triage.severity,
        "is_auto_approved": triage.is_auto_approved,
        "plan_duration_days": plan_days,
        "status": approved_status,
        "advisory_en": triage.advisory_en,
        "advisory_hi": triage.advisory_hi,
        "requires_doctor_consultation": triage.requires_doctor_consultation,
        "detected_risk_factors": triage.detected_risk_factors,
        "plan": plan_v1,
    }
