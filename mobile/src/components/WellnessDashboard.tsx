import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { apiClient } from "../api/client";
import {
  CaregiverMessage,
  MedicationStreak,
  RecoveryProgress,
  WellnessMood,
  getCaregiverMessages,
  getRecoveryProgress,
  getStreak,
  getStreakMessage,
  markCareMessageRead,
  recordMood,
} from "../services/wellness";

interface Props {
  patientName?: string;
  recoveryDay?: number;
  totalRecoveryDays?: number;
  lang?: "en" | "hi";
  onMoodRecorded?: (mood: WellnessMood) => void;
  runId?: string;
  onNavigateToStory?: () => void;
}

const MOOD_OPTIONS: { mood: WellnessMood; emoji: string; labelEn: string; labelHi: string }[] = [
  { mood: "great", emoji: "😊", labelEn: "Great", labelHi: "बढ़िया" },
  { mood: "okay", emoji: "😐", labelEn: "Okay", labelHi: "ठीक है" },
  { mood: "low", emoji: "😟", labelEn: "Low", labelHi: "थका हुआ" },
];

const DAILY_CARE_MESSAGES = [
  "Every step forward in recovery is a victory. You're doing great! 🌟",
  "Your strength and courage inspire everyone around you. Keep going! 💪",
  "Small consistent steps lead to big recovery milestones. One day at a time. 🌱",
  "The hospital team is rooting for you every single day. You've got this! 🏥",
  "Your body is incredible — it knows how to heal. Trust the process. ✨",
  "Rest, medicine, and love — that's your recovery formula. 💙",
];

function getDailyCareMessage(): string {
  const dayIndex = new Date().getDate() % DAILY_CARE_MESSAGES.length;
  return DAILY_CARE_MESSAGES[dayIndex];
}

export const WellnessDashboard: React.FC<Props> = ({
  patientName = "Friend",
  recoveryDay,
  totalRecoveryDays = 21,
  lang = "en",
  onMoodRecorded,
  runId,
  onNavigateToStory,
}) => {
  const [lastMood, setLastMood] = useState<WellnessMood | null>(null);
  const [moodTapped, setMoodTapped] = useState(false);
  const [streak] = useState<MedicationStreak>(() => getStreak());
  const [unreadMessages] = useState<CaregiverMessage[]>(() => getCaregiverMessages(true));
  const [shownMessage, setShownMessage] = useState<CaregiverMessage | null>(
    unreadMessages.length > 0 ? unreadMessages[0] : null
  );

  const progress: RecoveryProgress | null =
    recoveryDay !== undefined ? getRecoveryProgress(recoveryDay, totalRecoveryDays) : null;

  const streakMsg = getStreakMessage(streak, patientName, lang);

  function handleMoodTap(mood: WellnessMood) {
    recordMood(mood);
    setLastMood(mood);
    setMoodTapped(true);
    if (onMoodRecorded) onMoodRecorded(mood);
    if (runId) {
      try {
        fetch(`${apiClient.getBaseUrl()}/wellness/mood/${runId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mood }),
        }).catch(() => {});
      } catch {
        // offline
      }
    }
  }

  function dismissCareMessage() {
    if (shownMessage) {
      markCareMessageRead(shownMessage.messageId);
      setShownMessage(null);
    }
  }

  const moodResponse =
    lastMood === "great" ? "😊 Great! Glad to hear that." :
    lastMood === "okay" ? "😐 OK, take it easy." : "😟 Noted. Rest well.";

  return (
    <View>
      {/* Incoming Care Message */}
      {shownMessage && (
        <View style={styles.careMsg}>
          <View style={styles.careMsgLeft}>
            <Text style={styles.careMsgEmoji}>{shownMessage.emoji}</Text>
            <View style={styles.careMsgText}>
              <Text style={styles.careMsgSender}>{shownMessage.senderName} sent you a message</Text>
              <Text style={styles.careMsgBody}>
                {lang === "hi" && shownMessage.textHi ? shownMessage.textHi : shownMessage.text}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={dismissCareMessage} style={styles.dismissBtn} activeOpacity={0.7}>
            <Text style={styles.dismissBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mood Check-In */}
      <View style={styles.moodCard}>
        <Text style={styles.moodQuestion}>
          {lang === "hi" ? "आज आप कैसा महसूस कर रहे हैं?" : "How are you feeling today?"}
        </Text>
        {moodTapped ? (
          <Text style={styles.moodResponse}>{moodResponse}</Text>
        ) : (
          <View style={styles.moodRow}>
            {MOOD_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.mood}
                onPress={() => handleMoodTap(opt.mood)}
                activeOpacity={0.8}
                style={styles.moodBtn}
              >
                <Text style={styles.moodEmoji}>{opt.emoji}</Text>
                <Text style={styles.moodLabel}>
                  {lang === "hi" ? opt.labelHi : opt.labelEn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Medication Streak */}
      <View style={[styles.streakCard, streak.currentStreak >= 7 && styles.streakCardHot]}>
        <Text style={styles.streakEmoji}>{streak.currentStreak >= 7 ? "🔥" : "💊"}</Text>
        <View style={styles.streakInfo}>
          <Text style={styles.streakTitle}>
            {streak.currentStreak > 0
              ? `${streak.currentStreak}-day streak!`
              : lang === "hi" ? "दवाई स्ट्रीक शुरू करें" : "Start your medicine streak"}
          </Text>
          <Text style={styles.streakMsg}>{streakMsg}</Text>
        </View>
        {onNavigateToStory && (
          <TouchableOpacity onPress={onNavigateToStory} activeOpacity={0.8} style={styles.storyBtn}>
            <Text style={styles.storyBtnText}>
              {streak.milestoneReached ? `🏆 ${streak.milestoneReached}d` : "📜 Story"}
            </Text>
          </TouchableOpacity>
        )}
        {!onNavigateToStory && streak.milestoneReached ? (
          <View style={styles.milestoneBadge}>
            <Text style={styles.milestoneBadgeText}>🏆 {streak.milestoneReached}d</Text>
          </View>
        ) : null}
      </View>

      {/* Recovery Progress Bar */}
      {progress && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>
              {lang === "hi"
                ? `रिकवरी दिन ${progress.recoveryDay} / ${progress.totalDays}`
                : `Recovery Day ${progress.recoveryDay} of ${progress.totalDays}`}
            </Text>
            <Text style={styles.progressLabel}>{progress.percent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress.percent}%` as any }]} />
          </View>
          {progress.celebration ? (
            <Text style={styles.celebration}>{progress.celebration}</Text>
          ) : null}
        </View>
      )}

      {/* Daily Care Message */}
      <View style={styles.dailyCareCard}>
        <Text style={styles.dailyCareText}>
          <Text style={styles.dailyCareLabel}>💜 Today's care message: </Text>
          {getDailyCareMessage()}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  careMsg: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  careMsgLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  careMsgEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  careMsgText: {
    flex: 1,
  },
  careMsgSender: {
    fontWeight: "bold",
    fontSize: 13,
    color: "#1E40AF",
  },
  careMsgBody: {
    fontSize: 13,
    color: "#1E293B",
    marginTop: 2,
  },
  dismissBtn: {
    marginLeft: 8,
    padding: 4,
  },
  dismissBtnText: {
    fontSize: 20,
    color: "#64748B",
  },
  moodCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  moodQuestion: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#64748B",
    marginBottom: 10,
  },
  moodResponse: {
    textAlign: "center",
    color: "#22C55E",
    fontWeight: "bold",
    fontSize: 14,
  },
  moodRow: {
    flexDirection: "row",
  },
  moodBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 4,
  },
  moodEmoji: {
    fontSize: 26,
  },
  moodLabel: {
    fontSize: 11,
    color: "#475569",
    marginTop: 4,
  },
  streakCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  streakCardHot: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  streakEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  streakInfo: {
    flex: 1,
  },
  streakTitle: {
    fontWeight: "bold",
    color: "#1E293B",
    fontSize: 14,
  },
  streakMsg: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  storyBtn: {
    marginLeft: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 8,
  },
  storyBtnText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#92400E",
  },
  milestoneBadge: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 8,
  },
  milestoneBadgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#92400E",
  },
  progressCard: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#166534",
  },
  progressTrack: {
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    height: 10,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#22C55E",
    height: "100%",
    borderRadius: 999,
  },
  celebration: {
    marginTop: 8,
    textAlign: "center",
    fontWeight: "bold",
    color: "#166534",
    fontSize: 14,
  },
  dailyCareCard: {
    backgroundColor: "#FDF4FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    borderRadius: 14,
    padding: 14,
  },
  dailyCareText: {
    fontSize: 13,
    color: "#581C87",
    fontStyle: "italic",
  },
  dailyCareLabel: {
    fontWeight: "bold",
    fontStyle: "normal",
  },
});
