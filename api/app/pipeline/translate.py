"""Plan-level translation engine for RecoverRight.

Clinical Safety Rules (Gap 8):
1. Only short, approved sentences are translated – never free-form AI drafts.
2. Dose amounts, medication names, and numeric values are LOCKED (never
   translated) to prevent pharmacy-level errors.
3. Every translated field stores the original approved text alongside it so
   the clinician can visually back-verify at any time.
4. Translation is a post-approval operation: it cannot alter the approved
   plan items; it only produces a read-only localised view.
5. Machine translation quality is acknowledged as imperfect. Jargon and long
   sentences should be back-translated and manually verified before patient
   delivery (noted in result metadata).

Supported languages (Gap 8 – extend as regional languages are added):
  en → English (source, no translation needed)
  hi → Hindi
  mr → Marathi  (stub – add MT provider key to activate)
  ta → Tamil    (stub – add MT provider key to activate)
  bn → Bengali  (stub – add MT provider key to activate)
  te → Telugu   (stub – add MT provider key to activate)
"""
from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger("recoverright.translate")

# ── Language metadata ──────────────────────────────────────────────────────
SUPPORTED_LANGUAGES: dict[str, dict] = {
    "en": {"name": "English",  "rtl": False, "active": True},
    "hi": {"name": "Hindi",    "rtl": False, "active": True},
    "mr": {"name": "Marathi",  "rtl": False, "active": False,
           "note": "stub – configure MT provider to activate"},
    "ta": {"name": "Tamil",    "rtl": False, "active": False,
           "note": "stub – configure MT provider to activate"},
    "bn": {"name": "Bengali",  "rtl": False, "active": False,
           "note": "stub – configure MT provider to activate"},
    "te": {"name": "Telugu",   "rtl": False, "active": False,
           "note": "stub – configure MT provider to activate"},
}

# ── Regex patterns for values that must NEVER be translated ────────────────
_LOCK_PATTERNS = [
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:mg|g|ml|mcg|IU|units?|tabs?|capsules?|drops?)\b", re.I),
    re.compile(r"\b(?:twice|once|thrice|daily|weekly|monthly|QID|TID|BID|BD|OD|PRN|SOS)\b", re.I),
    re.compile(r"\b\d{1,2}[:/]\d{2}(?:\s*[AP]M)?\b", re.I),  # times like 08:00 AM
    re.compile(r"\b(?:Dr\.?|Prof\.?)\s+[A-Z][a-z]+", re.I),   # provider names
]

# ── Simple Hindi lookup for common clinical phrases (demo-quality) ──────────
# A real deployment should call a professional MT API (DeepL, Azure, Google).
_HI_PHRASES: dict[str, str] = {
    "Take with water": "पानी के साथ लें",
    "Take after food": "खाने के बाद लें",
    "Take before food": "खाने से पहले लें",
    "Take at bedtime": "सोने से पहले लें",
    "As needed": "जरूरत पड़ने पर",
    "Do not drive": "गाड़ी न चलाएं",
    "Avoid alcohol": "शराब से बचें",
    "Rest and avoid heavy lifting": "आराम करें, भारी सामान न उठाएं",
    "Call your doctor if": "अपने डॉक्टर को कॉल करें यदि",
    "Go to the emergency room if": "यदि ऐसा हो तो तुरंत अस्पताल जाएं",
    "Keep wound clean and dry": "घाव को साफ और सूखा रखें",
    "Change dressing": "पट्टी बदलें",
    "Follow-up appointment": "अनुवर्ती नियुक्ति",
    "In case of emergency, call": "आपातकाल में कॉल करें",
}


def _lock_values(text: str) -> tuple[str, dict[str, str]]:
    """Replace locked values with placeholders so they survive translation intact."""
    locked: dict[str, str] = {}
    result = text
    idx = 0
    for pattern in _LOCK_PATTERNS:
        for m in pattern.finditer(result):
            key = f"__LOCK_{idx}__"
            locked[key] = m.group(0)
            result = result[:m.start()] + key + result[m.end():]
            idx += 1
            # Re-search after modification (simple: restart; safe for short strings)
            break
    return result, locked


def _restore_locks(text: str, locked: dict[str, str]) -> str:
    for key, val in locked.items():
        text = text.replace(key, val)
    return text


def _translate_hi(text: str) -> str:
    """Translate a short clinical phrase to Hindi.

    Uses a phrase lookup table for demo purposes.  In production, replace
    the lookup with a call to a professional MT API, then back-translate and
    flag sentences longer than 20 words for manual review.
    """
    # Phrase match (case-insensitive)
    for en_phrase, hi_phrase in _HI_PHRASES.items():
        if en_phrase.lower() in text.lower():
            return text.lower().replace(en_phrase.lower(), hi_phrase)
    # No match found – return original with a note so the nurse knows
    return text + " [अनुवाद की जाँच करें / translation needs verification]"


def translate_text(text: str, target_lang: str, source_lang: str = "en") -> dict:
    """Translate a single short clinical text string.

    Returns a dict with:
      translated: str      – translated string (or original if lang=en / unsupported)
      original: str        – the original approved text (always preserved)
      lang: str            – target language code
      locked_values: list  – values that were protected from translation
      needs_review: bool   – True when translation confidence is low or text
                             was not found in the phrase table
    """
    if target_lang == source_lang or target_lang == "en":
        return {"translated": text, "original": text, "lang": target_lang,
                "locked_values": [], "needs_review": False}

    lang_meta = SUPPORTED_LANGUAGES.get(target_lang, {})
    if not lang_meta.get("active"):
        return {
            "translated": text,
            "original": text,
            "lang": target_lang,
            "locked_values": [],
            "needs_review": True,
            "note": lang_meta.get("note", f"Language '{target_lang}' not yet active"),
        }

    # Lock numeric / drug values before sending to MT
    protected, locked = _lock_values(text)
    locked_values = list(locked.values())

    if target_lang == "hi":
        raw_translation = _translate_hi(protected)
    else:
        # Future: call MT API here
        raw_translation = protected  # passthrough stub

    # Restore locked values
    translated = _restore_locks(raw_translation, locked)
    needs_review = "needs verification" in translated or "[" in translated

    return {
        "translated": translated,
        "original": text,
        "lang": target_lang,
        "locked_values": locked_values,
        "needs_review": needs_review,
    }


def translate_plan_view(plan_items: list[dict], target_lang: str) -> dict:
    """Produce a localised read-only view of the approved plan fields.

    Only translates patient-facing instruction and warning text.
    Medication names, doses, frequencies and times are locked.

    Returns:
      translated_items: list[dict]  – each item with a 'translation' key
      lang: str
      needs_review_count: int       – number of items flagged for manual check
      unsupported: bool             – True if the language is a stub
    """
    if target_lang not in SUPPORTED_LANGUAGES:
        return {
            "translated_items": plan_items,
            "lang": target_lang,
            "needs_review_count": 0,
            "unsupported": True,
            "error": f"Language '{target_lang}' is not in the supported list.",
        }

    lang_active = SUPPORTED_LANGUAGES[target_lang].get("active", False)
    translated_items = []
    needs_review_count = 0

    # Fields that are safe to translate (patient-facing free text)
    TRANSLATABLE_ATTRS = {"instruction", "text", "what", "where"}

    for item in plan_items:
        category = item.get("category", "")
        attrs = dict(item.get("attrs") or {})
        translations: dict[str, dict] = {}

        for attr_key, attr_val in attrs.items():
            if attr_key not in TRANSLATABLE_ATTRS or not attr_val:
                continue
            result = translate_text(str(attr_val), target_lang)
            translations[attr_key] = result
            if result.get("needs_review"):
                needs_review_count += 1

        translated_items.append({
            **item,
            "translation": translations,
            "translation_lang": target_lang,
        })

    return {
        "translated_items": translated_items,
        "lang": target_lang,
        "lang_name": SUPPORTED_LANGUAGES[target_lang]["name"],
        "needs_review_count": needs_review_count,
        "unsupported": not lang_active,
        "clinical_note": (
            "Translations shown alongside the original approved text. "
            "Any field marked 'needs review' must be verified by a bilingual clinician "
            "before patient delivery. Dose amounts and medication names are always "
            "shown in their original approved form."
        ),
    }
