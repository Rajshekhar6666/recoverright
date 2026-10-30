"""
Wellness, Persona, and Caregiver API Router for RecoverRight.

Endpoints:
  GET  /wellness/personas                          - List all voice personas
  GET  /wellness/persona/{run_id}                  - Get patient's current persona
  POST /wellness/persona/{run_id}                  - Set patient's persona preference
  POST /wellness/mood/{run_id}                     - Record a mood emoji check-in
  GET  /wellness/mood/{run_id}                     - Get mood history (last 7 days)
  POST /wellness/medication-taken/{run_id}         - Record medication taken today
  GET  /wellness/streak/{run_id}                   - Get streak info
  GET  /wellness/recovery-progress/{run_id}        - Get recovery journey progress
  GET  /wellness/care-messages/{run_id}            - Get care messages for patient
  POST /wellness/care-messages/{run_id}/send       - Caregiver sends a care message
  POST /wellness/care-messages/{run_id}/read/{mid} - Mark care message as read
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.voice_persona import (
    PatientEmotionalState,
    VoicePersona,
    generate_emotional_counseling_reply,
    generate_persona_alarm_script,
    get_patient_emotional_state,
    get_patient_persona,
    get_persona_profile,
    list_personas,
    personalize_greeting,
    set_patient_emotional_state,
    set_patient_persona,
)
from app.services.wellness import (
    WellnessMood,
    generate_recovery_story,
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

router = APIRouter()


# ── Request / Response Schemas ─────────────────────────────────────────────────

class SetPersonaRequest(BaseModel):
    persona: VoicePersona


class PersonaResponse(BaseModel):
    run_id: str
    persona: str
    profile: dict


class MoodRequest(BaseModel):
    mood: WellnessMood
    note: Optional[str] = None


class MoodCheckInResponse(BaseModel):
    run_id: str
    mood: str
    timestamp: str
    note: Optional[str]


class MoodHistoryResponse(BaseModel):
    run_id: str
    history: list[MoodCheckInResponse]


class MedicationTakenRequest(BaseModel):
    taken_date: Optional[str] = None  # YYYY-MM-DD; defaults to today


class StreakResponse(BaseModel):
    run_id: str
    current_streak: int
    longest_streak: int
    last_taken_date: Optional[str]
    milestone_reached: Optional[int]
    streak_message: str
    streak_message_hi: str


class RecoveryProgressResponse(BaseModel):
    run_id: str
    recovery_day: int
    total_days: int
    percent: int
    progress_bar: str
    celebration: Optional[str]


class SendCareMessageRequest(BaseModel):
    sender_name: str = Field(..., min_length=1, max_length=60)
    emoji: str = Field(default="💙")
    text: str = Field(..., min_length=1, max_length=280)
    text_hi: str = Field(default="", max_length=280)


class CareMessageResponse(BaseModel):
    message_id: str
    sender_name: str
    emoji: str
    text: str
    text_hi: str
    timestamp: str
    read: bool


class CareMessagesResponse(BaseModel):
    run_id: str
    messages: list[CareMessageResponse]
    unread_count: int


class SetEmotionalStateRequest(BaseModel):
    emotional_state: PatientEmotionalState


class EmotionalStateResponse(BaseModel):
    run_id: str
    emotional_state: str
    description: str


class GenerateAlarmScriptRequest(BaseModel):
    persona: Optional[VoicePersona] = None
    medication_name: str
    dose: str = ""
    patient_name: str = "Beta"
    language: str = "hi"
    emotional_state: Optional[PatientEmotionalState] = None
    time_of_day: str = "morning"


class AlarmScriptResponse(BaseModel):
    persona: str
    medication_name: str
    dose: str
    spoken_text: str
    banner_text: str
    language: str


# ── Persona Endpoints ──────────────────────────────────────────────────────────

@router.get("/personas")
def list_all_personas():
    """Return all available voice personas."""
    return {"personas": list_personas(), "count": len(list_personas())}


@router.get("/persona/{run_id}", response_model=PersonaResponse)
def get_persona(run_id: str):
    """Get the current voice persona preference for a patient."""
    persona = get_patient_persona(run_id)
    profile = get_persona_profile(persona)
    return PersonaResponse(
        run_id=run_id,
        persona=persona.value,
        profile={
            "display_name": profile.display_name,
            "display_name_hi": profile.display_name_hi,
            "emoji": profile.emoji,
            "emotional_tone": profile.emotional_tone,
            "speech_cadence": profile.speech_cadence,
            "tts_pitch": profile.tts_pitch,
            "tts_speed": profile.tts_speed,
            "description": profile.description,
        },
    )


@router.post("/persona/{run_id}", response_model=PersonaResponse)
def set_persona(run_id: str, body: SetPersonaRequest):
    """Set the patient's preferred voice persona."""
    set_patient_persona(run_id, body.persona)
    profile = get_persona_profile(body.persona)
    return PersonaResponse(
        run_id=run_id,
        persona=body.persona.value,
        profile={
            "display_name": profile.display_name,
            "display_name_hi": profile.display_name_hi,
            "emoji": profile.emoji,
            "emotional_tone": profile.emotional_tone,
            "speech_cadence": profile.speech_cadence,
            "tts_pitch": profile.tts_pitch,
            "tts_speed": profile.tts_speed,
            "description": profile.description,
        },
    )


# ── Emotional State & Personalized Alarm Endpoints ────────────────────────────

@router.get("/emotional-state/{run_id}", response_model=EmotionalStateResponse)
def get_emotional_state(run_id: str):
    """Get the patient's current emotional situation / archetype."""
    state = get_patient_emotional_state(run_id)
    return EmotionalStateResponse(
        run_id=run_id,
        emotional_state=state.value,
        description=f"Patient psychological profile: {state.value}",
    )


@router.post("/emotional-state/{run_id}", response_model=EmotionalStateResponse)
def set_emotional_state(run_id: str, body: SetEmotionalStateRequest):
    """Set the patient's emotional situation / archetype (e.g. burden, alone, student)."""
    set_patient_emotional_state(run_id, body.emotional_state)
    return EmotionalStateResponse(
        run_id=run_id,
        emotional_state=body.emotional_state.value,
        description=f"Patient psychological profile set to: {body.emotional_state.value}",
    )


@router.post("/persona-alarm-script", response_model=AlarmScriptResponse)
def create_persona_alarm_script(body: GenerateAlarmScriptRequest):
    """Generates personalized spoken alarm audio script for medication doses."""
    persona = body.persona or VoicePersona.CARING_MAA
    script = generate_persona_alarm_script(
        persona=persona,
        medication_name=body.medication_name,
        dose=body.dose,
        patient_name=body.patient_name,
        lang=body.language,
        emotional_state=body.emotional_state,
        time_of_day=body.time_of_day,
    )
    return AlarmScriptResponse(**script)


@router.get("/emotional-support-message/{run_id}")
def get_emotional_support_message(
    run_id: str,
    lang: str = Query(default="hi"),
    patient_name: str = Query(default="Beta"),
):
    """Retrieves an empathetic, persona-tailored comforting message."""
    persona = get_patient_persona(run_id)
    state = get_patient_emotional_state(run_id)
    message = generate_emotional_counseling_reply(
        persona=persona,
        emotional_state=state,
        patient_name=patient_name,
        lang=lang,
    )
    return {
        "run_id": run_id,
        "persona": persona.value,
        "emotional_state": state.value,
        "message": message,
        "language": lang,
    }


# ── Mood Endpoints ─────────────────────────────────────────────────────────────

@router.post("/mood/{run_id}", response_model=MoodCheckInResponse)
def record_mood_checkin(run_id: str, body: MoodRequest):
    """Record a mood emoji check-in for a patient."""
    checkin = record_mood(run_id, body.mood, body.note)
    return MoodCheckInResponse(
        run_id=run_id,
        mood=checkin.mood.value,
        timestamp=checkin.timestamp.isoformat(),
        note=checkin.note,
    )


@router.get("/mood/{run_id}", response_model=MoodHistoryResponse)
def get_mood(run_id: str, days: int = Query(default=7, ge=1, le=90)):
    """Get mood check-in history for a patient."""
    history = get_mood_history(run_id, days)
    return MoodHistoryResponse(
        run_id=run_id,
        history=[
            MoodCheckInResponse(
                run_id=run_id,
                mood=c.mood.value,
                timestamp=c.timestamp.isoformat(),
                note=c.note,
            )
            for c in history
        ],
    )


# ── Streak Endpoints ───────────────────────────────────────────────────────────

@router.post("/medication-taken/{run_id}", response_model=StreakResponse)
def medication_taken(run_id: str, body: MedicationTakenRequest):
    """Record that a patient took their medication today. Updates streak."""
    taken_date = None
    if body.taken_date:
        try:
            taken_date = date.fromisoformat(body.taken_date)
        except ValueError:
            raise HTTPException(status_code=422, detail="taken_date must be YYYY-MM-DD")

    streak = record_medication_taken(run_id, taken_date)
    return StreakResponse(
        run_id=run_id,
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        last_taken_date=streak.last_taken_date.isoformat() if streak.last_taken_date else None,
        milestone_reached=streak.milestone_reached,
        streak_message=get_streak_message(streak, lang="en"),
        streak_message_hi=get_streak_message(streak, lang="hi"),
    )


@router.get("/streak/{run_id}", response_model=StreakResponse)
def get_streak_info(run_id: str):
    """Get the current medication streak for a patient."""
    streak = get_streak(run_id)
    return StreakResponse(
        run_id=run_id,
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        last_taken_date=streak.last_taken_date.isoformat() if streak.last_taken_date else None,
        milestone_reached=streak.milestone_reached,
        streak_message=get_streak_message(streak, lang="en"),
        streak_message_hi=get_streak_message(streak, lang="hi"),
    )


# ── Recovery Progress ──────────────────────────────────────────────────────────

@router.get("/recovery-progress/{run_id}", response_model=RecoveryProgressResponse)
def recovery_progress(
    run_id: str,
    recovery_day: int = Query(..., ge=1),
    total_days: int = Query(default=21, ge=1),
):
    """Get recovery journey progress with milestone celebration if applicable."""
    progress = get_recovery_progress(recovery_day, total_days)
    return RecoveryProgressResponse(
        run_id=run_id,
        recovery_day=progress["recovery_day"],
        total_days=progress["total_days"],
        percent=progress["percent"],
        progress_bar=progress["progress_bar"],
        celebration=progress["celebration"],
    )


@router.get("/recovery-story/{run_id}")
def recovery_story(
    run_id: str,
    patient_name: str = Query(default="Patient"),
    recovery_day: int = Query(default=7, ge=1),
    total_days: int = Query(default=21, ge=1),
):
    """Get celebratory recovery journey story and milestone certificate data."""
    persona = get_patient_persona(run_id)
    profile = get_persona_profile(persona)
    story = generate_recovery_story(
        run_id=run_id,
        patient_name=patient_name,
        recovery_day=recovery_day,
        total_days=total_days,
        persona_name=profile.display_name,
    )
    return story


# ── Care Messages ──────────────────────────────────────────────────────────────

@router.get("/care-messages/{run_id}", response_model=CareMessagesResponse)
def get_messages(run_id: str, unread_only: bool = Query(default=False)):
    """Get incoming care messages from family for the patient."""
    msgs = get_care_messages(run_id, unread_only=unread_only)
    all_msgs = get_care_messages(run_id, unread_only=True)
    return CareMessagesResponse(
        run_id=run_id,
        messages=[
            CareMessageResponse(
                message_id=m.message_id,
                sender_name=m.sender_name,
                emoji=m.emoji,
                text=m.text,
                text_hi=m.text_hi,
                timestamp=m.timestamp.isoformat(),
                read=m.read,
            )
            for m in msgs
        ],
        unread_count=len(all_msgs),
    )


@router.post("/care-messages/{run_id}/send", response_model=CareMessageResponse)
def send_message(run_id: str, body: SendCareMessageRequest):
    """Caregiver sends a 'thinking of you' care message to the patient."""
    msg = send_care_message(
        run_id=run_id,
        sender_name=body.sender_name,
        emoji=body.emoji,
        text=body.text,
        text_hi=body.text_hi or body.text,
    )
    return CareMessageResponse(
        message_id=msg.message_id,
        sender_name=msg.sender_name,
        emoji=msg.emoji,
        text=msg.text,
        text_hi=msg.text_hi,
        timestamp=msg.timestamp.isoformat(),
        read=msg.read,
    )


@router.post("/care-messages/{run_id}/read/{message_id}")
def mark_message_read(run_id: str, message_id: str):
    """Mark a care message as read by the patient."""
    found = mark_care_message_read(run_id, message_id)
    if not found:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"success": True, "message_id": message_id}
