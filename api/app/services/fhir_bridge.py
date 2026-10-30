"""HL7 FHIR R4 Interoperability & ABDM (Ayushman Bharat Digital Mission) Bridge.

Health System Context (Gap 14):
Hospitals report EHR integration, local validation, and security reviews as top
barriers to adopting digital health tools (JMIR Human Factors S9). Furthermore,
India's ABDM infrastructure (over 93 crore ABHA IDs) requires FHIR R4 compliance
for linking discharge summaries into the national Electronic Health Record ecosystem.

This module provides two-way interoperability:
1. Export: Converts an approved RecoverRight recovery plan into a valid HL7 FHIR R4
   Document Bundle (LOINC 18842-5 Discharge Summary) with Composition, Patient,
   Practitioner, MedicationRequest, and CarePlan resources.
2. Ingestion: Ingests an incoming hospital EHR FHIR R4 Bundle directly into a
   structured recovery plan, bypassing document OCR when a structured hospital feed exists.
"""
from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from app.schemas.api import ApprovedPlan
from app.services.storage import store


def export_fhir_r4_bundle(run_id: str) -> dict[str, Any]:
    """Generates an HL7 FHIR R4 Document Bundle from an approved recovery plan."""
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise KeyError(f"No approved plan found for run {run_id}")

    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient_info = meta.get("patient") or {}

    patient_res_id = f"patient-{run_id}"
    practitioner_res_id = f"practitioner-{run_id}"
    composition_res_id = f"composition-{run_id}"

    patient_name = patient_info.get("name", "Patient")
    phone = patient_info.get("phone", "")
    approved_by = plan_dict.get("approved_by", "Attending Clinician")
    approved_at = plan_dict.get("approved_at", datetime.now(timezone.utc).isoformat())

    entries: list[dict[str, Any]] = []

    # 1. Composition Resource (Discharge Summary)
    composition = {
        "fullUrl": f"urn:uuid:{composition_res_id}",
        "resource": {
            "resourceType": "Composition",
            "id": composition_res_id,
            "status": "final",
            "type": {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "18842-5",
                        "display": "Discharge summary",
                    }
                ],
                "text": "Hospital Discharge Summary",
            },
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://snomed.info/sct",
                            "code": "373942005",
                            "display": "Discharge procedure",
                        }
                    ]
                }
            ],
            "subject": {"reference": f"urn:uuid:{patient_res_id}", "display": patient_name},
            "date": approved_at,
            "author": [{"reference": f"urn:uuid:{practitioner_res_id}", "display": approved_by}],
            "title": f"Discharge Recovery Plan - {patient_name}",
            "section": [],
        },
    }
    entries.append(composition)

    # 2. Patient Resource
    patient_resource = {
        "fullUrl": f"urn:uuid:{patient_res_id}",
        "resource": {
            "resourceType": "Patient",
            "id": patient_res_id,
            "name": [{"use": "official", "text": patient_name}],
            "telecom": [{"system": "phone", "value": phone, "use": "mobile"}] if phone else [],
            "language": [{"coding": [{"system": "urn:ietf:bcp:47", "code": patient_info.get("language", "en")}]}],
        },
    }
    abha_id = patient_info.get("abha_id") or meta.get("abha_id")
    if abha_id:
        patient_resource["resource"]["identifier"] = [
            {
                "system": "https://healthid.ndhm.gov.in",
                "type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0203", "code": "MR"}]},
                "value": abha_id,
            }
        ]
    entries.append(patient_resource)

    # 3. Practitioner Resource
    practitioner_resource = {
        "fullUrl": f"urn:uuid:{practitioner_res_id}",
        "resource": {
            "resourceType": "Practitioner",
            "id": practitioner_res_id,
            "name": [{"use": "official", "text": approved_by}],
        },
    }
    entries.append(practitioner_resource)

    # 4. MedicationRequest Resources
    items = plan_dict.get("items") or []
    med_entries = []
    med_sections = []

    for idx, it in enumerate(items):
        if it.get("category") == "medications":
            attrs = it.get("attrs") or {}
            med_id = f"med-req-{run_id}-{idx+1}"
            med_name = attrs.get("name", "Prescribed Medication")
            dose = attrs.get("dose", "")
            freq = attrs.get("frequency", "")
            instr = attrs.get("instructions", "")

            med_req = {
                "fullUrl": f"urn:uuid:{med_id}",
                "resource": {
                    "resourceType": "MedicationRequest",
                    "id": med_id,
                    "status": "active",
                    "intent": "order",
                    "medicationCodeableConcept": {"text": med_name},
                    "subject": {"reference": f"urn:uuid:{patient_res_id}"},
                    "dosageInstruction": [
                        {
                            "text": f"{med_name} {dose} {freq}. {instr}".strip(),
                            "timing": {"code": {"text": freq}} if freq else {},
                        }
                    ],
                },
            }
            entries.append(med_req)
            med_sections.append(f"{med_name} ({dose}) - {freq}")

    if med_sections:
        composition["resource"]["section"].append({
            "title": "Discharge Medications",
            "code": {"coding": [{"system": "http://loinc.org", "code": "10183-2", "display": "Hospital discharge medications"}]},
            "text": {"status": "generated", "div": f"<div>{' ; '.join(med_sections)}</div>"},
        })

    # 5. CarePlan Resource (Instructions, Warning Signs, Follow-up)
    careplan_id = f"careplan-{run_id}"
    careplan_activities = []
    for it in items:
        cat = it.get("category")
        attrs = it.get("attrs") or {}
        if cat in ("wound_care", "activity", "diet", "warning_signs", "follow_ups"):
            desc = attrs.get("instruction") or attrs.get("text") or attrs.get("what") or ""
            if desc:
                careplan_activities.append({
                    "detail": {
                        "category": {"text": cat},
                        "description": desc,
                        "status": "in-progress",
                    }
                })

    careplan_resource = {
        "fullUrl": f"urn:uuid:{careplan_id}",
        "resource": {
            "resourceType": "CarePlan",
            "id": careplan_id,
            "status": "active",
            "intent": "plan",
            "title": "Post-Discharge Recovery Care Plan",
            "subject": {"reference": f"urn:uuid:{patient_res_id}"},
            "activity": careplan_activities,
        },
    }
    entries.append(careplan_resource)

    # Wrap in FHIR Bundle
    bundle = {
        "resourceType": "Bundle",
        "id": f"bundle-discharge-{run_id}",
        "identifier": {"system": "https://recoverright.health/fhir/bundles", "value": f"bundle-{run_id}"},
        "type": "document",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total": len(entries),
        "entry": entries,
    }

    return bundle


def import_fhir_r4_bundle(bundle: dict[str, Any], auto_approve: bool = False) -> dict[str, Any]:
    """Ingests an external hospital FHIR R4 Bundle into RecoverRight structured format."""
    if bundle.get("resourceType") != "Bundle":
        raise ValueError("Invalid FHIR payload: resourceType must be 'Bundle'")

    run_id = f"run_fhir_{uuid.uuid4().hex[:8]}"
    patient_token = f"pat_{uuid.uuid4().hex[:12]}"

    patient_name = "EHR Patient"
    phone = ""
    language = "en"
    medications: list[dict] = []
    care_instructions: list[dict] = []
    follow_ups: list[dict] = []
    doctor_name = "Attending Physician"

    for entry in bundle.get("entry", []):
        res = entry.get("resource") or {}
        rtype = res.get("resourceType")

        if rtype == "Patient":
            names = res.get("name", [{}])
            if names:
                patient_name = names[0].get("text") or " ".join(names[0].get("given", []) + [names[0].get("family", "")])
            telecoms = res.get("telecom", [])
            for tel in telecoms:
                if tel.get("system") == "phone":
                    phone = tel.get("value", "")
                    break

        elif rtype == "Practitioner":
            names = res.get("name", [{}])
            if names:
                doctor_name = names[0].get("text", doctor_name)

        elif rtype == "MedicationRequest":
            med_concept = res.get("medicationCodeableConcept") or {}
            name = med_concept.get("text") or "Medication"
            dosages = res.get("dosageInstruction", [{}])
            timing_text = ""
            if dosages:
                timing_text = dosages[0].get("text") or (dosages[0].get("timing") or {}).get("code", {}).get("text", "")

            medications.append({
                "category": "medications",
                "field_id": f"fhir_med_{len(medications)+1}",
                "attrs": {
                    "name": name,
                    "dose": "",
                    "frequency": timing_text or "Daily",
                    "instructions": timing_text,
                },
                "status_at_review": "agreed",
                "decision": "confirmed",
                "decided_by": "EHR Import",
            })

        elif rtype == "CarePlan":
            for act in res.get("activity", []):
                det = act.get("detail", {})
                cat_text = (det.get("category") or {}).get("text", "activity")
                desc = det.get("description", "")
                if desc:
                    care_instructions.append({
                        "category": "wound_care" if "wound" in cat_text.lower() else "activity",
                        "field_id": f"fhir_care_{len(care_instructions)+1}",
                        "attrs": {"instruction": desc},
                        "status_at_review": "agreed",
                        "decision": "confirmed",
                        "decided_by": "EHR Import",
                    })

    # Add default follow-up if none
    follow_ups.append({
        "category": "follow_ups",
        "field_id": "fhir_fu_1",
        "attrs": {"what": "Discharge Follow-Up", "when": "In 7 days", "where": "Outpatient Clinic"},
        "status_at_review": "agreed",
        "decision": "confirmed",
        "decided_by": "EHR Import",
    })

    # Build plan items
    all_items = medications + care_instructions + follow_ups
    # Add contacts
    all_items.append({
        "category": "contacts",
        "field_id": "fhir_contact_1",
        "attrs": {"label": "Hospital Helpline", "value": "+91 98000 00000"},
        "status_at_review": "agreed",
        "decision": "confirmed",
        "decided_by": "EHR Import",
    })
    # Add warning sign
    all_items.append({
        "category": "warning_signs",
        "field_id": "fhir_ws_1",
        "attrs": {"text": "Call immediately if fever > 101 F or worsening pain"},
        "status_at_review": "agreed",
        "decision": "confirmed",
        "decided_by": "EHR Import",
    })

    now_iso = datetime.now(timezone.utc).isoformat()
    meta = {
        "run_id": run_id,
        "status": "approved",
        "filename": "ehr_export.fhir.json",
        "stored_name": "ehr_export.json",
        "created_at": now_iso,
        "patient_token": patient_token,
        "patient": {"name": patient_name, "language": language, "phone": phone, "patient_token": patient_token},
        "approved": True,
        "current_version": 1,
        "plan_versions": [1],
    }

    plan_doc = {
        "run_id": run_id,
        "version": 1,
        "approved_by": doctor_name,
        "approved_at": now_iso,
        "patient": meta["patient"],
        "items": all_items,
        "removed": [],
        "patient_token": patient_token,
        "plan_duration_days": 14,
    }

    # Save to storage
    store.dir(run_id).mkdir(parents=True, exist_ok=True)
    store.write(run_id, "meta.json", meta)
    store.save_plan_version(run_id, plan_doc, version=1)
    store.register_patient_token(patient_token, run_id)
    slug = store.generate_patient_slug(patient_name)
    store.register_patient_slug(slug, run_id)
    store.update_meta(run_id, patient_slug=slug)

    # Generate tasks
    from app.pipeline.tasks import generate_tasks_for_plan
    approved_obj = ApprovedPlan.model_validate(plan_doc)
    tasks = generate_tasks_for_plan(approved_obj)
    store.save_tasks(run_id, [t.model_dump(mode="json") for t in tasks])

    store.audit(run_id, "fhir_bridge", "fhir_bundle.imported",
                patient=patient_name, medications=len(medications))

    return {
        "run_id": run_id,
        "patient_name": patient_name,
        "patient_token": patient_token,
        "patient_slug": slug,
        "status": "imported_and_approved",
        "dashboard_url": f"/p/demo/{slug}",
        "total_medications": len(medications),
    }
