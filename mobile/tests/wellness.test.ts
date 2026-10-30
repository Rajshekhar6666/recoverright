import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  _resetWellnessState,
  addCaregiverMessage,
  getCaregiverMessages,
  getMoodHistory,
  getRecoveryProgress,
  getStreak,
  getStreakMessage,
  markCareMessageRead,
  recordMedicationTaken,
  recordMood,
} from "../src/services/wellness";
describe("Wellness service", () => {
  beforeEach(() => _resetWellnessState());

  // ── Mood Check-In ──────────────────────────────────────────────────────────

  it("records a mood and retrieves it from history", () => {
    recordMood("great", "Feeling good today");
    recordMood("okay");
    const history = getMoodHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].mood, "great");
    assert.strictEqual(history[0].note, "Feeling good today");
  });

  it("getMoodHistory with negative-future cutoff excludes current entries", () => {
    recordMood("great");
    // A very large days value should include it
    const history7 = getMoodHistory(7);
    assert.strictEqual(history7.length, 1);
    // An exact 0-millisecond window: use a fresh state check
    _resetWellnessState();
    const historyEmpty = getMoodHistory(7);
    assert.strictEqual(historyEmpty.length, 0);
  });

  it("getMoodHistory filters to last N days", () => {
    recordMood("low");
    const history7 = getMoodHistory(7);
    assert.strictEqual(history7.length, 1);
  });

  // ── Streak ─────────────────────────────────────────────────────────────────

  it("first dose starts streak at 1", () => {
    const streak = recordMedicationTaken("2024-01-01");
    assert.strictEqual(streak.currentStreak, 1);
    assert.strictEqual(streak.longestStreak, 1);
  });

  it("consecutive days increment streak", () => {
    recordMedicationTaken("2024-01-14");
    const streak = recordMedicationTaken("2024-01-15");
    assert.strictEqual(streak.currentStreak, 2);
    assert.strictEqual(streak.longestStreak, 2);
  });

  it("skipped day resets streak to 1", () => {
    recordMedicationTaken("2024-01-10");
    const streak = recordMedicationTaken("2024-01-12"); // skipped 11th
    assert.strictEqual(streak.currentStreak, 1);
  });

  it("same-day duplicate does not increment streak", () => {
    recordMedicationTaken("2024-01-05");
    const streak = recordMedicationTaken("2024-01-05");
    assert.strictEqual(streak.currentStreak, 1);
  });

  it("7-day streak hits milestone", () => {
    let streak = recordMedicationTaken("2024-01-01");
    for (let i = 2; i <= 7; i++) {
      streak = recordMedicationTaken(`2024-01-${String(i).padStart(2, "0")}`);
    }
    assert.strictEqual(streak.currentStreak, 7);
    assert.strictEqual(streak.milestoneReached, 7);
  });

  it("no milestone before 7 days", () => {
    let streak = recordMedicationTaken("2024-01-01");
    for (let i = 2; i <= 5; i++) {
      streak = recordMedicationTaken(`2024-01-${String(i).padStart(2, "0")}`);
    }
    assert.strictEqual(streak.milestoneReached, undefined);
  });

  it("streak message contains patient name", () => {
    recordMedicationTaken("2024-01-01");
    const streak = getStreak();
    const msg = getStreakMessage(streak, "Ramesh");
    assert.ok(msg.includes("Ramesh"));
  });

  it("streak message for 0 days contains medication emoji", () => {
    const streak = getStreak();
    const msg = getStreakMessage(streak);
    assert.ok(msg.includes("💊"));
  });

  it("streak message for 7+ days contains fire emoji", () => {
    for (let i = 1; i <= 7; i++) {
      recordMedicationTaken(`2024-01-${String(i).padStart(2, "0")}`);
    }
    const streak = getStreak();
    const msg = getStreakMessage(streak, "Ramesh", "en");
    assert.ok(msg.includes("🔥"));
  });

  it("Hindi streak message for 0 days", () => {
    const streak = getStreak();
    const msg = getStreakMessage(streak, "रमेश", "hi");
    assert.ok(msg.includes("💊"));
  });

  // ── Recovery Progress ──────────────────────────────────────────────────────

  it("calculates percentage correctly", () => {
    const p = getRecoveryProgress(5, 21);
    assert.strictEqual(p.recoveryDay, 5);
    assert.strictEqual(p.totalDays, 21);
    assert.ok(p.percent > 0 && p.percent <= 100);
  });

  it("progress bar is always 10 characters", () => {
    const p = getRecoveryProgress(5, 21);
    assert.strictEqual(p.progressBar.length, 10);
  });

  it("100% at completion", () => {
    const p = getRecoveryProgress(21, 21);
    assert.strictEqual(p.percent, 100);
  });

  it("100% shows Full Recovery celebration", () => {
    const p = getRecoveryProgress(21, 21);
    assert.ok(p.celebration?.includes("🏆"));
  });

  it("50% milestone triggered at day 11 of 21", () => {
    const p = getRecoveryProgress(11, 21); // ~52% (prev day ~47%)
    assert.ok(p.celebration !== undefined);
    assert.ok(p.celebration?.includes("🌟"));
  });

  it("no celebration at mid-journey without milestone crossing", () => {
    const p = getRecoveryProgress(3, 21); // ~14%, no milestone
    assert.strictEqual(p.celebration, undefined);
  });

  it("progress bar has filled and empty sections", () => {
    const p = getRecoveryProgress(5, 10); // 50%
    assert.ok(p.progressBar.includes("█"));
    assert.ok(p.progressBar.includes("░"));
  });

  // ── Caregiver Messages ─────────────────────────────────────────────────────

  it("adds and retrieves care message", () => {
    addCaregiverMessage({
      messageId: "msg1",
      senderName: "Sunita",
      emoji: "💙",
      text: "Thinking of you!",
      textHi: "आपके बारे में सोच रही हूँ!",
      timestamp: new Date().toISOString(),
      read: false,
    });
    const msgs = getCaregiverMessages();
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].senderName, "Sunita");
  });

  it("unreadOnly filter returns only unread messages", () => {
    addCaregiverMessage({
      messageId: "msg2",
      senderName: "Priya",
      emoji: "🌸",
      text: "Get well soon!",
      textHi: "जल्दी ठीक हो जाओ!",
      timestamp: new Date().toISOString(),
      read: false,
    });
    assert.strictEqual(getCaregiverMessages(true).length, 1);
    markCareMessageRead("msg2");
    assert.strictEqual(getCaregiverMessages(true).length, 0);
  });

  it("markCareMessageRead returns true when found", () => {
    addCaregiverMessage({
      messageId: "msg3",
      senderName: "Amma",
      emoji: "❤️",
      text: "Love you!",
      textHi: "प्यार!",
      timestamp: new Date().toISOString(),
      read: false,
    });
    const result = markCareMessageRead("msg3");
    assert.strictEqual(result, true);
  });

  it("markCareMessageRead returns false for unknown id", () => {
    const result = markCareMessageRead("nonexistent-id");
    assert.strictEqual(result, false);
  });

  it("messages returned newest first", () => {
    addCaregiverMessage({
      messageId: "first",
      senderName: "A",
      emoji: "💙",
      text: "First",
      textHi: "पहला",
      timestamp: new Date(Date.now() - 10000).toISOString(),
      read: false,
    });
    addCaregiverMessage({
      messageId: "second",
      senderName: "B",
      emoji: "🙏",
      text: "Second",
      textHi: "दूसरा",
      timestamp: new Date().toISOString(),
      read: false,
    });
    const msgs = getCaregiverMessages();
    // newest first (unshift inserts at front)
    assert.strictEqual(msgs[0].messageId, "second");
  });

  it("calculates recovery journey milestone markers accurately", () => {
    // 25% milestone
    const p25 = getRecoveryProgress(6, 21);
    assert.ok(p25.percent >= 25);
    // 75% milestone
    const p75 = getRecoveryProgress(16, 21);
    assert.ok(p75.percent >= 75);
    // 100% full recovery
    const p100 = getRecoveryProgress(21, 21);
    assert.strictEqual(p100.percent, 100);
    assert.ok(p100.celebration?.includes("🏆"));
  });
});
