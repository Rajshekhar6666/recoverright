"""Tests for Vitals & MEWS Surveillance, Voice Dialogue & Teach-Back, and DDI Safety Engine."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ddi_engine import check_medication_interactions
from app.services.storage import store
from app.services.vitals import calculate_mews

client = TestClient(app)


@pytest.fixture
def mock_run_with_plan(tmp_path):
    run_id = "test_run_voice_vitals_01"
    token = "pat_token_vv_01"
    store.register_patient_token(token, run_id)
    store.register_patient_slug("demo-voice-patient", run_id)
    
    meta = {
        "run_id": run_id,
        "patient": {"name": "Suresh Patel", "phone": "+91 98765 00000", "guardian_phone": "+91 98765 11111"},
        "status": "approved",
    }
    store.write(run_id, "meta.json", meta)

    plan = {
        "run_id": run_id,
        "patient_name": "Suresh Patel",
        "medications": [
            {"name": "Warfarin", "dose": "5mg", "route": "oral", "frequency": "Daily"},
            {"name": "Metoprolol", "dose": "25mg", "route": "oral", "frequency": "Twice daily"},
        ],
        "instructions": {
            "warning_signs": ["Fever over 101F", "Pus or persistent oozing from incision", "Sudden calf swelling"],
            "activity": ["Short walks indoors", "No lifting over 5 kg"],
        },
        "follow_ups": [
            {"what": "Surgical Wound Check", "when": "In 7 days", "where": "OPD Room 12"}
        ],
    }
    store.save_plan_version(run_id, plan, version=1)

    # Pre-register caregiver token
    cg_token = "cg_token_vv_01"
    store.register_caregiver_token(cg_token, run_id)
    caregivers = [{
        "token": cg_token,
        "name": "Meena Patel",
        "phone": "+91 98765 11111",
        "relation": "Spouse",
        "role": "primary",
        "channel": "sms",
    }]
    store.update_meta(run_id, caregivers=caregivers)

    yield run_id, token, cg_token


def test_calculate_mews_logic():
    # Normal vitals: BP=120, HR=75, RR=16, Temp=37C, Alert, SpO2=98
    score, risk, _ = calculate_mews(120, 75, 16, 37.0, "Alert", 98)
    assert score == 0
    assert risk == "normal"

    # Mild derangement: HR=105 (1 pt), RR=22 (2 pts)
    score, risk, _ = calculate_mews(120, 105, 22, 37.0, "Alert", 98)
    assert score == 3
    assert risk == "low_medium"

    # Critical derangement: BP=70 (3 pts), HR=135 (3 pts), RR=32 (3 pts), SpO2=88 (3 pts)
    score, risk, guidance = calculate_mews(70, 135, 32, 39.0, "Voice", 88)
    assert score >= 7
    assert risk == "critical"
    assert "CRITICAL ALERT" in guidance


def test_submit_and_retrieve_patient_vitals(mock_run_with_plan):
    run_id, token, _ = mock_run_with_plan

    reading_payload = {
        "systolic_bp": 124,
        "diastolic_bp": 82,
        "heart_rate": 78,
        "respiratory_rate": 16,
        "temperature": 98.6,
        "temperature_unit": "F",
        "spo2": 99,
        "consciousness": "Alert",
        "notes": "Morning check after breakfast",
    }
    res = client.post(f"/plans/{token}/vitals", json=reading_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["mews_score"] == 0
    assert data["risk_level"] == "normal"
    assert data["temperature_c"] == 37.0

    # Retrieve history
    res_list = client.get(f"/plans/{token}/vitals")
    assert res_list.status_code == 200
    assert len(res_list.json()) >= 1

    # Staff view
    res_staff = client.get(f"/runs/{run_id}/vitals")
    assert res_staff.status_code == 200
    assert res_staff.json()["total_readings"] >= 1


def test_ddi_engine_detection():
    # Warfarin + Ibuprofen -> Critical bleeding risk
    alerts = check_medication_interactions(["Warfarin 5mg", "Ibuprofen 400mg"])
    assert len(alerts) == 1
    assert alerts[0].severity == "critical"
    assert "Bleeding" in alerts[0].clinical_risk

    # Metoprolol + Verapamil -> Bradycardia/Heart Block
    alerts_cardiac = check_medication_interactions(["Metoprolol Tartrate 50mg", "Verapamil SR 240mg"])
    assert len(alerts_cardiac) == 1
    assert alerts_cardiac[0].severity == "critical"

    # Safe pair
    safe_alerts = check_medication_interactions(["Amoxicillin 500mg", "Paracetamol 650mg"])
    assert len(safe_alerts) == 0


def test_run_medication_safety_interactions_endpoint(mock_run_with_plan):
    run_id, _, _ = mock_run_with_plan
    res = client.get(f"/runs/{run_id}/medication-safety/interactions")
    assert res.status_code == 200
    data = res.json()
    assert data["safe_to_discharge"] is True
    assert data["total_medications"] == 2


def test_voice_dialogue_queries(mock_run_with_plan):
    _, token, _ = mock_run_with_plan

    # 1. Medication query
    res_med = client.post("/voice/dialogue", json={
        "token": token,
        "spoken_text": "What are my medicines today?",
        "language": "en",
    })
    assert res_med.status_code == 200
    data_med = res_med.json()
    assert data_med["intent"] == "medication_query"
    assert "Warfarin" in data_med["spoken_reply"]

    # 2. Drug interaction query
    res_ddi = client.post("/voice/dialogue", json={
        "token": token,
        "spoken_text": "Can I take ibuprofen for my headache?",
        "language": "en",
    })
    assert res_ddi.status_code == 200
    data_ddi = res_ddi.json()
    assert data_ddi["intent"] == "drug_interaction"
    assert "Caution" in data_ddi["spoken_reply"]

    # 3. Hindi query
    res_hi = client.post("/voice/dialogue", json={
        "token": token,
        "spoken_text": "Mujhe dawai kab leni hai?",
        "language": "hi",
    })
    assert res_hi.status_code == 200
    assert res_hi.json()["intent"] == "medication_query"

    # 4. Critical distress trigger
    res_emerg = client.post("/voice/dialogue", json={
        "token": token,
        "spoken_text": "Emergency! I have severe chest pain and can't breathe!",
        "language": "en",
    })
    assert res_emerg.status_code == 200
    data_emerg = res_emerg.json()
    assert data_emerg["intent"] == "emergency"
    assert data_emerg["is_emergency"] is True
    assert data_emerg["acoustic_risk_score"] > 0.8


def test_voice_teach_back_evaluation(mock_run_with_plan):
    _, token, _ = mock_run_with_plan

    # Competent teach-back
    res = client.post("/voice/teach-back-evaluate", json={
        "token": token,
        "patient_spoken_explanation": "I need to take Warfarin every morning and Metoprolol daily, and call doctor if I get fever.",
        "language": "en",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["is_competent"] is True
    assert data["comprehension_score"] >= 60

    # Incomplete teach-back
    res_low = client.post("/voice/teach-back-evaluate", json={
        "token": token,
        "patient_spoken_explanation": "I will just take some pills when I feel like it.",
        "language": "en",
    })
    assert res_low.status_code == 200
    data_low = res_low.json()
    assert data_low["is_competent"] is False
    assert len(data_low["missing_concepts"]) > 0


def test_caregiver_daily_digest_endpoint(mock_run_with_plan):
    _, _, cg_token = mock_run_with_plan
    res = client.get(f"/caregivers/{cg_token}/daily-digest")
    assert res.status_code == 200
    data = res.json()
    assert "patient_name" in data
    assert "adherence_percentage" in data
    assert "caregiver_action_items" in data
    assert len(data["caregiver_action_items"]) > 0
