/**
 * Wellness & Streak Engine for RecoverRight Mobile.
 *
 * Tracks:
 * - Daily mood emoji check-ins (great / okay / low)
 * - Medication adherence streak with milestone celebrations
 * - Recovery journey progress (Day X of Y)
 * - Caregiver "thinking of you" messages to patient
 */

export type WellnessMood = 'great' | 'okay' | 'low';

export interface MoodCheckIn {
  mood: WellnessMood;
  timestamp: string;  // ISO string
  note?: string;
}

export interface MedicationStreak {
  currentStreak: number;
  longestStreak: number;
  lastTakenDate?: string;        // YYYY-MM-DD
  milestoneReached?: number;     // 7, 14, 21, or 30
}

export interface RecoveryProgress {
  recoveryDay: number;
  totalDays: number;
  percent: number;
  progressBar: string;           // e.g. "█████░░░░░"
  celebration?: string;
}

export interface CaregiverMessage {
  messageId: string;
  senderName: string;
  emoji: string;
  text: string;
  textHi: string;
  timestamp: string;
  read: boolean;
}

const MILESTONE_DAYS = [7, 14, 21, 30];

// In-memory stores (production: replace with AsyncStorage + API sync)
let _moodHistory: MoodCheckIn[] = [];
let _streak: MedicationStreak = { currentStreak: 0, longestStreak: 0 };
let _careMessages: CaregiverMessage[] = [];

// ── Mood ───────────────────────────────────────────────────────────────────────

export function recordMood(mood: WellnessMood, note?: string): MoodCheckIn {
  const checkIn: MoodCheckIn = { mood, timestamp: new Date().toISOString(), note };
  _moodHistory.push(checkIn);
  return checkIn;
}

export function getMoodHistory(days: number = 7): MoodCheckIn[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return _moodHistory.filter((m) => m.timestamp >= cutoff);
}

// ── Streak ─────────────────────────────────────────────────────────────────────

export function recordMedicationTaken(takenDate?: string): MedicationStreak {
  const today = takenDate ?? new Date().toISOString().split('T')[0];

  if (!_streak.lastTakenDate) {
    _streak.currentStreak = 1;
  } else {
    const last = new Date(_streak.lastTakenDate).getTime();
    const curr = new Date(today).getTime();
    const diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      _streak.currentStreak += 1;
    } else if (diffDays === 0) {
      // Same day — no change
    } else {
      _streak.currentStreak = 1;
    }
  }

  _streak.longestStreak = Math.max(_streak.longestStreak, _streak.currentStreak);
  _streak.lastTakenDate = today;

  // Detect exact milestone crossing
  const prev = _streak.currentStreak - 1;
  let milestone: number | undefined;
  for (const m of [...MILESTONE_DAYS].reverse()) {
    if (_streak.currentStreak >= m && prev < m) {
      milestone = m;
      break;
    }
  }
  _streak.milestoneReached = milestone;

  return { ..._streak };
}

export function getStreak(): MedicationStreak {
  return { ..._streak };
}

export function getStreakMessage(streak: MedicationStreak, patientName: string = 'Friend', lang: 'en' | 'hi' = 'en'): string {
  const days = streak.currentStreak;
  let en: string;
  let hi: string;

  if (days === 0) {
    en = 'Start your medicine streak today! 💊';
    hi = 'आज दवाई लेकर स्ट्रीक शुरू करें! 💊';
  } else if (days >= 30) {
    en = `🏆 INCREDIBLE ${patientName}! 30 days of perfect medication!`;
    hi = `🏆 अविश्वसनीय ${patientName}! 30 दिन की परफेक्ट दवाई!`;
  } else if (days >= 21) {
    en = `🥇 Amazing ${patientName}! 21-day streak — 3 weeks of dedication!`;
    hi = `🥇 शानदार ${patientName}! 21 दिन की स्ट्रीक!`;
  } else if (days >= 14) {
    en = `⭐ Excellent ${patientName}! 2 weeks straight!`;
    hi = `⭐ बेहतरीन ${patientName}! 2 हफ्ते लगातार!`;
  } else if (days >= 7) {
    en = `🔥 Great job ${patientName}! One full week of medicines on time!`;
    hi = `🔥 शाबाश ${patientName}! एक पूरा हफ्ता दवाई समय पर!`;
  } else if (days >= 3) {
    en = `✨ ${days}-day streak, ${patientName}! Keep the momentum!`;
    hi = `✨ ${days} दिन की स्ट्रीक, ${patientName}!`;
  } else {
    en = `💊 Day ${days} — good start ${patientName}!`;
    hi = `💊 दिन ${days} — अच्छी शुरुआत ${patientName}!`;
  }

  return lang === 'hi' ? hi : en;
}

// ── Recovery Progress ──────────────────────────────────────────────────────────

export function getRecoveryProgress(recoveryDay: number, totalDays: number = 21): RecoveryProgress {
  const clampedDay = Math.max(0, recoveryDay);
  const pct = Math.min(100, Math.round((clampedDay / Math.max(totalDays, 1)) * 100));
  const prevPct = Math.min(100, Math.round(((clampedDay - 1) / Math.max(totalDays, 1)) * 100));
  const filled = Math.floor(pct / 10);
  const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const milestoneMessages: Record<number, string> = {
    25: 'Quarter way there! 🌱',
    50: 'Halfway champion! 🌟',
    75: 'Almost there! 🎯',
    100: 'Full recovery! 🏆',
  };

  let celebration: string | undefined;
  for (const [m, msg] of Object.entries(milestoneMessages)) {
    const milestone = Number(m);
    if (pct >= milestone && prevPct < milestone) {
      celebration = msg;
      break;
    }
  }

  return { recoveryDay: clampedDay, totalDays, percent: pct, progressBar, celebration };
}

// ── Caregiver Messages ─────────────────────────────────────────────────────────

export function addCaregiverMessage(msg: CaregiverMessage): void {
  _careMessages.unshift(msg);
}

export function getCaregiverMessages(unreadOnly: boolean = false): CaregiverMessage[] {
  if (unreadOnly) return _careMessages.filter((m) => !m.read);
  return [..._careMessages];
}

export function markCareMessageRead(messageId: string): boolean {
  const msg = _careMessages.find((m) => m.messageId === messageId);
  if (msg) {
    msg.read = true;
    return true;
  }
  return false;
}

// ── Test helpers ───────────────────────────────────────────────────────────────

export function _resetWellnessState(): void {
  _moodHistory = [];
  _streak = { currentStreak: 0, longestStreak: 0 };
  _careMessages = [];
}
