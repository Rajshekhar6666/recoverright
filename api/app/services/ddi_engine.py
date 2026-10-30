"""Clinical Drug-Drug Interaction (DDI) and Post-Discharge Safety Engine.

Clinical context (Gap 2 / Gap 14 / JMIR Human Factors S9):
Medication discrepancies and adverse drug events (ADEs) cause up to 66% of preventable
post-discharge hospital readmissions. This service scans approved medications and newly
reconciled drugs against a clinically validated interaction rulebook.
"""
import re
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel

from app.services.storage import store


class DDIInteractionRule(BaseModel):
    drug_a: str
    drug_b: str
    severity: str  # "critical", "severe", "moderate"
    mechanism: str
    clinical_risk: str
    recommendation: str


class DDIAlert(BaseModel):
    alert_id: str
    drug_a: str
    drug_b: str
    severity: str
    clinical_risk: str
    mechanism: str
    recommendation: str
    detected_at: str


# Clinically curated high-risk post-discharge interaction database
KNOWN_DDI_RULES: list[DDIInteractionRule] = [
    DDIInteractionRule(
        drug_a="warfarin",
        drug_b="ibuprofen",
        severity="critical",
        mechanism="Pharmacodynamic synergism: NSAID inhibition of platelet COX-1 + anticoagulant hypoprothrombinemia.",
        clinical_risk="Severe Gastrointestinal Hemorrhage and Major Bleeding Risk.",
        recommendation="Discontinue NSAID; substitute with Paracetamol (Acetaminophen) for analgesia; monitor INR closely.",
    ),
    DDIInteractionRule(
        drug_a="apixaban",
        drug_b="aspirin",
        severity="severe",
        mechanism="Combined antiplatelet and direct oral factor Xa inhibition.",
        clinical_risk="Significantly increased risk of intracranial and systemic bleeding.",
        recommendation="Review clinical indication for concurrent antiplatelet therapy; restrict to shortest duration necessary.",
    ),
    DDIInteractionRule(
        drug_a="clopidogrel",
        drug_b="omeprazole",
        severity="moderate",
        mechanism="CYP2C19 competitive inhibition reducing clopidogrel active metabolite conversion.",
        clinical_risk="Diminished antiplatelet efficacy; increased risk of recurrent stent thrombosis.",
        recommendation="Switch to Pantoprazole or H2-receptor antagonist (Famotidine) which has minimal CYP2C19 interaction.",
    ),
    DDIInteractionRule(
        drug_a="ramipril",
        drug_b="spironolactone",
        severity="severe",
        mechanism="Dual blockade of renin-angiotensin-aldosterone axis impairing renal potassium excretion.",
        clinical_risk="Severe Life-Threatening Hyperkalemia (Serum K+ > 5.5 mEq/L) and Cardiac Arrhythmias.",
        recommendation="Monitor serum potassium and renal function (eGFR/Cr) within 7 days of discharge; educate on low-potassium diet.",
    ),
    DDIInteractionRule(
        drug_a="metoprolol",
        drug_b="verapamil",
        severity="critical",
        mechanism="Additive negative inotropic, chronotropic, and dromotropic cardiac depression.",
        clinical_risk="Profound Bradycardia, High-Grade AV Heart Block, and Cardiogenic Shock.",
        recommendation="Contraindicated combination in post-cardiac recovery unless supervised under telemetry monitoring.",
    ),
    DDIInteractionRule(
        drug_a="ciprofloxacin",
        drug_b="amiodarone",
        severity="critical",
        mechanism="Additive IKr potassium channel prolongation during ventricular repolarization.",
        clinical_risk="QTc Prolongation and Fatal Torsades de Pointes Ventricular Tachycardia.",
        recommendation="Avoid concurrent use; choose alternative antibiotic class (e.g., beta-lactam) after QTc review.",
    ),
    DDIInteractionRule(
        drug_a="methotrexate",
        drug_b="amoxicillin",
        severity="severe",
        mechanism="Inhibition of renal organic anion transporter (OAT3) tubular secretion.",
        clinical_risk="Methotrexate toxicity: severe bone marrow suppression, pancytopenia, mucositis.",
        recommendation="Monitor complete blood count; adjust methotrexate dose or consider alternative antimicrobial.",
    ),
    DDIInteractionRule(
        drug_a="tramadol",
        drug_b="sertraline",
        severity="severe",
        mechanism="Additive central serotonergic neurotransmission enhancement.",
        clinical_risk="Serotonin Syndrome (hyperthermia, autonomic hyperactivity, clonus, delirium).",
        recommendation="Use non-serotonergic analgesic or monitor closely for early agitation, tremor, or diaphoresis.",
    ),
]


def _normalize_drug_name(name: str) -> str:
    """Normalizes medication name by removing doses, salt forms, and symbols."""
    cleaned = re.sub(r"\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|tablets?|capsules?)\b", "", name.lower())
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    return " ".join(cleaned.split())


def check_medication_interactions(medication_names: list[str]) -> list[DDIAlert]:
    """Scans a list of drug names against the clinical DDI rulebook."""
    normalized_drugs = [_normalize_drug_name(m) for m in medication_names]
    alerts: list[DDIAlert] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, drug_a in enumerate(normalized_drugs):
        for jdx in range(idx + 1, len(normalized_drugs)):
            drug_b = normalized_drugs[jdx]
            
            for rule in KNOWN_DDI_RULES:
                # Check bidirectional match
                match_a_first = (rule.drug_a in drug_a and rule.drug_b in drug_b)
                match_b_first = (rule.drug_b in drug_a and rule.drug_a in drug_b)

                if match_a_first or match_b_first:
                    alert_id = f"ddi_{rule.drug_a[:4]}_{rule.drug_b[:4]}"
                    alerts.append(
                        DDIAlert(
                            alert_id=alert_id,
                            drug_a=medication_names[idx],
                            drug_b=medication_names[jdx],
                            severity=rule.severity,
                            clinical_risk=rule.clinical_risk,
                            mechanism=rule.mechanism,
                            recommendation=rule.recommendation,
                            detected_at=now_iso,
                        )
                    )

    return alerts


def check_plan_interactions(run_id: str) -> dict[str, Any]:
    """Checks the approved recovery plan or review items of a run for DDIs."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    med_names: list[str] = []
    # Check approved plan first
    plan = store.get_plan_version(run_id)
    if plan and "medications" in plan:
        med_names = [m.get("name", "") for m in plan.get("medications", []) if m.get("name")]
    elif store.has(run_id, "review.json"):
        # Pre-approval review items
        review_items = store.read(run_id, "review.json")
        for item in review_items:
            attrs = item.get("attrs") or {}
            # Medication fields typically have a 'name' or 'medication' attribute
            if item.get("field_type") == "medication" or "name" in attrs:
                name = attrs.get("name") or attrs.get("medication")
                if name:
                    med_names.append(str(name))

    alerts = check_medication_interactions(med_names)
    critical_count = sum(1 for a in alerts if a.severity == "critical")
    severe_count = sum(1 for a in alerts if a.severity == "severe")
    moderate_count = sum(1 for a in alerts if a.severity == "moderate")

    return {
        "run_id": run_id,
        "scanned_medications": med_names,
        "total_medications": len(med_names),
        "total_alerts": len(alerts),
        "critical_count": critical_count,
        "severe_count": severe_count,
        "moderate_count": moderate_count,
        "safe_to_discharge": critical_count == 0,
        "alerts": [a.model_dump() for a in alerts],
    }
