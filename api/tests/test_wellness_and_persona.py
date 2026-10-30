"""
Tests for Voice Persona and Wellness features.

Covers:
- Voice persona listing and profile retrieval
- Persona preference storage per patient
- Mood check-in recording and history
- Medication streak tracking and milestones
- Recovery progress calculation
- Caregiver message flow
- REST API endpoints via TestClient
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import wellness as ws
from app.services.voice_persona import (
    PatientEmotionalState,
    VoicePersona,
    generate_emotional_counseling_reply,
    generate_persona_alarm_script,
    get_characteristic_phrase,
    get_patient_emotional_state,
    get_patient_persona,
    get_persona_profile,
    list_personas,
    personalize_greeting,
    set_patient_emotional_state,
    set_patient_persona,
)
from app.services.voice_dialogue import VoiceDialogueRequest, process_voice_dialogue
from app.services.storage import store
from app.services.wellness import (
    WellnessMood,
    _reset_wellness_state,
    get_care_messages,
    get_mood_history,
    get_recovery_progress,
    get_streak,
    get_streak_message,
    mark_care_message_read,
    record_medication_taken,
    record_mood,
    send_care_message,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_wellness():
    """Reset wellness state before each test to avoid cross-test contamination."""
    _reset_wellness_state()
    yield
    _reset_wellness_state()


def fresh_run_id() -> str:
    return f"test_ux_{uuid.uuid4().hex[:8]}"


# ── Voice Persona Service Tests ────────────────────────────────────────────────

class TestVoicePersonaService:
    def test_list_personas_returns_six(self):
        personas = list_personas()
        assert len(personas) == 6

    def test_each_persona_has_required_fields(self):
        for p in list_personas():
            assert p["id"]
            assert p["display_name"]
            assert p["display_name_hi"]
            assert p["emoji"]
            assert p["sample_greeting_en"]
            assert p["sample_greeting_hi"]
            assert p["emotional_tone"] in ("warm", "professional", "energetic", "serene")
            assert p["speech_cadence"] in ("slow", "medium", "fast")

    def test_personalize_greeting_en(self):
        greeting = personalize_greeting(VoicePersona.SOOTHING_DIDI, "Ramesh", lang="en")
        assert "Ramesh" in greeting
        assert "{name}" not in greeting

    def test_personalize_greeting_hi(self):
        greeting = personalize_greeting(VoicePersona.CARING_MAA, "रमेश", lang="hi")
        assert "रमेश" in greeting
        assert "{name}" not in greeting

    def test_all_personas_greeting_interpolation(self):
        for persona in VoicePersona:
            g_en = personalize_greeting(persona, "TestName", lang="en")
            g_hi = personalize_greeting(persona, "TestName", lang="hi")
            assert "TestName" in g_en
            assert "{name}" not in g_en
            assert "TestName" in g_hi

    def test_characteristic_phrase_returns_string(self):
        for persona in VoicePersona:
            phrase = get_characteristic_phrase(persona, lang="en")
            assert isinstance(phrase, str) and len(phrase) > 0
            phrase_hi = get_characteristic_phrase(persona, lang="hi")
            assert isinstance(phrase_hi, str) and len(phrase_hi) > 0

    def test_persona_preference_default(self):
        run_id = fresh_run_id()
        # Default should be SOOTHING_DIDI
        assert get_patient_persona(run_id) == VoicePersona.SOOTHING_DIDI

    def test_set_and_get_persona_preference(self):
        run_id = fresh_run_id()
        set_patient_persona(run_id, VoicePersona.CALM_GURU)
        assert get_patient_persona(run_id) == VoicePersona.CALM_GURU

    def test_each_run_id_has_independent_persona(self):
        run_a = fresh_run_id()
        run_b = fresh_run_id()
        set_patient_persona(run_a, VoicePersona.FRIENDLY_BHAI)
        set_patient_persona(run_b, VoicePersona.MATURE_ELDER)
        assert get_patient_persona(run_a) == VoicePersona.FRIENDLY_BHAI
        assert get_patient_persona(run_b) == VoicePersona.MATURE_ELDER


# ── Wellness Mood Tests ────────────────────────────────────────────────────────

class TestMoodCheckIn:
    def test_record_and_retrieve_mood(self):
        run_id = fresh_run_id()
        record_mood(run_id, WellnessMood.GREAT, note="Feeling great today")
        record_mood(run_id, WellnessMood.OKAY)
        history = get_mood_history(run_id, days=7)
        assert len(history) == 2
        assert history[0].mood == WellnessMood.GREAT

    def test_mood_note_stored(self):
        run_id = fresh_run_id()
        record_mood(run_id, WellnessMood.LOW, note="Headache")
        history = get_mood_history(run_id)
        assert history[0].note == "Headache"

    def test_mood_history_zero_days_empty(self):
        run_id = fresh_run_id()
        record_mood(run_id, WellnessMood.GREAT)
        history = get_mood_history(run_id, days=0)
        assert len(history) == 0


# ── Medication Streak Tests ────────────────────────────────────────────────────

class TestMedicationStreak:
    def test_first_dose_starts_streak(self):
        run_id = fresh_run_id()
        streak = record_medication_taken(run_id, date(2024, 1, 1))
        assert streak.current_streak == 1
        assert streak.longest_streak == 1

    def test_consecutive_days_increment_streak(self):
        run_id = fresh_run_id()
        record_medication_taken(run_id, date(2024, 1, 14))
        streak = record_medication_taken(run_id, date(2024, 1, 15))
        assert streak.current_streak == 2
        assert streak.longest_streak == 2

    def test_skipped_day_resets_streak(self):
        run_id = fresh_run_id()
        record_medication_taken(run_id, date(2024, 1, 10))
        streak = record_medication_taken(run_id, date(2024, 1, 12))  # skipped 11th
        assert streak.current_streak == 1

    def test_same_day_duplicate_no_change(self):
        run_id = fresh_run_id()
        record_medication_taken(run_id, date(2024, 1, 5))
        streak = record_medication_taken(run_id, date(2024, 1, 5))  # same day
        assert streak.current_streak == 1

    def test_seven_day_milestone(self):
        run_id = fresh_run_id()
        for i in range(1, 8):
            streak = record_medication_taken(run_id, date(2024, 1, i))
        assert streak.current_streak == 7
        assert streak.milestone_reached == 7

    def test_no_false_milestone_before_seven_days(self):
        run_id = fresh_run_id()
        for i in range(1, 6):
            streak = record_medication_taken(run_id, date(2024, 1, i))
        assert streak.milestone_reached is None

    def test_streak_message_contains_patient_name(self):
        run_id = fresh_run_id()
        record_medication_taken(run_id, date(2024, 1, 1))
        streak = get_streak(run_id)
        msg = get_streak_message(streak, "Ramesh")
        assert "Ramesh" in msg

    def test_streak_message_zero_days(self):
        run_id = fresh_run_id()
        streak = get_streak(run_id)
        msg = get_streak_message(streak)
        assert "💊" in msg

    def test_streak_message_hindi(self):
        run_id = fresh_run_id()
        for i in range(1, 8):
            record_medication_taken(run_id, date(2024, 1, i))
        streak = get_streak(run_id)
        msg_hi = get_streak_message(streak, "रमेश", lang="hi")
        assert "रमेश" in msg_hi or "शाबाश" in msg_hi


# ── Recovery Progress Tests ────────────────────────────────────────────────────

class TestRecoveryProgress:
    def test_basic_progress(self):
        progress = get_recovery_progress(5, 21)
        assert progress["recovery_day"] == 5
        assert progress["total_days"] == 21
        assert 0 < progress["percent"] <= 100
        assert len(progress["progress_bar"]) == 10

    def test_100_percent_at_end(self):
        progress = get_recovery_progress(21, 21)
        assert progress["percent"] == 100
        assert "█" * 10 == progress["progress_bar"]

    def test_halfway_milestone_triggered(self):
        # day 11 of 21 = ~52%, day 10 = ~47%
        progress = get_recovery_progress(11, 21)
        assert progress["celebration"] is not None
        assert "🌟" in progress["celebration"]

    def test_100_milestone_triggered(self):
        progress = get_recovery_progress(21, 21)
        assert "🏆" in (progress["celebration"] or "")

    def test_no_milestone_mid_journey(self):
        # day 6 of 21 = ~28%, day 5 = ~23% — crosses 25% milestone
        progress_6 = get_recovery_progress(6, 21)
        # day 3 of 21 = ~14% — no milestone
        progress_3 = get_recovery_progress(3, 21)
        assert progress_3["celebration"] is None

    def test_progress_bar_partial(self):
        progress = get_recovery_progress(5, 10)  # 50%
        assert "█" in progress["progress_bar"]
        assert "░" in progress["progress_bar"]


# ── Caregiver Message Tests ────────────────────────────────────────────────────

class TestCaregiverMessages:
    def test_send_and_receive_message(self):
        run_id = fresh_run_id()
        send_care_message(run_id, "Sunita", "💙", "Thinking of you!", "आपके बारे में सोच रही हूँ!")
        msgs = get_care_messages(run_id)
        assert len(msgs) == 1
        assert msgs[0].sender_name == "Sunita"
        assert msgs[0].emoji == "💙"

    def test_unread_filter(self):
        run_id = fresh_run_id()
        send_care_message(run_id, "Priya", "🌸", "Get well soon!", "जल्दी ठीक हो जाओ!")
        assert len(get_care_messages(run_id, unread_only=True)) == 1
        msg = get_care_messages(run_id)[0]
        mark_care_message_read(run_id, msg.message_id)
        assert len(get_care_messages(run_id, unread_only=True)) == 0

    def test_invalid_emoji_fallback(self):
        run_id = fresh_run_id()
        msg = send_care_message(run_id, "Raju", "🦄", "Hey!", "हे!")
        assert msg.emoji == "💙"  # Invalid emoji → fallback

    def test_mark_read_returns_true(self):
        run_id = fresh_run_id()
        send_care_message(run_id, "Amma", "❤️", "Love you!", "प्यार!")
        msg = get_care_messages(run_id)[0]
        result = mark_care_message_read(run_id, msg.message_id)
        assert result is True

    def test_mark_read_unknown_id_returns_false(self):
        run_id = fresh_run_id()
        result = mark_care_message_read(run_id, "nonexistent-id")
        assert result is False

    def test_messages_sorted_newest_first(self):
        run_id = fresh_run_id()
        send_care_message(run_id, "A", "💙", "First", "पहला")
        send_care_message(run_id, "B", "🙏", "Second", "दूसरा")
        msgs = get_care_messages(run_id)
        # Newest first
        assert msgs[0].sender_name == "B"


# ── REST API Tests ─────────────────────────────────────────────────────────────

class TestWellnessAPI:
    def test_list_personas_endpoint(self):
        resp = client.get("/wellness/personas")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 6
        assert len(data["personas"]) == 6

    def test_set_and_get_persona(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/persona/{run_id}", json={"persona": "calm_guru"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["persona"] == "calm_guru"

        resp2 = client.get(f"/wellness/persona/{run_id}")
        assert resp2.status_code == 200
        assert resp2.json()["persona"] == "calm_guru"

    def test_mood_checkin_endpoint(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/mood/{run_id}", json={"mood": "great", "note": "Feeling well"})
        assert resp.status_code == 200
        assert resp.json()["mood"] == "great"

    def test_mood_history_endpoint(self):
        run_id = fresh_run_id()
        client.post(f"/wellness/mood/{run_id}", json={"mood": "okay"})
        client.post(f"/wellness/mood/{run_id}", json={"mood": "great"})
        resp = client.get(f"/wellness/mood/{run_id}")
        assert resp.status_code == 200
        assert len(resp.json()["history"]) == 2

    def test_medication_taken_endpoint(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/medication-taken/{run_id}", json={"taken_date": "2024-01-15"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_streak"] == 1
        assert "streak_message" in data

    def test_streak_endpoint(self):
        run_id = fresh_run_id()
        resp = client.get(f"/wellness/streak/{run_id}")
        assert resp.status_code == 200
        assert resp.json()["current_streak"] == 0

    def test_recovery_progress_endpoint(self):
        run_id = fresh_run_id()
        resp = client.get(f"/wellness/recovery-progress/{run_id}?recovery_day=5&total_days=21")
        assert resp.status_code == 200
        data = resp.json()
        assert data["recovery_day"] == 5
        assert data["percent"] > 0

    def test_care_message_send_and_retrieve(self):
        run_id = fresh_run_id()
        resp = client.post(
            f"/wellness/care-messages/{run_id}/send",
            json={
                "sender_name": "Meena",
                "emoji": "💙",
                "text": "Thinking of you!",
                "text_hi": "आपके बारे में सोच रही हूँ!",
            },
        )
        assert resp.status_code == 200
        msg_id = resp.json()["message_id"]

        resp2 = client.get(f"/wellness/care-messages/{run_id}")
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["unread_count"] == 1
        assert data["messages"][0]["sender_name"] == "Meena"

        resp3 = client.post(f"/wellness/care-messages/{run_id}/read/{msg_id}")
        assert resp3.status_code == 200

        resp4 = client.get(f"/wellness/care-messages/{run_id}?unread_only=true")
        assert resp4.json()["unread_count"] == 0

    def test_care_message_mark_read_not_found(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/care-messages/{run_id}/read/nonexistent-id")
        assert resp.status_code == 404

    def test_invalid_persona_value(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/persona/{run_id}", json={"persona": "invalid_persona_xyz"})
        assert resp.status_code == 422

    def test_invalid_mood_value(self):
        run_id = fresh_run_id()
        resp = client.post(f"/wellness/mood/{run_id}", json={"mood": "amazing"})
        assert resp.status_code == 422


# ── Emotional Archetypes & Personalized Spoken Alarms Tests ────────────────────

class TestEmotionalArchetypesAndAlarms:
    def test_emotional_state_default_and_update(self):
        run_id = fresh_run_id()
        assert get_patient_emotional_state(run_id) == PatientEmotionalState.GENERAL
        set_patient_emotional_state(run_id, PatientEmotionalState.BURDEN)
        assert get_patient_emotional_state(run_id) == PatientEmotionalState.BURDEN

    def test_persona_alarm_script_caring_maa_hindi(self):
        script = generate_persona_alarm_script(
            persona=VoicePersona.CARING_MAA,
            medication_name="Paracetamol",
            dose="500mg",
            patient_name="Rahul",
            lang="hi",
            emotional_state=PatientEmotionalState.GENERAL,
        )
        assert "बेटा Rahul" in script["spoken_text"]
        assert "Paracetamol" in script["spoken_text"]
        assert "चिंता मत कर" in script["spoken_text"]
        assert "Maa" in script["banner_text"] or "माँ" in script["banner_text"]

    def test_persona_alarm_script_maa_burden_archetype(self):
        script = generate_persona_alarm_script(
            persona=VoicePersona.CARING_MAA,
            medication_name="Metoprolol",
            dose="25mg",
            patient_name="Rahul",
            lang="hi",
            emotional_state=PatientEmotionalState.BURDEN,
        )
        assert "बोझ" in script["spoken_text"]
        assert "माँ तेरे साथ है" in script["spoken_text"]

    def test_persona_alarm_script_maa_student_archetype(self):
        script = generate_persona_alarm_script(
            persona=VoicePersona.CARING_MAA,
            medication_name="Augmentin",
            dose="625mg",
            patient_name="Pooja",
            lang="hi",
            emotional_state=PatientEmotionalState.STUDENT,
        )
        assert "पढ़ाई" in script["spoken_text"]
        assert "Augmentin" in script["spoken_text"]

    def test_persona_alarm_script_friendly_bhai(self):
        script = generate_persona_alarm_script(
            persona=VoicePersona.FRIENDLY_BHAI,
            medication_name="Ibuprofen",
            patient_name="Suresh",
            lang="hi",
        )
        assert "भाई" in script["spoken_text"]
        assert "Ibuprofen" in script["spoken_text"]

    def test_persona_alarm_script_doctor(self):
        script = generate_persona_alarm_script(
            persona=VoicePersona.STEADY_DOCTOR,
            medication_name="Aspirin",
            patient_name="John",
            lang="en",
        )
        assert "Dr. Uncle" in script["banner_text"]
        assert "Aspirin" in script["spoken_text"]

    def test_emotional_counseling_reply_burden_maa(self):
        reply = generate_emotional_counseling_reply(
            persona=VoicePersona.CARING_MAA,
            emotional_state=PatientEmotionalState.BURDEN,
            patient_name="Rohit",
            lang="hi",
        )
        assert "बोझ" in reply
        assert "Rohit" in reply

    def test_emotional_counseling_reply_alone_didi(self):
        reply = generate_emotional_counseling_reply(
            persona=VoicePersona.SOOTHING_DIDI,
            emotional_state=PatientEmotionalState.ALONE,
            patient_name="Ananya",
            lang="en",
        )
        assert "never alone" in reply
        assert "Ananya" in reply

    def test_emotional_state_api_endpoints(self):
        run_id = fresh_run_id()
        # GET default
        get_resp = client.get(f"/wellness/emotional-state/{run_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["emotional_state"] == "general"

        # POST change
        post_resp = client.post(
            f"/wellness/emotional-state/{run_id}",
            json={"emotional_state": "student"},
        )
        assert post_resp.status_code == 200
        assert post_resp.json()["emotional_state"] == "student"

    def test_persona_alarm_script_api_endpoint(self):
        resp = client.post(
            "/wellness/persona-alarm-script",
            json={
                "persona": "caring_maa",
                "medication_name": "Paracetamol",
                "dose": "500mg",
                "patient_name": "Karan",
                "language": "hi",
                "emotional_state": "burden",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Karan" in data["spoken_text"]
        assert "Paracetamol" in data["spoken_text"]
        assert "बोझ" in data["spoken_text"]

    def test_emotional_support_message_api(self):
        run_id = fresh_run_id()
        set_patient_persona(run_id, VoicePersona.CARING_MAA)
        set_patient_emotional_state(run_id, PatientEmotionalState.ALONE)
        resp = client.get(f"/wellness/emotional-support-message/{run_id}?lang=hi&patient_name=Karan")
        assert resp.status_code == 200
        data = resp.json()
        assert "Karan" in data["message"]
        assert data["persona"] == "caring_maa"

    def test_voice_dialogue_detects_emotional_burden_and_replies_compassionately(self):
        # Create run in store for voice dialogue grounding
        run_id = fresh_run_id()
        meta = {
            "run_id": run_id,
            "patient": {"name": "Rohan", "phone": "+91 99999 11111"},
            "status": "approved",
        }
        store.write(run_id, "meta.json", meta)
        plan = {
            "run_id": run_id,
            "patient_name": "Rohan",
            "medications": [{"name": "Paracetamol", "dose": "500mg"}],
            "instructions": {},
        }
        store.save_plan_version(run_id, plan, version=1)
        store.register_patient_token(run_id, run_id)
        set_patient_persona(run_id, VoicePersona.CARING_MAA)

        req = VoiceDialogueRequest(
            token=run_id,
            spoken_text="Mujhe lagta hai main sab pe bojh ban gaya hoon",
            language="hi",
        )
        response = process_voice_dialogue(req)
        assert response.intent == "emotional_support"
        assert response.is_emergency is False
        assert "बोझ" in response.spoken_reply or "प्यार" in response.spoken_reply
        assert "Rohan" in response.spoken_reply

    def test_recovery_story_service_and_endpoint(self):
        run_id = fresh_run_id()
        # Record some medication doses and mood
        record_medication_taken(run_id, date(2024, 1, 1))
        record_medication_taken(run_id, date(2024, 1, 2))
        record_mood(run_id, WellnessMood.GREAT)

        resp = client.get(f"/wellness/recovery-story/{run_id}?patient_name=Pooja&recovery_day=14&total_days=21")
        assert resp.status_code == 200
        data = resp.json()
        assert data["patient_name"] == "Pooja"
        assert data["recovery_day"] == 14
        assert data["percent_complete"] == 67
        assert "Halfway" in data["milestone_badge"] or "Champion" in data["milestone_badge"]
        assert "Pooja" in data["story_en"]
        assert "Pooja" in data["story_hi"]
        assert data["mood_distribution"]["great"] >= 1
