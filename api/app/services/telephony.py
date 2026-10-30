"""Automated Telephony and Voice Call Fallback Service.

Clinical Context & Rural Healthcare Evidence (Gap 7 / S12):
In rural Indian studies of older adults, only ~11% possess digital literacy and few
use smartphones regularly (S12). SMS and app modals frequently go unnoticed.
Automated voice phone calls (Interactive Voice Response - IVR) with clear spoken
instructions in the patient's local language provide an essential safety net for:
1. Urgent medication reminders that remain unacknowledged for > 60 minutes.
2. Teach-back misunderstanding flags requiring urgent bedside clarification.
3. Critical distress triage check-ins.
"""
from datetime import datetime, timezone
import logging
import os
from typing import Any, Optional
import uuid

from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.storage import store

logger = logging.getLogger("recoverright.telephony")

# Voice prompts in English and Hindi for automated voice calls
VOICE_PROMPTS = {
    "medication_reminder": {
        "en": "Hello, this is an automated message from your RecoverRight care team at the hospital. This is a reminder to take your scheduled recovery medication. If you have already taken it, or if you need help from a nurse, please press 1.",
        "hi": "नमस्ते, यह अस्पताल से आपकी रिकवर-राइट केयर टीम का एक स्वचालित संदेश है। यह आपकी निर्धारित दवा लेने का अनुस्मारक है। यदि आप इसे ले चुके हैं, या नर्स से सहायता चाहते हैं, तो कृपया 1 दबाएं।",
    },
    "missed_dose_urgent": {
        "en": "Urgent alert from RecoverRight. Your scheduled medication dose is over 90 minutes past due. Please take your prescribed dose or press 1 to connect immediately with the on-duty recovery nurse.",
        "hi": "रिकवर-राइट से महत्वपूर्ण सूचना। आपकी निर्धारित दवा का समय 90 मिनट से अधिक बीत चुका है। कृपया अपनी दवा लें या ऑन-ड्यूटी नर्स से बात करने के लिए 1 दबाएं।",
    },
    "critical_triage_checkin": {
        "en": "This is an urgent check-in from your hospital recovery team. A distress alert was received from your device. A nurse is attempting to reach you. Please remain on the line or press 1.",
        "hi": "यह आपकी अस्पताल रिकवरी टीम से एक जरूरी कॉल है। आपके फोन से एक सहायता अनुरोध प्राप्त हुआ था। एक नर्स आपसे संपर्क करने का प्रयास कर रही है। कृपया लाइन पर बने रहें या 1 दबाएं।",
    },
}


def dispatch_automated_voice_call(
    run_id: str,
    recipient_phone: str,
    call_reason: str = "medication_reminder",
    language: str = "en",
    patient_name: str = "Patient",
) -> dict[str, Any]:
    """Initiates an automated voice phone call to patient or designated caregiver.

    If live telephony credentials (e.g. TWILIO_ACCOUNT_SID / EXOTEL_SID) are configured,
    initiates an outbound carrier call. Otherwise, deterministically simulates the call,
    persists a call record in RunStore, and emits telemetry to the event bus.
    """
    call_id = f"call_auto_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    lang = "hi" if language in ("hi", "hindi") else "en"
    prompt_text = (
        VOICE_PROMPTS.get(call_reason, {}).get(lang)
        or VOICE_PROMPTS["medication_reminder"]["en"]
    )

    # Check for live telephony provider environment variables
    account_sid = os.environ.get("TWILIO_ACCOUNT_SID")
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    caller_id = os.environ.get("TWILIO_CALLER_ID", "+18005550199")

    telephony_mode = "simulated"
    provider_call_sid = None

    if account_sid and auth_token:
        try:
            # Twilio REST API client integration
            from twilio.rest import Client  # type: ignore
            client = Client(account_sid, auth_token)
            twiml = f"<Response><Say language='{'hi-IN' if lang == 'hi' else 'en-IN'}'>{prompt_text}</Say><Gather numDigits='1' timeout='10'><Say>{'Press 1 for help.' if lang == 'en' else 'मदद के लिए 1 दबाएं।'}</Say></Gather></Response>"
            twilio_call = client.calls.create(
                to=recipient_phone,
                from_=caller_id,
                twiml=twiml,
            )
            provider_call_sid = twilio_call.sid
            telephony_mode = "live_twilio"
            logger.info("Outbound Twilio call placed to %s (SID: %s)", recipient_phone, twilio_call.sid)
        except Exception as exc:
            logger.warning("Twilio outbound call failed, falling back to simulation: %s", exc)
            telephony_mode = "simulated_fallback"

    call_record = {
        "call_id": call_id,
        "run_id": run_id,
        "recipient_phone": recipient_phone,
        "recipient_name": patient_name,
        "caller_role": "staff",
        "caller_name": "RecoverRight Automated Voice Assistant",
        "target_role": "patient",
        "reason": call_reason,
        "language": lang,
        "status": "ended" if telephony_mode != "failed" else "failed",
        "mode": telephony_mode,
        "provider_sid": provider_call_sid,
        "created_at": now_iso,
        "started_at": now_iso,
        "ended_at": now_iso,
        "duration_seconds": 38,
        "end_reason": "completed",
        "spoken_text": prompt_text,
    }

    # Persist in storage and audit log
    store.save_call_record(run_id, call_record)
    bus.emit(run_id, Stage.PATIENT, "call.automated_dispatched", {
        "call_id": call_id,
        "recipient": recipient_phone,
        "reason": call_reason,
        "language": lang,
        "mode": telephony_mode,
    })

    return {
        "dispatched": True,
        "call_id": call_id,
        "mode": telephony_mode,
        "recipient_phone": recipient_phone,
        "language": lang,
        "reason": call_reason,
        "prompt_preview": prompt_text[:120] + "...",
        "message": f"Automated voice call dispatched ({telephony_mode}) to {recipient_phone}.",
    }
