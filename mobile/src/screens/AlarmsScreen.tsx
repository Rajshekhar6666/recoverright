import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { LocalNotificationAlarm } from "../api/types";
import { deviceAlarms } from "../services/notifications";
import {
  loadAlertModePreference,
  saveAlertModePreference,
  loadPersonaPreference,
  generatePersonaAlarmScript,
  AlertMode,
} from "../services/voicePersona";
import { speakPersonaText, stopSpeech } from "../services/tts";

interface Props {
  alarms: LocalNotificationAlarm[];
  onBack: () => void;
  onNavigateToPersona?: () => void;
  language?: string;
  patientName?: string;
}

export const AlarmsScreen: React.FC<Props> = ({
  alarms,
  onBack,
  onNavigateToPersona,
  language = "en",
  patientName = "Priya",
}) => {
  const isHi = language === "hi";
  const [testFired, setTestFired] = useState<string | null>(null);
  const [alertMode, setAlertMode] = useState<AlertMode>(() =>
    loadAlertModePreference()
  );
  const activePersona = loadPersonaPreference();

  const handleTestAlarm = async (alarm: LocalNotificationAlarm) => {
    if (testFired === alarm.id) {
      await stopSpeech();
      setTestFired(null);
      return;
    }

    setTestFired(alarm.id);

    const script = generatePersonaAlarmScript(
      activePersona,
      alarm.medication_name,
      alarm.dose,
      patientName,
      isHi ? "hi" : "en"
    );

    const spokenText =
      alertMode === "persona"
        ? script.spokenText
        : isHi
        ? `ध्यान दें ${patientName}, आपकी दवाई ${alarm.medication_name} (${alarm.dose}) लेने का समय हो गया है।`
        : `Attention ${patientName}, scheduled dose reminder for ${alarm.medication_name} ${alarm.dose}.`;

    await speakPersonaText(spokenText, activePersona, isHi ? "hi" : "en", {
      onDone: () => setTestFired(null),
      onError: () => setTestFired(null),
    });
  };

  const handleToggleAlertMode = (mode: AlertMode) => {
    setAlertMode(mode);
    saveAlertModePreference(mode);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.8} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>
            {isHi ? "⏰ दवाई अलार्म एवं अनुस्मारक" : "⏰ Dose Alarms & Reminders"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isHi
              ? "ध्वनि अलार्म, वॉइस घोषणाएं एवं एक्शन बटन"
              : "Audible ringtones, spoken persona voice & lockscreen actions"}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Alert Style Selector Bar */}
        <View style={styles.selectorCard}>
          <Text style={styles.selectorLabel}>
            {isHi ? "दवाई अलार्म बोलने की शैली:" : "Dose Alert Announcement Style:"}
          </Text>
          <View style={styles.selectorRow}>
            <TouchableOpacity
              onPress={() => handleToggleAlertMode("standard")}
              activeOpacity={0.8}
              style={[
                styles.selectorBtn,
                alertMode === "standard" && styles.selectorBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.selectorBtnText,
                  alertMode === "standard" && styles.selectorBtnTextActive,
                ]}
              >
                {isHi ? "🩺 मानक क्लिनिकल" : "🩺 Standard Clinical"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleToggleAlertMode("persona")}
              activeOpacity={0.8}
              style={[
                styles.selectorBtn,
                alertMode === "persona" && styles.selectorBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.selectorBtnText,
                  alertMode === "persona" && styles.selectorBtnTextActive,
                ]}
              >
                {isHi ? "👥 वॉइस साथी (Maa/Didi/Bhai)" : "👥 Voice Persona"}
              </Text>
            </TouchableOpacity>
          </View>

          {alertMode === "persona" && onNavigateToPersona && (
            <TouchableOpacity
              onPress={onNavigateToPersona}
              activeOpacity={0.8}
              style={styles.changePersonaBtn}
            >
              <Text style={styles.changePersonaBtnText}>
                {isHi
                  ? "🎭 आवाज़ चुनें (माँ, दीदी, भाई, डॉक्टर अंकल) →"
                  : "🎭 Choose Voice Persona (Maa, Didi, Bhai, Dr. Uncle) →"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Alarms list */}
        {alarms.map((alarm) => {
          const script = generatePersonaAlarmScript(
            activePersona,
            alarm.medication_name,
            alarm.dose,
            patientName,
            isHi ? "hi" : "en"
          );
          const spokenScript =
            alertMode === "persona"
              ? script.spokenText
              : isHi
              ? `दवाई का समय: ${alarm.medication_name} (${alarm.dose})`
              : `Scheduled dose: ${alarm.medication_name} (${alarm.dose})`;

          return (
            <View key={alarm.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.alarmInfo}>
                  <Text style={styles.alarmTime}>{alarm.scheduled_time}</Text>
                  <Text style={styles.alarmMed}>
                    {alarm.medication_name} ({alarm.dose})
                  </Text>
                  <Text style={styles.alarmRepeat}>
                    {isHi
                      ? "प्रतिदिन दोहराएं · Aurevia हॉस्पिटल फार्मेसी"
                      : "Repeats Daily · Aurevia Hospital Pharmacy"}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleTestAlarm(alarm)}
                  activeOpacity={0.8}
                  style={[
                    styles.testBtn,
                    testFired === alarm.id && styles.testBtnFired,
                  ]}
                >
                  <Text style={styles.testBtnText}>
                    {testFired === alarm.id
                      ? (isHi ? "🔊 आवाज़ बज रही है..." : "🔊 Speaking...")
                      : (isHi ? "▶ आवाज़ सुनें" : "▶ Test Audio")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Spoken Alert Script Preview */}
              <View style={styles.scriptBox}>
                <Text style={styles.scriptLabel}>
                  {alertMode === "standard"
                    ? (isHi ? "📢 मानक सूचना:" : "📢 Spoken Notification (Objective):")
                    : (isHi ? "🗣️ वॉइस साथी की आवाज़ में:" : "🗣️ Spoken Voice Character Script:")}
                </Text>
                <Text style={styles.scriptText}>"{spokenScript}"</Text>
              </View>
            </View>
          );
        })}

        {alarms.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>⏰</Text>
            <Text style={styles.emptyTitle}>
              {isHi ? "कोई अलार्म शेड्यूल नहीं है" : "No Alarms Scheduled"}
            </Text>
            <Text style={styles.emptyDesc}>
              {isHi
                ? "आपकी डिस्चार्ज समरी की दवाओं के अनुसार अलार्म अपने आप निर्धारित होते हैं।"
                : "Medication alarms are automatically generated from your active recovery prescription times."}
            </Text>
          </View>
        )}

        {/* Interactive Lockscreen Preview */}
        <View style={styles.lockscreenPreview}>
          <Text style={styles.lockscreenTitle}>
            {isHi ? "📱 लॉकस्क्रीन नोटिफिकेशन पूर्वावलोकन:" : "📱 Lockscreen Notification Action Preview:"}
          </Text>
          <View style={styles.lockscreenCard}>
            <Text style={styles.lockscreenAppName}>AUREVIA RECOVERRIGHT · MEDICATION ALARM</Text>
            <Text style={styles.lockscreenMessage}>
              {isHi
                ? "दवाई का समय हो गया: पैरासिटामोल 500mg। क्या आपने ले ली?"
                : "Time for your medicine: Paracetamol 500mg. Did you take it?"}
            </Text>
            <View style={styles.lockscreenActions}>
              <View style={styles.actionChipGreen}>
                <Text style={styles.actionChipGreenText}>
                  {isHi ? "✅ ली गई" : "✅ Mark Taken"}
                </Text>
              </View>
              <View style={styles.actionChipYellow}>
                <Text style={styles.actionChipYellowText}>
                  {isHi ? "⏰ 10 मि. स्नूज़" : "⏰ Snooze 10m"}
                </Text>
              </View>
              <View style={styles.actionChipRed}>
                <Text style={styles.actionChipRedText}>
                  {isHi ? "🆘 कॉल नर्स" : "🆘 Call Nurse"}
                </Text>
              </View>
            </View>
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
  backBtn: { marginRight: 12, padding: 4 },
  backArrow: { fontSize: 22, color: "#2563EB", fontWeight: "bold" },
  headerTitleGroup: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: "bold", color: "#0F172A" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16 },
  selectorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#334155",
    marginBottom: 8,
  },
  selectorRow: { flexDirection: "row", gap: 8 },
  selectorBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  selectorBtnActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
  },
  selectorBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  selectorBtnTextActive: {
    color: "#1E40AF",
    fontWeight: "bold",
  },
  changePersonaBtn: {
    marginTop: 10,
    padding: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    alignItems: "center",
  },
  changePersonaBtnText: {
    fontSize: 11,
    color: "#2563EB",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  alarmInfo: { flex: 1, marginRight: 10 },
  alarmTime: { fontSize: 20, fontWeight: "bold", color: "#0F172A" },
  alarmMed: { fontSize: 14, fontWeight: "600", color: "#1E293B", marginTop: 2 },
  alarmRepeat: { fontSize: 11, color: "#64748B", marginTop: 2 },
  testBtn: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  testBtnFired: { backgroundColor: "#DBEAFE", borderColor: "#2563EB" },
  testBtnText: { fontSize: 12, fontWeight: "600", color: "#1D4ED8" },
  scriptBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
  },
  scriptLabel: { fontSize: 10, color: "#64748B", fontWeight: "600" },
  scriptText: { fontSize: 12, color: "#334155", fontStyle: "italic", marginTop: 2 },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A" },
  emptyDesc: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
  lockscreenPreview: { marginTop: 12, marginBottom: 30 },
  lockscreenTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#475569",
    marginBottom: 8,
  },
  lockscreenCard: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
  },
  lockscreenAppName: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  lockscreenMessage: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "500",
    marginTop: 6,
    lineHeight: 18,
  },
  lockscreenActions: { flexDirection: "row", gap: 6, marginTop: 12 },
  actionChipGreen: {
    flex: 1,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#10B981",
  },
  actionChipGreenText: { fontSize: 10, color: "#34D399", fontWeight: "bold" },
  actionChipYellow: {
    flex: 1,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  actionChipYellowText: { fontSize: 10, color: "#FCD34D", fontWeight: "bold" },
  actionChipRed: {
    flex: 1,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  actionChipRedText: { fontSize: 10, color: "#FCA5A5", fontWeight: "bold" },
});
