import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";
import { voiceSafety } from "../services/voiceSafety";
import { VoiceDistressDetection } from "../api/types";

interface Props {
  onBack: () => void;
  onDistressDetected: (detection: VoiceDistressDetection) => Promise<void>;
}

export const VoiceSafetyScreen: React.FC<Props> = ({ onBack, onDistressDetected }) => {
  const [active, setActive] = useState(voiceSafety.isBackgroundListeningActive());
  const [lastDetection, setLastDetection] = useState<VoiceDistressDetection | null>(null);

  const toggleListening = () => {
    if (active) {
      voiceSafety.stopListening();
      setActive(false);
    } else {
      voiceSafety.startListening();
      setActive(true);
    }
  };

  const handleTestUtterance = async (phrase: string) => {
    const detection = voiceSafety.analyzeUtterance(phrase);
    setLastDetection(detection);
    if (detection.detected) {
      await onDistressDetected(detection);
    }
  };

  const testPhrases = ["Help me", "I fell", "बचाओ (Bachao)", "सांस नहीं आ रही", "I feel dizzy"];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>🎙️ Background Voice Safety</Text>
          <Text style={styles.headerSubtitle}>Bilingual emergency listening (EN + HI)</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={[styles.statusCard, active && styles.statusCardActive]}>
          <Text style={styles.statusDot}>{active ? "🟢" : "⚪"}</Text>
          <Text style={[styles.statusTitle, active && styles.statusTitleActive]}>
            {active ? "Background Safety Mic Active" : "Microphone Idle"}
          </Text>
          <Text style={styles.statusDesc}>
            {active
              ? "Listening for emergency distress words in background"
              : "Tap below to enable background emergency protection"}
          </Text>
          <TouchableOpacity
            onPress={toggleListening}
            activeOpacity={0.8}
            style={[styles.toggleBtn, active ? styles.toggleBtnOff : styles.toggleBtnOn]}
          >
            <Text style={styles.toggleBtnText}>
              {active ? "Disable Mic" : "Enable Safety Listening"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Test Chips */}
        <View style={styles.testSection}>
          <Text style={styles.testTitle}>Test Emergency Word Recognition:</Text>
          <View style={styles.chipsRow}>
            {testPhrases.map((phrase) => (
              <TouchableOpacity
                key={phrase}
                onPress={() => handleTestUtterance(phrase)}
                activeOpacity={0.8}
                style={styles.chip}
              >
                <Text style={styles.chipText}>"{phrase}"</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Detection Result */}
        {lastDetection && (
          <View style={[styles.resultCard, lastDetection.detected && styles.resultCardAlert]}>
            <Text style={[styles.resultTitle, lastDetection.detected && styles.resultTitleAlert]}>
              {lastDetection.detected ? "🚨 Emergency Distress Detected!" : "No Distress Detected"}
            </Text>
            <Text style={styles.resultBody}>
              Heard: "{lastDetection.heard_text}" · Match: {lastDetection.matched_phrase || "none"}
            </Text>
            {lastDetection.detected && (
              <Text style={styles.resultDispatch}>
                Alert automatically dispatched to Hospital Nursing Station.
              </Text>
            )}
          </View>
        )}
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
  backBtn: { marginRight: 12, paddingVertical: 4, paddingHorizontal: 6 },
  backBtnText: { fontSize: 15, color: "#2563EB", fontWeight: "600" },
  headerTextBlock: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "bold", color: "#0F172A" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  statusCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    marginBottom: 20,
  },
  statusCardActive: { backgroundColor: "#ECFDF5", borderColor: "#10B981" },
  statusDot: { fontSize: 36, marginBottom: 8 },
  statusTitle: { fontSize: 16, fontWeight: "bold", color: "#475569", marginBottom: 4 },
  statusTitleActive: { color: "#065F46" },
  statusDesc: { fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 16 },
  toggleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  toggleBtnOn: { backgroundColor: "#16A34A" },
  toggleBtnOff: { backgroundColor: "#DC2626" },
  toggleBtnText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 14 },
  testSection: { marginBottom: 20 },
  testTitle: { fontSize: 14, fontWeight: "bold", color: "#1E293B", marginBottom: 8 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 8,
  },
  chipText: { fontSize: 13, color: "#1E293B" },
  resultCard: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  resultCardAlert: { backgroundColor: "#FEE2E2", borderColor: "#F87171" },
  resultTitle: { fontSize: 13, fontWeight: "bold", color: "#475569" },
  resultTitleAlert: { color: "#991B1B" },
  resultBody: { fontSize: 13, color: "#334155", marginTop: 4 },
  resultDispatch: { fontSize: 12, color: "#B91C1C", marginTop: 4 },
});
