import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { VoiceMessage, voiceAssistant } from "../services/voiceAssistant";
import { getPersonaProfile, loadPersonaPreference } from "../services/voicePersona";

interface Props {
  patientToken: string;
  patientName: string;
  onBack: () => void;
  onEmergencyTrigger: (reason: string) => Promise<void>;
}

export const VoiceAssistantScreen: React.FC<Props> = ({
  patientToken,
  patientName,
  onBack,
  onEmergencyTrigger,
}) => {
  const [messages, setMessages] = useState<VoiceMessage[]>(voiceAssistant.getMessages());
  const [inputText, setInputText] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    setLoading(true);
    setInputText("");

    try {
      const assistantReply = await voiceAssistant.sendSpokenMessage(patientToken, textToSend, language);
      setMessages(voiceAssistant.getMessages());
      if (assistantReply.isEmergency) {
        await onEmergencyTrigger(`Voice Assistant: ${assistantReply.text}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const personaProfile = getPersonaProfile(loadPersonaPreference());

  const samplePrompts = [
    {
      label: language === "hi" ? "💔 बोझ महसूस हो रहा है" : "💔 Feeling like a burden",
      text: language === "hi" ? "मुझे लगता है मैं सब पे बोझ बन गया हूँ" : "I feel like I am a burden to everyone",
    },
    {
      label: language === "hi" ? "🏠 मैं बिल्कुल अकेला हूँ" : "🏠 Living alone",
      text: language === "hi" ? "मेरा यहाँ कोई देखने वाला नहीं है, मैं अकेला हूँ" : "I am living alone and have no one to take care of me",
    },
    {
      label: language === "hi" ? "😰 बहुत घबराहट हो रही है" : "😰 Feeling anxious",
      text: language === "hi" ? "मुझे बहुत घबराहट और डर लग रहा है" : "I am feeling very anxious about my health",
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            {personaProfile.emoji} {personaProfile.displayName}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === "hi" ? personaProfile.displayNameHi : "Care Companion"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setLanguage(language === "en" ? "hi" : "en")}
          activeOpacity={0.8}
          style={styles.langToggle}
        >
          <Text style={styles.langToggleText}>{language === "en" ? "हिन्दी" : "EN"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Messages */}
        {messages.map((msg, idx) => {
          const isUser = msg.sender === "patient";
          return (
            <View
              key={idx}
              style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowBot]}
            >
              <View
                style={[
                  styles.msgBubble,
                  isUser ? styles.msgBubbleUser : styles.msgBubbleBot,
                  msg.isEmergency ? styles.msgBubbleEmergency : null,
                ]}
              >
                <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextBot]}>
                  {msg.text}
                </Text>
              </View>
            </View>
          );
        })}

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingText}>
              {personaProfile.displayName} is thinking...
            </Text>
          </View>
        )}

        {/* Sample Prompts */}
        <View style={styles.promptsSection}>
          <Text style={styles.promptsTitle}>Tap to talk about:</Text>
          <View style={styles.promptsRow}>
            {samplePrompts.map((p, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => handleSendMessage(p.text)}
                activeOpacity={0.8}
                style={styles.promptChip}
              >
                <Text style={styles.promptChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={language === "hi" ? "अपनी बात यहाँ लिखें..." : "Type how you are feeling..."}
          placeholderTextColor="#94A3B8"
          onSubmitEditing={() => handleSendMessage(inputText)}
        />
        <TouchableOpacity
          onPress={() => handleSendMessage(inputText)}
          disabled={loading || !inputText.trim()}
          activeOpacity={0.8}
          style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
        >
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
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
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  headerSubtitle: { fontSize: 12, color: "#64748B" },
  langToggle: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  langToggleText: { fontSize: 12, color: "#1E40AF", fontWeight: "bold" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  msgRow: { flexDirection: "row", marginBottom: 12 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowBot: { justifyContent: "flex-start" },
  msgBubble: { maxWidth: "80%", padding: 12, borderRadius: 14 },
  msgBubbleUser: { backgroundColor: "#2563EB", borderBottomRightRadius: 4 },
  msgBubbleBot: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderBottomLeftRadius: 4 },
  msgBubbleEmergency: { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextUser: { color: "#FFFFFF" },
  msgTextBot: { color: "#1E293B" },
  loadingRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  loadingText: { fontSize: 13, color: "#64748B", marginLeft: 8 },
  promptsSection: { marginTop: 16 },
  promptsTitle: { fontSize: 12, color: "#64748B", fontWeight: "600", marginBottom: 8 },
  promptsRow: { flexDirection: "row", flexWrap: "wrap" },
  promptChip: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  promptChipText: { fontSize: 12, color: "#334155" },
  inputBar: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginRight: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: "#FFFFFF", fontSize: 16 },
});
