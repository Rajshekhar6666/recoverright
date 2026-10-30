"""
Wellness & Streak Engine for RecoverRight.

Tracks:
- Daily mood emoji check-ins (😊 great / 😐 okay / 😟 low)
- Medication adherence streak counter with milestone celebrations
- Recovery journey progress (Day X of Y)
- Caregiver "thinking of you" messages to patient
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Optional


class WellnessMood(str, Enum):
    GREAT = "great"   # 😊
    OKAY = "okay"     # 😐
    LOW = "low"       # 😟


@dataclass
class WellnessCheckIn:
    run_id: str
    mood: WellnessMood
    timestamp: datetime
    note: Optional[str] = None


@dataclass
class MedicationStreak:
    run_id: str
    current_streak: int
    longest_streak: int
    last_taken_date: Optional[date]
    milestone_reached: Optional[int]  # 7, 14, 21, or 30


@dataclass
class CaregiverMessage:
    message_id: str
    run_id: str
    sender_name: str
    emoji: str
    text: str
    text_hi: str
    timestamp: datetime
    read: bool = False


MILESTONE_DAYS = [7, 14, 21, 30]
VALID_CARE_EMOJIS = ["💙", "🙏", "❤️", "🌸", "⭐", "🤗", "💪", "😊"]

# In-memory stores (production: replace with DB)
_wellness_store: dict[str, list[WellnessCheckIn]] = {}
_streak_store: dict[str, MedicationStreak] = {}
_messages: dict[str, list[CaregiverMessage]] = {}


# ── Mood Check-In ──────────────────────────────────────────────────────────────

def record_mood(run_id: str, mood: WellnessMood, note: Optional[str] = None) -> WellnessCheckIn:
    """Record a mood emoji check-in for a patient."""
    checkin = WellnessCheckIn(run_id=run_id, mood=mood, timestamp=datetime.now(timezone.utc), note=note)
    _wellness_store.setdefault(run_id, []).append(checkin)
    return checkin


def get_mood_history(run_id: str, days: int = 7) -> list[WellnessCheckIn]:
    """Return mood check-ins within the last N days."""
    history = _wellness_store.get(run_id, [])
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return [c for c in history if c.timestamp >= cutoff]


# ── Medication Streak ──────────────────────────────────────────────────────────

def record_medication_taken(run_id: str, taken_date: Optional[date] = None) -> MedicationStreak:
    """Record that medication was taken. Increments or resets streak accordingly."""
    today = taken_date or date.today()
    streak = _streak_store.get(
        run_id,
        MedicationStreak(
            run_id=run_id,
            current_streak=0,
            longest_streak=0,
            last_taken_date=None,
            milestone_reached=None,
        ),
    )

    if streak.last_taken_date is None:
        streak.current_streak = 1
    elif (today - streak.last_taken_date).days == 1:
        streak.current_streak += 1
    elif today == streak.last_taken_date:
        pass  # Already taken today — no change
    else:
        streak.current_streak = 1  # Streak broken

    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    streak.last_taken_date = today

    # Detect exact milestone crossing
    milestone = None
    prev = streak.current_streak - 1
    for m in sorted(MILESTONE_DAYS, reverse=True):
        if streak.current_streak >= m and prev < m:
            milestone = m
            break
    streak.milestone_reached = milestone

    _streak_store[run_id] = streak
    return streak


def get_streak(run_id: str) -> MedicationStreak:
    """Return the current streak info for a patient."""
    return _streak_store.get(
        run_id,
        MedicationStreak(
            run_id=run_id,
            current_streak=0,
            longest_streak=0,
            last_taken_date=None,
            milestone_reached=None,
        ),
    )


def get_streak_message(streak: MedicationStreak, patient_name: str = "Friend", lang: str = "en") -> str:
    """Return a persona-flavored streak message."""
    days = streak.current_streak
    if days == 0:
        en = "Let's start your medicine streak today! 💊"
        hi = "आज दवाई लेकर अपनी स्ट्रीक शुरू करें! 💊"
    elif days >= 30:
        en = f"🏆 INCREDIBLE {patient_name}! 30 days of perfect medication! You are a recovery champion!"
        hi = f"🏆 अविश्वसनीय {patient_name}! 30 दिन की परफेक्ट दवाई! आप रिकवरी चैंपियन हैं!"
    elif days >= 21:
        en = f"🥇 Amazing {patient_name}! 21-day streak — 3 full weeks of dedication!"
        hi = f"🥇 शानदार {patient_name}! 21 दिन की स्ट्रीक — 3 हफ्तों की मेहनत!"
    elif days >= 14:
        en = f"⭐ Excellent {patient_name}! 2 weeks straight — halfway to the goal!"
        hi = f"⭐ बेहतरीन {patient_name}! 2 हफ्ते लगातार — लक्ष्य का आधा रास्ता!"
    elif days >= 7:
        en = f"🔥 Great job {patient_name}! One full week of medicines on time!"
        hi = f"🔥 शाबाश {patient_name}! एक पूरा हफ्ता दवाई समय पर!"
    elif days >= 3:
        en = f"✨ {days}-day streak, {patient_name}! Keep the momentum going!"
        hi = f"✨ {days} दिन की स्ट्रीक, {patient_name}! यही गति बनाए रखें!"
    else:
        en = f"💊 Day {days} — good start {patient_name}! See you tomorrow!"
        hi = f"💊 दिन {days} — अच्छी शुरुआत {patient_name}! कल फिर मिलते हैं!"
    return hi if lang == "hi" else en


# ── Recovery Progress ──────────────────────────────────────────────────────────

def get_recovery_progress(recovery_day: int, total_days: int = 21) -> dict:
    """Return recovery journey progress with milestone celebration if applicable."""
    pct = min(100, round(recovery_day / max(total_days, 1) * 100))
    prev_pct = min(100, round((recovery_day - 1) / max(total_days, 1) * 100))
    filled = pct // 10
    progress_bar = "█" * filled + "░" * (10 - filled)

    milestones = {
        25: "Quarter way there! 🌱",
        50: "Halfway champion! 🌟",
        75: "Almost there! 🎯",
        100: "Full recovery! 🏆",
    }
    celebration = None
    for milestone_pct, msg in sorted(milestones.items()):
        if pct >= milestone_pct and prev_pct < milestone_pct:
            celebration = msg
            break

    return {
        "recovery_day": recovery_day,
        "total_days": total_days,
        "percent": pct,
        "progress_bar": progress_bar,
        "celebration": celebration,
    }


# ── Caregiver Messages ─────────────────────────────────────────────────────────

def send_care_message(
    run_id: str,
    sender_name: str,
    emoji: str,
    text: str,
    text_hi: str,
) -> CaregiverMessage:
    """Caregiver sends a care message to the patient."""
    if emoji not in VALID_CARE_EMOJIS:
        emoji = "💙"
    msg = CaregiverMessage(
        message_id=str(uuid.uuid4()),
        run_id=run_id,
        sender_name=sender_name,
        emoji=emoji,
        text=text,
        text_hi=text_hi,
        timestamp=datetime.now(timezone.utc),
        read=False,
    )
    _messages.setdefault(run_id, []).append(msg)
    return msg


def get_care_messages(run_id: str, unread_only: bool = False) -> list[CaregiverMessage]:
    """Return care messages for a patient, newest first."""
    msgs = _messages.get(run_id, [])
    if unread_only:
        msgs = [m for m in msgs if not m.read]
    return sorted(msgs, key=lambda m: m.timestamp, reverse=True)


def mark_care_message_read(run_id: str, message_id: str) -> bool:
    """Mark a care message as read. Returns True if found."""
    for msg in _messages.get(run_id, []):
        if msg.message_id == message_id:
            msg.read = True
            return True
    return False


# ── Recovery Story & Milestone Export ─────────────────────────────────────────

def generate_recovery_story(
    run_id: str,
    patient_name: str = "Friend",
    recovery_day: int = 7,
    total_days: int = 21,
    persona_name: str = "Maa",
) -> dict:
    """Generates a celebratory recovery story milestone summary."""
    streak = get_streak(run_id)
    history = get_mood_history(run_id, days=30)
    mood_counts = {
        "great": sum(1 for m in history if m.mood == WellnessMood.GREAT),
        "okay": sum(1 for m in history if m.mood == WellnessMood.OKAY),
        "low": sum(1 for m in history if m.mood == WellnessMood.LOW),
    }

    pct = min(100, round((recovery_day / max(total_days, 1)) * 100))

    if pct >= 100:
        badge = "🏆 Full Recovery Champion"
        title = "Journey Complete — Full Health Restored"
    elif pct >= 75:
        badge = "🎯 Final Stretch Pioneer"
        title = "75% Recovery Milestone Reached"
    elif pct >= 50:
        badge = "🌟 Halfway Champion"
        title = "Halfway Milestone Celebrated"
    elif pct >= 25:
        badge = "🌱 Steady Foundations Award"
        title = "First Quarter Completed"
    else:
        badge = "✨ Dedicated Healing Starter"
        title = "Healing Journey Underway"

    story_en = (
        f"{patient_name} has completed {recovery_day} of {total_days} days on their recovery journey ({pct}%). "
        f"With a {streak.current_streak}-day medication adherence streak, your dedication to healing has been extraordinary. "
        f"Your care companion {persona_name} celebrates your progress!"
    )
    story_hi = (
        f"{patient_name} ने अपनी रिकवरी यात्रा के {total_days} में से {recovery_day} दिन ({pct}%) पूरे कर लिए हैं। "
        f"{streak.current_streak} दिन की लगातार दवाई स्ट्रीक के साथ, आपकी मेहनत सराहनीय है। "
        f"आपके साथी {persona_name} को आप पर गर्व है!"
    )

    return {
        "run_id": run_id,
        "patient_name": patient_name,
        "recovery_day": recovery_day,
        "total_days": total_days,
        "percent_complete": pct,
        "current_streak": streak.current_streak,
        "longest_streak": streak.longest_streak,
        "milestone_badge": badge,
        "milestone_title": title,
        "story_en": story_en,
        "story_hi": story_hi,
        "mood_distribution": mood_counts,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Test helpers ───────────────────────────────────────────────────────────────

def _reset_wellness_state() -> None:
    """Clear all in-memory state. For testing only."""
    _wellness_store.clear()
    _streak_store.clear()
    _messages.clear()
