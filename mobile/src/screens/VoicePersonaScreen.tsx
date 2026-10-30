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
import {
  generateEmotionalCounselingReply,
  generatePersonaAlarmScript,
  listPersonas,
  loadEmotionalStatePreference,
  loadPersonaPreference,
  PatientEmotionalState,
  personalizeGreeting,
  saveEmotionalStatePreference,
  savePersonaPreference,
  VoicePersonaId,
} from "../services/voicePersona";
import { speakPersonaText, stopSpeech } from "../services/tts";

interface Props {
  patientName?: string;
  onSelectPersona?: (personaId: VoicePersonaId) => void;
  onBack?: () => void;
}

const EMOTIONAL_OPTIONS: {
  id: PatientEmotionalState;
  emoji: string;
  label: string;
  labelHi: string;
  sub: string;
}[] = [
  { id: "general", emoji: "😊", label: "General", labelHi: "सामान्य स्थिति", sub: "Standard upbeat care" },
  { id: "alone", emoji: "🏠", label: "Living Alone", labelHi: "घर पर अकेला हूँ", sub: "Warm companion presence" },
  { id: "burden", emoji: "🥺", label: "Feel like Burden", labelHi: "अपनों पर बोझ लग रहा हूँ", sub: "Gentle reassuring love" },
  { id: "student", emoji: "🎓", label: "In Hostel / College", labelHi: "हॉस्टल में हूँ", sub: "Encouraging buddy tone" },
];

export const VoicePersonaScreen: React.FC<Props> = ({
  patientName = "Friend",
  onSelectPersona,
  onBack,
}) => {
  const [selectedId, setSelectedId] = useState<VoicePersonaId>(() => loadPersonaPreference());
  const [emotionalState, setEmotionalState] = useState<PatientEmotionalState>(() => loadEmotionalStatePreference());
  const [lang, setLang] = useState<"en" | "hi">("hi");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const personas = listPersonas();
  const activePersona = personas.find((p) => p.id === selectedId) || personas[0];

  const handleSelect = (id: VoicePersonaId) => {
    setSelectedId(id);
    savePersonaPreference(id);
    if (onSelectPersona) onSelectPersona(id);
    const greetingText = personalizeGreeting(id, patientName, lang);
    setIsPlayingAudio(true);
    speakPersonaText(greetingText, id, lang, {
      onDone: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  const handleEmotionalState = (state: PatientEmotionalState) => {
    setEmotionalState(state);
    saveEmotionalStatePreference(state);
    const reply = generateEmotionalCounselingReply(selectedId, state, patientName, lang);
    setIsPlayingAudio(true);
    speakPersonaText(reply, selectedId, lang, {
      onDone: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  const handleTestAudio = () => {
    if (isPlayingAudio) {
      stopSpeech();
      setIsPlayingAudio(false);
      return;
    }
    setIsPlayingAudio(true);
    const sample = generatePersonaAlarmScript(activePersona.id, "Paracetamol 500mg", "after meals", patientName, lang, emotionalState);
    speakPersonaText(sample.spokenText, activePersona.id, lang, {
      onDone: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  const greeting = personalizeGreeting(activePersona.id, patientName, lang);
  const sampleAlarm = generatePersonaAlarmScript(activePersona.id, "Paracetamol 500mg", "after meals", patientName, lang, emotionalState);
  const currentSentiment = EMOTIONAL_OPTIONS.find((o) => o.id === emotionalState) || EMOTIONAL_OPTIONS[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Choose Your Voice Companion</Text>
          <Text style={styles.headerSubtitle}>अपनी आवाज़ चुनें • Someone close to care for you</Text>
        </View>
        <TouchableOpacity
          onPress={() => setLang(lang === "en" ? "hi" : "en")}
          activeOpacity={0.8}
          style={styles.langBtn}
        >
          <Text style={styles.langBtnText}>{lang === "en" ? "हिन्दी" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Sentiment / Heart Feelings Picker */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>
              {lang === "hi" ? "आपका मन और भावनाएं (Emotional Sentiment)" : "How is your heart feeling? (Sentiment)"}
            </Text>
            <Text style={styles.sentimentToneBadge}>
              {currentSentiment.emoji} {lang === "hi" ? currentSentiment.labelHi : currentSentiment.label}
            </Text>
          </View>
          <Text style={styles.sentimentInstruction}>
            {lang === "hi"
              ? "भावना चुनें — आवाज़ का लहजा, प्यार, और बोलने की गति उसी के अनुसार बदल जाएगी:"
              : "Tap a feeling — voice tone, empathy, and speed adapt automatically:"}
          </Text>

          <View style={styles.situationGrid}>
            {EMOTIONAL_OPTIONS.map((opt) => {
              const isSel = emotionalState === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => handleEmotionalState(opt.id)}
                  activeOpacity={0.8}
                  style={[styles.situationChip, isSel && styles.situationChipSelected]}
                >
                  <Text style={styles.situationEmoji}>{opt.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.situationLabel, isSel && styles.situationLabelSelected]}>
                      {lang === "hi" ? opt.labelHi : opt.label}
                    </Text>
                    <Text style={styles.situationSub}>{opt.sub}</Text>
                  </View>
                  {isSel && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Persona Cards */}
        <Text style={styles.sectionHeader}>
          {lang === "hi" ? `उपलब्ध आवाज़ें (${personas.length})` : `Available Care Voices (${personas.length})`}
        </Text>
        {personas.map((p) => {
          const isSelected = selectedId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => handleSelect(p.id)}
              activeOpacity={0.8}
              style={[styles.personaCard, isSelected && styles.personaCardSelected]}
            >
              <View style={styles.personaTop}>
                <Text style={styles.personaAvatar}>{p.emoji}</Text>
                <View style={styles.personaMeta}>
                  <Text style={[styles.personaName, isSelected && styles.personaNameSelected]}>
                    {p.displayName} ({p.displayNameHi})
                  </Text>
                  <Text style={styles.personaRelation}>{p.description}</Text>
                </View>
                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>✓ Active</Text>
                  </View>
                )}
              </View>
              <Text style={styles.personaDesc}>{lang === "hi" ? p.descriptionHi : p.description}</Text>
            </TouchableOpacity>
          );
        })}

        {/* Live Audio Preview Card with Instant Listen Button */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewTitle}>
              🎙️ {activePersona.displayName}'s Voice
            </Text>
            <TouchableOpacity
              style={[styles.audioTestBtn, isPlayingAudio && styles.audioTestBtnPlaying]}
              onPress={handleTestAudio}
              activeOpacity={0.85}
            >
              <Text style={styles.audioTestBtnText}>
                {isPlayingAudio ? "⏹️ Stop Voice" : "🔊 Listen to Voice / Test Audio"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewBubble}>
            <Text style={styles.previewLabel}>
              {lang === "hi" ? "अभिवादन (Greeting):" : "Greeting:"}
            </Text>
            <Text style={styles.previewText}>"{greeting}"</Text>
          </View>

          <View style={[styles.previewBubble, styles.previewAlarm]}>
            <Text style={styles.previewLabel}>
              {lang === "hi"
                ? `भावना-आधारित दवा अलार्म (${currentSentiment.label}):`
                : `Sentiment-Adapted Alarm (${currentSentiment.label}):`}
            </Text>
            <Text style={styles.previewText}>"{sampleAlarm.spokenText}"</Text>
          </View>
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
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#1E293B" },
  headerSubtitle: { fontSize: 11, color: "#64748B" },
  langBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  langBtnText: { fontSize: 12, color: "#1E40AF", fontWeight: "bold" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 13.5, fontWeight: "700", color: "#0F172A" },
  sentimentToneBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0d9488",
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  sentimentInstruction: {
    fontSize: 11.5,
    color: "#64748B",
    marginBottom: 10,
    lineHeight: 16,
  },
  situationGrid: { flexDirection: "column" },
  situationChip: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  situationChipSelected: {
    borderColor: "#0d9488",
    backgroundColor: "#f0fdfa",
    borderWidth: 2,
  },
  situationEmoji: { fontSize: 20, marginRight: 10 },
  situationLabel: { fontSize: 12.5, color: "#475569", fontWeight: "600" },
  situationLabelSelected: { color: "#0f766e", fontWeight: "700" },
  situationSub: { fontSize: 10.5, color: "#94A3B8" },
  checkMark: { fontSize: 14, color: "#0d9488", fontWeight: "bold", marginLeft: 6 },
  sectionHeader: { fontSize: 14, fontWeight: "bold", color: "#1E293B", marginBottom: 12 },
  personaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  personaCardSelected: {
    borderColor: "#0d9488",
    borderWidth: 2,
    backgroundColor: "#F0FDFA",
  },
  personaTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  personaAvatar: { fontSize: 26, marginRight: 12 },
  personaMeta: { flex: 1 },
  personaName: { fontSize: 14, fontWeight: "bold", color: "#1E293B" },
  personaNameSelected: { color: "#0F766E" },
  personaRelation: { fontSize: 11, color: "#64748B" },
  selectedBadge: {
    backgroundColor: "#0d9488",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  selectedBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "bold" },
  personaDesc: { fontSize: 12, color: "#475569", lineHeight: 16 },
  previewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  previewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  previewTitle: { fontSize: 13.5, fontWeight: "bold", color: "#1E293B" },
  audioTestBtn: {
    backgroundColor: "#0d9488",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: "#0d9488",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  audioTestBtnPlaying: {
    backgroundColor: "#e11d48",
  },
  audioTestBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  previewBubble: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  previewAlarm: { backgroundColor: "#F0FDFA", borderColor: "#CCFBF1" },
  previewLabel: { fontSize: 10, color: "#64748B", fontWeight: "bold", marginBottom: 2 },
  previewText: { fontSize: 12, color: "#1E293B", fontStyle: "italic", lineHeight: 18 },
});
