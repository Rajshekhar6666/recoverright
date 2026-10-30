"""Conversational Voice Dialogue and Verbal Teach-Back Router."""
from fastapi import APIRouter, HTTPException

from app.services.voice_dialogue import (
    TeachBackEvaluationRequest,
    TeachBackEvaluationResponse,
    VoiceDialogueRequest,
    VoiceDialogueResponse,
    evaluate_teach_back_explanation,
    process_voice_dialogue,
)

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/dialogue", response_model=VoiceDialogueResponse)
def handle_voice_dialogue(req: VoiceDialogueRequest):
    """Processes natural speech queries grounded strictly in the patient's recovery plan."""
    try:
        return process_voice_dialogue(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice dialogue processing failed: {exc}")


@router.post("/teach-back-evaluate", response_model=TeachBackEvaluationResponse)
def evaluate_verbal_teach_back(req: TeachBackEvaluationRequest):
    """Evaluates verbal patient comprehension against prescribed instructions."""
    try:
        return evaluate_teach_back_explanation(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Teach-back evaluation failed: {exc}")
