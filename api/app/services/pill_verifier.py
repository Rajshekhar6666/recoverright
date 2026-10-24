"""AI Pill Camera Scanner and Prescription Cross-Reference Engine.

Uses visual text extraction and clinical heuristics to verify medication strips/bottles
against a patient's approved discharge prescription, flagging unprescribed drugs or dosage mismatches.
"""
import base64
import io
import re
from typing import Any, Dict, List, Optional
from rapidfuzz import fuzz

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import pytesseract
except ImportError:
    pytesseract = None


# Known clinical warning database for post-op safety
UNPRESCRIBED_WARNINGS = {
    "ibuprofen": {
        "en": "SAFETY ALERT: Ibuprofen is an NSAID not prescribed in your discharge plan. NSAIDs can increase bleeding risk and stomach irritation post-surgery. Do NOT take this medication without consulting your doctor.",
        "hi": "सुरक्षा चेतावनी: Ibuprofen आपके डिस्चार्ज प्लान में शामिल नहीं है। सर्जरी के बाद यह दवा रक्तस्राव और पेट में जलन का जोखिम बढ़ा सकती है। कृपया डॉक्टर की सलाह के बिना इसे न लें।",
        "risk": "high_risk"
    },
    "aspirin": {
        "en": "SAFETY ALERT: Aspirin is a blood thinner not prescribed in your recovery plan. Taking it could increase post-surgical bleeding risk.",
        "hi": "सुरक्षा चेतावनी: एस्पिरिन रक्त को पतला करती है और आपके प्लान में नहीं है। इसे लेने से ब्लीडिंग का खतरा बढ़ सकता है।",
        "risk": "high_risk"
    },
    "diclofenac": {
        "en": "SAFETY ALERT: Diclofenac is a strong NSAID pain reliever not approved in your discharge plan. Please avoid taking it.",
        "hi": "सुरक्षा चेतावनी: Diclofenac आपके स्वीकृत प्लान में शामिल नहीं है। कृपया इसे न लें।",
        "risk": "high_risk"
    }
}

SAMPLE_PRESETS = {
    "paracetamol_500": {
        "detected_text": "PARACETAMOL TABLETS IP 500 mg\nBatch: B9281 Expiry: 08/2027\nDosage: As directed by physician",
        "medicine_name": "Paracetamol",
        "dosage": "500 mg",
    },
    "amoxicillin_625": {
        "detected_text": "AMOXICILLIN AND POTASSIUM CLAVULANATE TABLETS IP 625 mg\nAmoxicillin 500mg + Clavulanic Acid 125mg",
        "medicine_name": "Amoxicillin-Clavulanate",
        "dosage": "625 mg",
    },
    "pantoprazole_40": {
        "detected_text": "PANTOPRAZOLE GASTRO-RESISTANT TABLETS IP 40 mg\nTake 30 minutes before breakfast",
        "medicine_name": "Pantoprazole",
        "dosage": "40 mg",
    },
    "ibuprofen_400": {
        "detected_text": "IBUPROFEN TABLETS IP 400 mg\nWarning: Consult doctor before use if post-operative",
        "medicine_name": "Ibuprofen",
        "dosage": "400 mg",
    },
}


def _extract_text_from_base64_image(image_b64: str) -> str:
    """Safely extracts text using pytesseract if available, or returns empty string."""
    if not pytesseract or not Image:
        return ""
    try:
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        raw_bytes = base64.b64decode(image_b64)
        img = Image.open(io.BytesIO(raw_bytes))
        # Optional image enhancement for OCR
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception:
        return ""


def _parse_med_and_dose(text: str) -> tuple[str, str]:
    """Extracts medication name and dosage from text using regex heuristics."""
    clean = text.replace("\n", " ").strip()
    
    # Check known sample keywords
    lower = clean.lower()
    detected_name = ""
    detected_dose = ""
    
    known_meds = [
        ("amoxicillin-clavulanate", "Amoxicillin-Clavulanate"),
        ("amoxicillin", "Amoxicillin"),
        ("clavulanate", "Amoxicillin-Clavulanate"),
        ("paracetamol", "Paracetamol"),
        ("acetaminophen", "Paracetamol"),
        ("pantoprazole", "Pantoprazole"),
        ("pantocid", "Pantoprazole"),
        ("pan-40", "Pantoprazole"),
        ("ibuprofen", "Ibuprofen"),
        ("brufen", "Ibuprofen"),
        ("combiflam", "Ibuprofen + Paracetamol"),
        ("aspirin", "Aspirin"),
        ("diclofenac", "Diclofenac"),
        ("metformin", "Metformin"),
        ("atorvastatin", "Atorvastatin"),
        ("omeprazole", "Omeprazole"),
        ("ciprofloxacin", "Ciprofloxacin"),
        ("azithromycin", "Azithromycin"),
    ]
    
    for needle, proper in known_meds:
        if needle in lower:
            detected_name = proper
            break
            
    # Extract dosage: e.g. 500 mg, 625mg, 40 mg, 10mg
    dose_match = re.search(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b", clean, re.IGNORECASE)
    if dose_match:
        detected_dose = f"{dose_match.group(1)} {dose_match.group(2).lower()}"
        
    return detected_name, detected_dose


def verify_scanned_pill(
    prescribed_items: List[Dict[str, Any]],
    raw_text: str = "",
    sample_id: str = "",
    image_data: Optional[str] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """Cross-references a scanned pill or sample strip with the patient's prescribed medication list."""
    detected_name = ""
    detected_dose = ""
    ocr_text = raw_text or ""

    # 1. Preset sample lookup for infallible demo reliability
    if sample_id and sample_id in SAMPLE_PRESETS:
        preset = SAMPLE_PRESETS[sample_id]
        detected_name = preset["medicine_name"]
        detected_dose = preset["dosage"]
        ocr_text = preset["detected_text"]
    elif image_data:
        # Try extracting text via OCR if an image was uploaded/captured
        extracted = _extract_text_from_base64_image(image_data)
        if extracted:
            ocr_text = extracted
        parsed_name, parsed_dose = _parse_med_and_dose(ocr_text or raw_text)
        detected_name = parsed_name or detected_name
        detected_dose = parsed_dose or detected_dose
    elif raw_text:
        parsed_name, parsed_dose = _parse_med_and_dose(raw_text)
        detected_name = parsed_name or detected_name
        detected_dose = parsed_dose or detected_dose

    if not detected_name:
        # Fallback if no medicine name recognized
        return {
            "verified": False,
            "status": "UNRECOGNIZED",
            "detected_name": "Unidentified Medication",
            "detected_dose": detected_dose or "Unknown",
            "raw_text": ocr_text,
            "confidence": 0.0,
            "safety_alert": "The scanner could not clearly read the medicine label. Please hold the strip steady under good light or select a sample.",
            "safety_alert_hi": "दवा का लेबल स्पष्ट रूप से नहीं पढ़ा जा सका। कृपया रोशनी में स्थिर रखें या फिर से प्रयास करें।",
            "spoken_summary_en": "Medicine label could not be recognized. Please try again with better lighting.",
            "spoken_summary_hi": "दवा का नाम स्पष्ट नहीं हो सका। कृपया अच्छी रोशनी में फिर से स्कैन करें।",
            "matched_medication": None,
        }

    # 2. Check for high-risk unprescribed drugs
    lower_detected = detected_name.lower()
    for warning_key, warning_info in UNPRESCRIBED_WARNINGS.items():
        if warning_key in lower_detected:
            return {
                "verified": False,
                "status": "SAFETY_WARNING",
                "detected_name": detected_name,
                "detected_dose": detected_dose or "Standard dose",
                "raw_text": ocr_text,
                "confidence": 0.96,
                "safety_alert": warning_info["en"],
                "safety_alert_hi": warning_info["hi"],
                "warning_level": warning_info["risk"],
                "spoken_summary_en": f"Warning! {detected_name} is not on your prescription. Do not take this medication.",
                "spoken_summary_hi": f"चेतावनी! {detected_name} आपके डॉक्टर द्वारा नहीं लिखी गई है। कृपया यह दवा न लें।",
                "matched_medication": None,
            }

    # 3. Match against prescribed medications in the recovery plan
    best_match = None
    best_score = 0

    for item in prescribed_items:
        attrs = item.get("attrs") or {}
        prescribed_name = (attrs.get("name") or "").strip()
        prescribed_dose = (attrs.get("dose") or "").strip()
        
        # Fuzzy match score between detected name and prescribed name
        score = fuzz.token_sort_ratio(detected_name.lower(), prescribed_name.lower())
        
        # Also check partial match for combination drugs e.g. "Amoxicillin-Clavulanate" vs "Amoxicillin"
        if detected_name.lower() in prescribed_name.lower() or prescribed_name.lower() in detected_name.lower():
            score = max(score, 88)
            
        if score > best_score:
            best_score = score
            best_match = {
                "id": item.get("field_id") or item.get("id"),
                "name": prescribed_name,
                "dose": prescribed_dose,
                "frequency": attrs.get("frequency") or "As directed",
                "instructions": attrs.get("instructions") or attrs.get("instruction") or "Take with water",
                "times": attrs.get("times") or [],
            }

    # Match threshold
    if best_match and best_score >= 70:
        # Check dose match if dose was detected
        dose_mismatch = False
        if detected_dose and best_match["dose"]:
            d1 = re.sub(r"[^\d]", "", detected_dose)
            d2 = re.sub(r"[^\d]", "", best_match["dose"])
            if d1 and d2 and d1 != d2:
                dose_mismatch = True

        if dose_mismatch:
            return {
                "verified": False,
                "status": "DOSAGE_MISMATCH",
                "detected_name": detected_name,
                "detected_dose": detected_dose,
                "raw_text": ocr_text,
                "confidence": round(best_score / 100.0, 2),
                "safety_alert": f"Medication matches {best_match['name']}, but detected strength ({detected_dose}) does not match prescribed strength ({best_match['dose']}). Please verify with your doctor or pharmacist.",
                "safety_alert_hi": f"दवा {best_match['name']} से मेल खाती है, लेकिन मात्रा ({detected_dose}) डॉक्टर द्वारा लिखी गई मात्रा ({best_match['dose']}) से अलग है। कृपया जांच करें।",
                "spoken_summary_en": f"Attention. Dose mismatch. Your prescription is for {best_match['name']} {best_match['dose']}, but {detected_dose} was detected.",
                "spoken_summary_hi": f"सावधानी। खुराक में अंतर है। आपके प्लान में {best_match['name']} {best_match['dose']} लिखी है।",
                "matched_medication": best_match,
            }

        # Perfect Verified Match!
        freq = best_match["frequency"]
        inst = best_match["instructions"]
        spoken_en = f"Verified: {best_match['name']} {best_match['dose'] or ''}. It is on your active recovery plan. {inst}."
        spoken_hi = f"सत्यापित: {best_match['name']} {best_match['dose'] or ''} आपके प्लान में शामिल है। {inst}।"

        return {
            "verified": True,
            "status": "VERIFIED_MATCH",
            "detected_name": detected_name,
            "detected_dose": detected_dose or best_match["dose"],
            "raw_text": ocr_text,
            "confidence": round(best_score / 100.0, 2),
            "safety_alert": None,
            "safety_alert_hi": None,
            "spoken_summary_en": spoken_en,
            "spoken_summary_hi": spoken_hi,
            "matched_medication": best_match,
        }

    # Not found in prescription
    return {
        "verified": False,
        "status": "SAFETY_WARNING",
        "detected_name": detected_name,
        "detected_dose": detected_dose or "Unknown",
        "raw_text": ocr_text,
        "confidence": 0.85,
        "safety_alert": f"'{detected_name}' is not listed in your approved discharge prescription. Do not take medications that were not prescribed by your care team.",
        "safety_alert_hi": f"'{detected_name}' आपके डिस्चार्ज पर्चे में नहीं है। बिना डॉक्टर के परामर्श के यह दवा न लें।",
        "spoken_summary_en": f"Warning! {detected_name} is not on your prescription plan.",
        "spoken_summary_hi": f"चेतावनी! {detected_name} आपके डॉक्टर के पर्चे में नहीं है।",
        "matched_medication": None,
    }
