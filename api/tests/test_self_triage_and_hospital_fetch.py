"""Tests for Self-Managed Patient Triage, Severity Classification, and Hospital Auto-Fetch."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.self_triage import (
    SelfMedicationItem,
    create_self_managed_plan,
    evaluate_prescription_severity,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_severity_classification_non_severe():
    """Common conditions (viral fever, sore throat, minor fracture) are non-severe and auto-approved for 7-15 days."""
    res = evaluate_prescription_severity(
        diagnosis_or_symptoms="Viral fever with mild cough and body ache",
        medications=[
            SelfMedicationItem(name="Paracetamol 650mg", dose="1 tab", frequency="TDS"),
            SelfMedicationItem(name="Pantoprazole 40mg", dose="1 tab", frequency="OD"),
        ],
    )
    assert res.severity == "non_severe"
    assert res.is_auto_approved is True
    assert 7 <= res.plan_duration_days <= 15
    assert res.requires_doctor_consultation is False
    assert "auto-approved" in res.advisory_en


def test_severity_classification_severe_cardiac():
    """Cardiac, surgery, or stroke keywords flag severe condition requiring doctor consultation."""
    res = evaluate_prescription_severity(
        diagnosis_or_symptoms="Post-CABG surgery recovery with acute myocardial infarction history",
        medications=[
            SelfMedicationItem(name="Aspirin 75mg", dose="1 tab"),
            SelfMedicationItem(name="Atorvastatin 40mg", dose="1 tab"),
        ],
    )
    assert res.severity == "severe"
    assert res.is_auto_approved is False
    assert res.requires_doctor_consultation is True
    assert any("Cabg" in r or "Myocardial" in r or "Infarction" in r for r in res.detected_risk_factors)
    assert "doctor" in res.advisory_en.lower()


def test_severity_classification_high_risk_drug():
    """Prescription containing high-risk narrow-therapeutic drugs (e.g. Warfarin) triggers severe flag."""
    res = evaluate_prescription_severity(
        diagnosis_or_symptoms="Routine follow up",
        medications=[
            SelfMedicationItem(name="Warfarin 5mg", dose="1 tab OD", frequency="Once daily"),
        ],
    )
    assert res.severity == "severe"
    assert res.is_auto_approved is False
    assert any("Warfarin" in r for r in res.detected_risk_factors)


def test_create_self_managed_plan_auto_approved():
    """Generates complete plan with 7-15 days duration, saved to store."""
    result = create_self_managed_plan(
        patient_name="Amit Kumar",
        phone="9876543210",
        language="hi",
        diagnosis_or_symptoms="Mild dental tooth extraction recovery",
        medications=[
            SelfMedicationItem(name="Amoxicillin 500mg", dose="1 cap", frequency="TDS"),
            SelfMedicationItem(name="Ibuprofen 400mg", dose="1 tab", frequency="BD"),
        ],
        preferred_duration_days=10,
    )
    assert result["severity"] == "non_severe"
    assert result["is_auto_approved"] is True
    assert result["plan_duration_days"] == 10
    assert result["status"] == "approved"
    assert result["patient_token"].startswith("pat_self_")
    assert result["plan"]["is_self_managed"] is True


def test_api_self_register_non_severe(client):
    """POST /patients/self-register auto-approves non-severe conditions."""
    payload = {
        "patient_name": "Rohan Verma",
        "phone": "9811122233",
        "language": "en",
        "diagnosis_or_symptoms": "Viral flu and cough",
        "medications": [
            {"name": "Paracetamol 650mg", "dose": "1 tab", "frequency": "TDS after food", "times": ["09:00", "21:00"]},
        ],
        "preferred_duration_days": 10,
    }
    resp = client.post("/patients/self-register", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["severity"] == "non_severe"
    assert data["is_auto_approved"] is True
    assert data["status"] == "approved"
    assert data["plan_duration_days"] == 10
    assert "auto-approved" in data["advisory_en"]


def test_api_self_register_severe_condition(client):
    """POST /patients/self-register flags severe condition and warns user to check with doctor."""
    payload = {
        "patient_name": "Suresh Raina",
        "phone": "9822233344",
        "language": "en",
        "diagnosis_or_symptoms": "Severe chest pain, coronary stent placement, and heart failure",
        "medications": [
            {"name": "Clopidogrel 75mg", "dose": "1 tab", "frequency": "OD"},
        ],
    }
    resp = client.post("/patients/self-register", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["severity"] == "severe"
    assert data["is_auto_approved"] is False
    assert data["requires_doctor_consultation"] is True
    assert "doctor" in data["advisory_en"].lower()


def test_api_hospital_fetch(client):
    """POST /patients/hospital-fetch links to hospital database and returns official plan."""
    payload = {
        "phone": "9988776655",
        "hospital_name": "AIIMS New Delhi",
    }
    resp = client.post("/patients/hospital-fetch", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "connected"
    assert data["hospital_name"] == "AIIMS New Delhi"
    assert data["is_approved"] is True
    assert data["patient_token"]
    assert "AIIMS New Delhi" in data["message"]
