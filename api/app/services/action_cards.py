"""'What to Do, Who to Call' Emergency Action Card Generator (Gap 10).

Clinical Evidence (Okrainec et al. 2019 CMAJ Open S6):
Patients report feeling rushed out of hospital beds without written, actionable instructions.
Raw medical terms ("erythema", "dehiscence", "pyrexia") induce anxiety without providing
concrete guidance on what first aid to perform and whom to call.

This service parses each warning sign from the approved plan and generates a
plain-language Action Card with:
1. What you might notice (plain language symptom)
2. What to do right now (immediate home step)
3. Who to call (exact contact number and desk)
4. When to go straight to the nearest Emergency Room
"""
from typing import Any

from app.schemas.api import ApprovedPlan


def generate_action_cards(plan: ApprovedPlan, lang: str = "en") -> list[dict[str, Any]]:
    """Transforms approved plan warning signs and contacts into actionable emergency cards."""
    # Find emergency contact
    contact_phone = "+91 00000 00000"
    contact_label = "Hospital Emergency Desk"
    for item in plan.items:
        if item.category == "contacts" and item.attrs:
            val = item.attrs.get("value")
            if val:
                contact_phone = val
                contact_label = item.attrs.get("label") or "Care Team"
                break

    cards = []
    warning_items = [i for i in plan.items if i.category == "warning_signs" and i.attrs]

    for idx, item in enumerate(warning_items):
        raw_text = item.attrs.get("text") or item.attrs.get("instruction") or "Unusual symptom"
        lower = raw_text.lower()

        # Clinical triage categorization
        if any(w in lower for w in ("fever", "temperature", "chills", "बुखार")):
            category = "fever_infection"
            if lang == "hi":
                symptom = f"तेज बुखार या कंपकंपी ({raw_text})"
                first_step = "आराम करें, पानी पिएं। बिना डॉक्टर की सलाह के कोई अन्य दवा न लें।"
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "यदि बुखार 102°F से ऊपर जाए या भ्रम/गंभीर चक्कर आए तो सीधे आपातकालीन विभाग जाएं।"
            else:
                symptom = f"High fever or shaking chills ({raw_text})"
                first_step = "Rest, drink plenty of fluids, and check your temperature. Do not take unprescribed NSAIDs."
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "If temperature exceeds 102°F or you feel confusion, proceed immediately to the Emergency Room."
        elif any(w in lower for w in ("breath", "chest", "breathless", "सांस", "सीने")):
            category = "respiratory_cardiac"
            if lang == "hi":
                symptom = f"सांस लेने में कठिनाई या सीने में दर्द ({raw_text})"
                first_step = "तुरंत बैठ जाएं। शांत रहें और झुक कर गहरी सांस लें।"
                who_to_call = f"आपातकालीन सहायता: 108 या {contact_phone}"
                red_line = "यदि सांस फूलना या सीने में दबाव 5 मिनट से अधिक रहे तो तुरंत एम्बुलेंस बुलाएं।"
            else:
                symptom = f"Shortness of breath or chest discomfort ({raw_text})"
                first_step = "Sit upright immediately. Stop all physical exertion and breathe slowly."
                who_to_call = f"Emergency Hotline: 108 or {contact_phone}"
                red_line = "If chest pain or severe breathlessness persists beyond 5 minutes, call an ambulance immediately."
        elif any(w in lower for w in ("redness", "drainage", "pus", "swelling", "wound", "घाव")):
            category = "wound_complication"
            if lang == "hi":
                symptom = f"टांकों के पास लालिमा, मवाद या सूजन ({raw_text})"
                first_step = "घाव को सूखा रखें। बिना सलाह कोई मलहम या पाउडर न लगाएं।"
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "यदि घाव से लगातार खून बहे या तेज बदबूदार स्राव हो तो तुरंत अस्पताल आएं।"
            else:
                symptom = f"Wound redness, drainage, or opening ({raw_text})"
                first_step = "Keep the surgical site clean and dry. Do not apply creams or wash with tap water."
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "If active bleeding does not stop with gentle pressure, proceed immediately to clinic/ER."
        else:
            category = "general_recovery"
            if lang == "hi":
                symptom = raw_text
                first_step = "आराम करें और अपने लक्षणों को नोट करें।"
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "लक्षण तेजी से बिगड़ने पर तत्काल अस्पताल संपर्क करें।"
            else:
                symptom = raw_text
                first_step = "Rest, stay hydrated, and note what time the symptom began."
                who_to_call = f"{contact_label}: {contact_phone}"
                red_line = "If symptoms worsen rapidly or feel unbearable, contact the hospital without waiting."

        cards.append({
            "card_id": f"card_{item.field_id}_{idx+1}",
            "category": category,
            "raw_warning_sign": raw_text,
            "what_you_notice": symptom,
            "what_to_do_first": first_step,
            "who_to_call": who_to_call,
            "contact_phone": contact_phone,
            "when_to_go_to_er": red_line,
        })

    return cards
