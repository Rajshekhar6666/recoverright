"""Inbound webhook handlers for Twilio SMS/Voice and Meta WhatsApp callbacks.

Clinical context & Delivery Accountability:
Receives real-time delivery status reports and patient replies from external communication
gateways (Meta WhatsApp Cloud API, Twilio SMS/IVR). Automatically updates medication
acknowledgement state, creates emergency help requests, and logs all events to the clinical audit trail.
"""
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Form, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse

from app.schemas.events import Stage
from app.services.event_bus import bus
from app.services.help_store import help_store
from app.services.reminder import acknowledge_reminder, snooze_reminder
from app.services.storage import store

logger = logging.getLogger("recoverright.webhooks")
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "recoverright_verify_token")


# ── WhatsApp Webhooks ────────────────────────────────────────────────────────

@router.get("/whatsapp")
def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
):
    """Meta WhatsApp Cloud API Webhook Verification."""
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        logger.info("WhatsApp webhook verified successfully.")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/whatsapp")
async def handle_whatsapp_inbound(request: Request):
    """Processes inbound WhatsApp delivery statuses and patient response messages."""
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        return {"status": "ignored", "reason": "invalid_json"}

    # Safely unpack Meta webhook entries
    entries = body.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            
            # Handle delivery status updates
            statuses = value.get("statuses", [])
            for st in statuses:
                recipient_id = st.get("recipient_id")
                status = st.get("status")
                msg_id = st.get("id")
                logger.info("WhatsApp delivery update: msg=%s recipient=%s status=%s", msg_id, recipient_id, status)

            # Handle incoming patient messages
            messages = value.get("messages", [])
            for msg in messages:
                from_num = msg.get("from", "")
                msg_type = msg.get("type", "")
                text_body = ""

                if msg_type == "text":
                    text_body = msg.get("text", {}).get("body", "").strip()
                elif msg_type == "interactive":
                    interactive = msg.get("interactive", {})
                    if interactive.get("type") == "button_reply":
                        text_body = interactive.get("button_reply", {}).get("title", "").strip()

                _process_inbound_patient_text(from_num, text_body, channel="whatsapp")

    return {"status": "received"}


# ── Twilio SMS & Voice Webhooks ──────────────────────────────────────────────

@router.post("/twilio/sms")
async def twilio_sms_callback(
    MessageSid: str = Form(""),
    MessageStatus: str = Form(""),
    From: str = Form(""),
    Body: str = Form(""),
):
    """Twilio SMS status callback and patient reply receiver."""
    logger.info("Twilio SMS event: sid=%s status=%s from=%s", MessageSid, MessageStatus, From)
    if Body:
        _process_inbound_patient_text(From, Body, channel="sms")
    return PlainTextResponse("<Response></Response>", media_type="text/xml")


@router.post("/twilio/voice")
async def twilio_voice_status(
    CallSid: str = Form(""),
    CallStatus: str = Form(""),
    From: str = Form(""),
    To: str = Form(""),
):
    """Twilio Automated IVR voice call status updates."""
    logger.info("Twilio Voice call status: sid=%s status=%s from=%s to=%s", CallSid, CallStatus, From, To)
    return PlainTextResponse("<Response></Response>", media_type="text/xml")


@router.post("/twilio/ivr-response")
async def twilio_ivr_response(
    Digits: str = Form(""),
    CallSid: str = Form(""),
    From: str = Form(""),
):
    """Twilio IVR Keypad response: 1=Taken, 2=Snooze, 9=Help."""
    logger.info("Twilio IVR key pressed: digits=%s from=%s", Digits, From)
    if Digits == "1":
        _process_inbound_patient_text(From, "TAKEN", channel="ivr")
    elif Digits == "2":
        _process_inbound_patient_text(From, "SNOOZE", channel="ivr")
    elif Digits == "9":
        _process_inbound_patient_text(From, "HELP", channel="ivr")

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Say voice=\"alice\">Thank you. Your response has been recorded in RecoverRight.</Say></Response>"
    )
    return PlainTextResponse(twiml, media_type="text/xml")


# ── Shared Inbound Response Processing ───────────────────────────────────────

def _normalize_phone(num: str) -> str:
    cleaned = re.sub(r"[^\d]", "", num)
    if len(cleaned) > 10:
        return cleaned[-10:]
    return cleaned


def _find_run_id_by_phone(phone: str) -> Optional[str]:
    """Finds active run_id associated with the incoming phone number."""
    norm = _normalize_phone(phone)
    if not norm:
        return None

    for run_meta in store.list_runs():
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            m = store.read(run_id, "meta.json")
            p = m.get("patient", {})
            patient_phone = _normalize_phone(p.get("phone", ""))
            guardian_phone = _normalize_phone(p.get("guardian_phone", ""))
            if norm in (patient_phone, guardian_phone):
                return run_id
        except Exception:
            continue
    return None


def _process_inbound_patient_text(sender: str, text: str, channel: str = "whatsapp"):
    """Clinical routing of patient replies (TAKEN / SNOOZE / HELP)."""
    norm_text = text.strip().upper()
    run_id = _find_run_id_by_phone(sender) or "demo_inbound"

    logger.info("Processing inbound text: from=%s text='%s' channel=%s run_id=%s", sender, text, channel, run_id)

    if norm_text in ("TAKEN", "1", "YES", "LE LIYA", "DONE"):
        # Acknowledge the most recent open reminder
        reminders = store.get_reminders(run_id) if run_id != "demo_inbound" else []
        for r in reminders:
            if r.get("status") in ("scheduled", "delivered", "snoozed"):
                try:
                    acknowledge_reminder(run_id, r["job_id"], via=f"{channel}_reply")
                    break
                except Exception as e:
                    logger.error("Error acknowledging reminder %s: %s", r.get("job_id"), e)

    elif norm_text in ("SNOOZE", "2", "LATER", "BAAD MEIN"):
        reminders = store.get_reminders(run_id) if run_id != "demo_inbound" else []
        for r in reminders:
            if r.get("status") in ("scheduled", "delivered"):
                try:
                    snooze_reminder(run_id, r["job_id"], minutes=15, by=f"patient_{channel}")
                    break
                except Exception as e:
                    logger.error("Error snoozing reminder %s: %s", r.get("job_id"), e)

    elif any(k in norm_text for k in ("HELP", "9", "PAIN", "EMERGENCY", "MADAD", "DOCTOR")):
        try:
            help_store.create(
                run_id=run_id,
                heard=f"Inbound {channel.upper()} message: '{text}'",
                severity="critical" if any(w in norm_text for w in ("EMERGENCY", "CHEST", "SEVERE")) else "concern",
                label=f"Patient {channel.upper()} Reply",
                source="button",
                patient_name="Patient",
            )
            bus.emit(run_id, Stage.CARE_TEAM, "help.inbound_triggered", {
                "channel": channel,
                "text": text,
                "sender": sender,
            })
        except Exception as e:
            logger.error("Error creating emergency help from inbound text: %s", e)
