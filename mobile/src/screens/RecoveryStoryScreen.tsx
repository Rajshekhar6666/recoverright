import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Share,
} from "react-native";
import { apiClient } from "../api/client";
import { getRecoveryProgress, getStreak } from "../services/wellness";
import { getPersonaProfile, loadPersonaPreference } from "../services/voicePersona";

interface Props {
  patientName: string;
  runId?: string;
  recoveryDay?: number;
  totalDays?: number;
  onBack: () => void;
}

export const RecoveryStoryScreen: React.FC<Props> = ({
  patientName = "Patient",
  runId,
  recoveryDay = 7,
  totalDays = 21,
  onBack,
}) => {
  const [serverStory, setServerStory] = useState<{
    milestone_badge?: string;
    certificate_title?: string;
    narrative_hi?: string;
    narrative_en?: string;
  } | null>(null);

  const streak = getStreak();
  const progress = getRecoveryProgress(recoveryDay, totalDays);
  const personaId = loadPersonaPreference();
  const persona = getPersonaProfile(personaId);

  useEffect(() => {
    if (!runId) return;
    fetch(`${apiClient.getBaseUrl()}/wellness/recovery-story/${runId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setServerStory(data);
      })
      .catch(() => {});
  }, [runId]);

  const getTribute = () => {
    if (serverStory?.narrative_hi) return serverStory.narrative_hi;
    if (personaId === "caring_maa") {
      return `बेटा ${patientName}, माँ को तुम पर बहुत गर्व है! तुमने इतनी हिम्मत और अनुशासन के साथ अपनी रिकवरी के दिन बिताए हैं। दवाई समय पर ली, आराम किया — अब तुम पूरी तरह ठीक होने की ओर बढ़ रहे हो। मेरा आशीर्वाद हमेशा तुम्हारे साथ है! ❤️`;
    } else if (personaId === "friendly_bhai") {
      return `अरे ${patientName} भाई! कमाल कर दिया तुमने! ${streak.currentStreak} दिन की स्ट्रीक और रिकवरी में छक्के छुड़ा दिए! अपन दोनों जीत रहे हैं भाई, अब जल्द ही मैदान में लौटेंगे! 💪`;
    } else if (personaId === "soothing_didi") {
      return `प्रिय ${patientName}, दीदी बहुत खुश है तुम्हारी इस लगन से। तुमने हर दिन बिना नागा अपनी देखभाल की है। यह सर्टिफिकेट तुम्हारी इसी धैर्य और ताकत का प्रमाण है। 🌸`;
    } else if (personaId === "steady_doctor") {
      return `Congratulations ${patientName}. Clinically, maintaining ${streak.currentStreak} consecutive days of medical compliance demonstrates ideal recovery adherence. You have significantly lowered complication risks.`;
    } else {
      return `आशीर्वाद ${patientName}। स्वास्थ्य साधना का सबसे बड़ा फल है। आपकी निरंतरता और धीरज ने शरीर को स्वस्थ किया है। 🧘`;
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `🏆 RecoverRight Recovery Milestone!\n\nPatient: ${patientName}\nProgress: Day ${recoveryDay}/${totalDays} (${progress.percent}%)\nStreak: ${streak.currentStreak} Days\n\n"${getTribute()}"\n\n— RecoverRight Care`,
      });
    } catch (_) {}
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recovery Certificate & Story</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Certificate Card */}
        <View style={styles.certCard}>
          <Text style={styles.certEmoji}>🏆</Text>
          <Text style={styles.certTitle}>
            {serverStory?.certificate_title || "Certificate of Recovery Resilience"}
          </Text>
          <Text style={styles.certSubtitle}>Awarded to</Text>
          <Text style={styles.patientName}>{patientName}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{streak.currentStreak}d</Text>
              <Text style={styles.statLabel}>Adherence Streak</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{progress.percent}%</Text>
              <Text style={styles.statLabel}>Recovery Completed</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>Day {recoveryDay}</Text>
              <Text style={styles.statLabel}>of {totalDays} Days</Text>
            </View>
          </View>

          {/* Tribute Box */}
          <View style={styles.tributeBox}>
            <Text style={styles.tributeAuthor}>
              {persona.emoji} Personal Tribute from {persona.displayName} ({persona.displayNameHi}):
            </Text>
            <Text style={styles.tributeText}>"{getTribute()}"</Text>
          </View>

          {/* Share Button */}
          <TouchableOpacity onPress={handleShare} activeOpacity={0.8} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>📤 Share Milestone with Family</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  backBtn: { marginRight: 10, padding: 4 },
  backBtnText: { fontSize: 22, color: "#2563EB" },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#1E293B" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  certCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FCD34D",
    padding: 20,
    alignItems: "center",
  },
  certEmoji: { fontSize: 44, marginBottom: 8 },
  certTitle: { fontSize: 18, fontWeight: "bold", color: "#78350F", textAlign: "center", marginBottom: 4 },
  certSubtitle: { fontSize: 12, color: "#92400E", marginBottom: 4 },
  patientName: { fontSize: 22, fontWeight: "bold", color: "#1E293B", marginBottom: 16 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginBottom: 16 },
  statBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  statVal: { fontSize: 16, fontWeight: "bold", color: "#B45309" },
  statLabel: { fontSize: 10, color: "#78350F", textAlign: "center", marginTop: 2 },
  tributeBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 16,
  },
  tributeAuthor: { fontSize: 12, fontWeight: "bold", color: "#92400E", marginBottom: 6 },
  tributeText: { fontSize: 13, color: "#1E293B", fontStyle: "italic", lineHeight: 20 },
  shareBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  shareBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 14 },
});
