"""Printable Large-Print Discharge Plan with QR Code (Frugal Channel).

Clinical & Demographic Evidence (DAHLIA Study, Rasekaba et al. 2022 S12):
In rural Indian populations of older adults, digital literacy is ~11% and smartphone
ownership is limited. Relying exclusively on mobile applications excludes the
highest-risk geriatric patients.

This service generates a structured, high-contrast, large-print printable view
designed for physical bedside printing at discharge. It features:
1. High-contrast typography with clear icon badges (Morning Sun / Evening Moon)
2. Simplified schedule times in Hindi and English
3. Bold Emergency Warning Signs & Helpline numbers
4. Patient Companion & Caregiver Portal URL
"""
from typing import Any

from app.schemas.api import ApprovedPlan
from app.services.storage import store


def generate_printable_plan_data(run_id: str) -> dict[str, Any]:
    """Compiles a high-contrast, large-print patient document structure."""
    plan_dict = store.get_plan_version(run_id)
    if not plan_dict:
        raise KeyError(f"Plan not found for run {run_id}")

    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient = meta.get("patient") or {}
    slug = meta.get("patient_slug") or "demo"

    # Extract medications with timing symbols
    med_items = [i for i in plan_dict.get("items", []) if i.get("category") == "medications"]
    printable_meds = []
    for it in med_items:
        attrs = it.get("attrs") or {}
        name = attrs.get("name", "Medication")
        dose = attrs.get("dose", "")
        freq = attrs.get("frequency", "")
        times = attrs.get("confirmed_times") or "As directed by nurse"
        instr = attrs.get("instructions") or "Take with water after meals"

        # Symbol mapping
        icons = []
        lower_t = times.lower()
        if "am" in lower_t or "morning" in freq.lower():
            icons.append("MORNING_SUN (सुबह)")
        if "pm" in lower_t or "night" in freq.lower() or "evening" in freq.lower():
            icons.append("NIGHT_MOON (रात)")

        printable_meds.append({
            "name": name,
            "dose": dose,
            "frequency": freq,
            "times": times,
            "instructions": instr,
            "timing_symbols": icons or ["CLOCK (समय)"],
        })

    # Warning signs
    warning_signs = [
        (i.get("attrs") or {}).get("text") or (i.get("attrs") or {}).get("instruction")
        for i in plan_dict.get("items", [])
        if i.get("category") == "warning_signs"
    ]

    # Contacts
    contacts = [
        (i.get("attrs") or {}).get("value")
        for i in plan_dict.get("items", [])
        if i.get("category") == "contacts" and (i.get("attrs") or {}).get("value")
    ]
    emergency_phone = contacts[0] if contacts else "+91 00000 00000"

    # Follow-ups
    follow_ups = [
        f"{(i.get('attrs') or {}).get('what', 'Review')}: {(i.get('attrs') or {}).get('when', 'In 1 week')} at {(i.get('attrs') or {}).get('where', 'Hospital Outpatient')}"
        for i in plan_dict.get("items", [])
        if i.get("category") == "follow_ups"
    ]

    return {
        "run_id": run_id,
        "format": "LARGE_PRINT_HIGH_CONTRAST",
        "typography_point_size": "18pt",
        "patient": {
            "name": patient.get("name", "Patient"),
            "phone": patient.get("phone", ""),
            "language": patient.get("language", "en"),
        },
        "discharge_date": (plan_dict.get("approved_at") or "")[:10],
        "approved_by": plan_dict.get("approved_by", "Hospital Care Team"),
        "digital_companion_url": f"https://recoverright.health/p/{slug}",
        "caregiver_portal_url": f"https://recoverright.health/p/{slug}/guardian",
        "emergency_helpline": emergency_phone,
        "medications_schedule": printable_meds,
        "emergency_warning_signs": warning_signs,
        "scheduled_appointments": follow_ups,
    }
