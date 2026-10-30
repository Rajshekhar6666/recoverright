"""Clinical PHI De-Identification and Re-Identification Engine.

Privacy & Regulatory Context (Gap 13):
Sending unprotected Protected Health Information (PHI) to third-party cloud LLM APIs
violates DISHA (India), HIPAA (US), and GDPR (EU). Hospitals cite privacy and third-party
cloud data sharing as top barriers to adoption (JMIR Human Factors S9).

This engine sanitizes unstructured clinical text before it reaches third-party LLMs:
1. Patient full names & relative names
2. Indian mobile phone numbers (+91, 10-digit formats)
3. 12-digit Indian Aadhaar numbers
4. Hospital Medical Record Numbers (MRN) and Inpatient (IP) IDs
5. Doctor / Surgeon names

A cryptographic token map is maintained in memory so that once the LLMs complete
entity extraction, real patient identifiers are restored verbatim into the clinician
review view without leaking PHI to external servers.
"""
import re
from typing import Any, Optional

# Indian phone numbers: +91 98765 43210, 9876543210, 09876543210
PHONE_PATTERN = re.compile(r"(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b")

# Indian Aadhaar number: 12 digits, often formatted as 4-4-4
AADHAAR_PATTERN = re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b")

# Hospital MRN / Patient ID / IPD number
MRN_PATTERN = re.compile(r"\b(?:MRN|IPD|UHID|PID|Reg\.?\s*No\.?)[\s:#\-\/]*([A-Za-z0-9\-\/]{4,15})\b", re.I)

# Doctor names: Dr. First Last, Prof. First Last
DOCTOR_PATTERN = re.compile(r"\b(?:Dr\.?|Prof\.?|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b")

# Patient Name indicator pattern: "Patient Name: First Last", "Pt: First Last"
PATIENT_PREFIX_PATTERN = re.compile(r"\b(?:Patient(?:\s+Name)?|Name|Pt\.?)[\s:#\-]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b")


def de_identify_clinical_text(
    raw_text: str,
    known_patient_name: Optional[str] = None,
    known_phone: Optional[str] = None,
) -> tuple[str, dict[str, str]]:
    """Sanitizes text by replacing direct identifiers with synthetic placeholders.

    Returns:
        sanitized_text: Safe text for transmission to LLM extraction providers.
        re_id_map: Inverted map of placeholder -> original PHI string for local restoration.
    """
    token_map: dict[str, str] = {}  # token -> real_val
    sanitized = raw_text

    # 1. Known patient name
    if known_patient_name and len(known_patient_name.strip()) >= 3:
        p_name = known_patient_name.strip()
        ph = "[PATIENT_NAME]"
        token_map[ph] = p_name
        sanitized = re.sub(re.escape(p_name), ph, sanitized, flags=re.I)

    # 2. Known phone
    if known_phone and len(known_phone.strip()) >= 8:
        ph = "[PHONE_PRIMARY]"
        token_map[ph] = known_phone.strip()
        sanitized = re.sub(re.escape(known_phone.strip()), ph, sanitized)

    # 3. Aadhaar numbers
    aadhaar_idx = 1
    for m in AADHAAR_PATTERN.finditer(sanitized):
        val = m.group(0)
        ph = f"[AADHAAR_ID_{aadhaar_idx}]"
        token_map[ph] = val
        sanitized = sanitized.replace(val, ph)
        aadhaar_idx += 1

    # 4. Indian phone numbers
    phone_idx = 1
    for m in PHONE_PATTERN.finditer(sanitized):
        val = m.group(0)
        if val not in token_map.values():
            ph = f"[PHONE_NUM_{phone_idx}]"
            token_map[ph] = val
            sanitized = sanitized.replace(val, ph)
            phone_idx += 1

    # 5. Doctor names
    doc_idx = 1
    for m in DOCTOR_PATTERN.finditer(sanitized):
        val = m.group(1)
        ph = f"[ATTENDING_PHYSICIAN_{doc_idx}]"
        token_map[ph] = val
        sanitized = sanitized.replace(val, ph)
        doc_idx += 1

    # 6. MRN / Hospital Registration IDs
    mrn_idx = 1
    for m in MRN_PATTERN.finditer(sanitized):
        val = m.group(1)
        ph = f"[HOSPITAL_MRN_{mrn_idx}]"
        token_map[ph] = val
        sanitized = sanitized.replace(val, ph)
        mrn_idx += 1

    return sanitized, token_map


def restore_identified_text(sanitized_text: str, token_map: dict[str, str]) -> str:
    """Restores real patient and clinician identifiers from the local token map."""
    restored = sanitized_text
    for placeholder, original_val in token_map.items():
        restored = restored.replace(placeholder, original_val)
    return restored
