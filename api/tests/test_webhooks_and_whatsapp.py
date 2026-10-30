"""Tests for Webhooks, WhatsApp Cloud API integration, and Staff Auth hardening."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.whatsapp import MetaWhatsAppClient, whatsapp_client
from app.schemas.reminder import ReminderJob
from app.services.storage import store

client = TestClient(app)


def test_whatsapp_webhook_verification():
    # Valid verification
    res = client.get("/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=test_12345&hub.verify_token=recoverright_verify_token")
    assert res.status_code == 200
    assert res.text == "test_12345"

    # Invalid token
    res_bad = client.get("/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=test_12345&hub.verify_token=wrong_token")
    assert res_bad.status_code == 403


def test_whatsapp_webhook_inbound_delivery_and_messages():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "wa_acc_01",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "123456"},
                            "statuses": [
                                {"id": "wamid.123", "status": "delivered", "recipient_id": "919999999999"}
                            ],
                            "messages": [
                                {
                                    "from": "919999999999",
                                    "id": "wamid.inbound_01",
                                    "timestamp": "1700000000",
                                    "type": "text",
                                    "text": {"body": "TAKEN"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }
    res = client.post("/webhooks/whatsapp", json=payload)
    assert res.status_code == 200
    assert res.json() == {"status": "received"}


def test_twilio_webhooks():
    # SMS status / inbound callback
    res_sms = client.post(
        "/webhooks/twilio/sms",
        data={"MessageSid": "SM123", "MessageStatus": "delivered", "From": "+919876543210", "Body": "HELP"},
    )
    assert res_sms.status_code == 200
    assert "text/xml" in res_sms.headers.get("content-type", "")

    # Voice status callback
    res_voice = client.post(
        "/webhooks/twilio/voice",
        data={"CallSid": "CA123", "CallStatus": "completed", "From": "+919876543210", "To": "+123456789"},
    )
    assert res_voice.status_code == 200

    # IVR Response handler
    res_ivr = client.post(
        "/webhooks/twilio/ivr-response",
        data={"Digits": "1", "CallSid": "CA123", "From": "+919876543210"},
    )
    assert res_ivr.status_code == 200
    assert "Thank you" in res_ivr.text


def test_whatsapp_client_unit():
    wa = MetaWhatsAppClient()
    # Phone normalization
    assert wa._normalize_phone("+91 98765 43210") == "919876543210"
    assert wa._normalize_phone("9876543210") == "919876543210"

    # Simulated template & text sending when credentials absent
    template_res = wa.send_template_message("9876543210", "test_tpl")
    assert template_res["status"] == "simulated"

    text_res = wa.send_text_message("9876543210", "Hello patient")
    assert text_res["status"] == "simulated"

    # Medication reminder formatting
    job = ReminderJob(
        job_id="job_wa_01",
        run_id="demo_wa_run",
        medication_id="med_01",
        medication_name="Metoprolol",
        dose="25mg",
        scheduled_date="2026-11-01",
        scheduled_time="08:00 AM",
        channel="whatsapp",
        recipient="9876543210",
    )
    delivery = wa.send_medication_reminder("9876543210", job, caregiver_first=True)
    assert delivery.success is True
    assert delivery.channel == "whatsapp"
    assert delivery.status == "simulated"
