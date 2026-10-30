import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
} from "react-native";
import { deviceSecurity } from "../services/security";
import {
  PERSONA_PROFILES,
  VoicePersonaId,
  loadAlertModePreference,
  loadPersonaPreference,
  saveAlertModePreference,
  savePersonaPreference,
} from "../services/voicePersona";

interface Props {
  onConsentCompleted: () => void;
  onOpenPrivacyPolicy?: () => void;
}

export const ConsentGateScreen: React.FC<Props> = ({
  onConsentCompleted,
  onOpenPrivacyPolicy,
}) => {
  const [alarms, setAlarms] = useState(true);
  const [calendarAccess, setCalendarAccess] = useState(true);
  const [voiceSafety, setVoiceSafety] = useState(true);
  const [batteryExempt, setBatteryExempt] = useState(true);

  // Alert Style: 'standard' (no emotion) vs 'persona' (optional)
  const [alertMode, setAlertMode] = useState<"standard" | "persona">(() =>
    loadAlertModePreference()
  );
  const [selectedPersona, setSelectedPersona] = useState<VoicePersonaId>(() =>
    loadPersonaPreference()
  );

  const requestNativePermissions = async () => {
    // 1. Request Notification Permissions
    try {
      const Notifications = require("expo-notifications");
      if (Notifications?.requestPermissionsAsync) {
        await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
          android: {},
        });
      }
    } catch (_) {}

    // 2. Request Calendar Permissions
    try {
      const Calendar = require("expo-calendar");
      if (Calendar?.requestCalendarPermissionsAsync) {
        await Calendar.requestCalendarPermissionsAsync();
      }
    } catch (_) {}
  };

  const handleConfirmAndProceed = async () => {
    await requestNativePermissions();

    saveAlertModePreference(alertMode);
    if (alertMode === "persona") {
      savePersonaPreference(selectedPersona);
    }

    deviceSecurity.updateConsent({
      backgroundVoiceSafetyAllowed: voiceSafety,
      calendarAccessAllowed: calendarAccess,
      alarmNotificationsAllowed: alarms,
      batteryOptimizationExempt: batteryExempt,
    });

    onConsentCompleted();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🏥</Text>
          <Text style={styles.title}>RecoverRight Companion</Text>
          <Text style={styles.subtitle}>
            Clinical post-discharge safety and recovery management. Please review essential device permissions.
          </Text>
        </View>

        {/* Clinical Privacy Banner */}
        <View style={styles.privacyBanner}>
          <Text style={styles.privacyIcon}>🔒</Text>
          <View style={styles.privacyTextGroup}>
            <Text style={styles.privacyTitle}>Zero Cloud Audio Retention</Text>
            <Text style={styles.privacyDesc}>
              Emergency voice safety checks occur locally in device RAM. No audio files are ever stored on disk or uploaded to cloud servers.
            </Text>
          </View>
        </View>

        {/* Section 1: Alert Style Selection */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>1. Dose Reminder Style</Text>
          <Text style={styles.cardSub}>
            Choose how you would like medication reminders announced:
          </Text>

          {/* Option A: Standard Clinical Alert */}
          <TouchableOpacity
            onPress={() => setAlertMode("standard")}
            activeOpacity={0.8}
            style={[
              styles.alertOption,
              alertMode === "standard" && styles.alertOptionSelected,
            ]}
          >
            <View style={styles.alertOptionHeader}>
              <Text style={styles.alertOptionIcon}>🩺</Text>
              <View style={styles.alertOptionTextGroup}>
                <Text style={styles.alertOptionTitle}>
                  Standard Clinical Alert (Recommended)
                </Text>
                <Text style={styles.alertOptionDesc}>
                  Neutral, professional reminder: "It's time for your medicine: Paracetamol 500mg. Did you take it?"
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Option B: Companion Voice Persona (Optional) */}
          <TouchableOpacity
            onPress={() => setAlertMode("persona")}
            activeOpacity={0.8}
            style={[
              styles.alertOption,
              alertMode === "persona" && styles.alertOptionSelected,
            ]}
          >
            <View style={styles.alertOptionHeader}>
              <Text style={styles.alertOptionIcon}>👥</Text>
              <View style={styles.alertOptionTextGroup}>
                <Text style={styles.alertOptionTitle}>
                  Companion Persona (Optional)
                </Text>
                <Text style={styles.alertOptionDesc}>
                  Warm, familiar character reminders (Maa, Bhai, Didi, Elder, Guru).
                </Text>
              </View>
            </View>

            {alertMode === "persona" && (
              <View style={styles.personaGrid}>
                {Object.values(PERSONA_PROFILES).map((p) => {
                  const isChosen = selectedPersona === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setSelectedPersona(p.id)}
                      activeOpacity={0.8}
                      style={[
                        styles.personaChip,
                        isChosen && styles.personaChipSelected,
                      ]}
                    >
                      <Text style={styles.personaChipEmoji}>{p.emoji}</Text>
                      <Text
                        style={[
                          styles.personaChipName,
                          isChosen && styles.personaChipNameSelected,
                        ]}
                      >
                        {p.displayName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Section 2: Core Permissions */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>2. Background Safety Permissions</Text>

          {/* Permission: Notifications */}
          <View style={styles.permRow}>
            <View style={styles.permTextGroup}>
              <Text style={styles.permTitle}>🔔 High-Priority Dose Alarms</Text>
              <Text style={styles.permDesc}>
                Fires audible chimes with lock-screen [Taken] and [Snooze] buttons.
              </Text>
            </View>
            <Switch
              value={alarms}
              onValueChange={setAlarms}
              trackColor={{ false: "#CBD5E1", true: "#2563EB" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Permission: Calendar */}
          <View style={styles.permRow}>
            <View style={styles.permTextGroup}>
              <Text style={styles.permTitle}>📅 Hospital OPD Calendar Sync</Text>
              <Text style={styles.permDesc}>
                Automatically synchronizes follow-up visits to your native Google Calendar.
              </Text>
            </View>
            <Switch
              value={calendarAccess}
              onValueChange={setCalendarAccess}
              trackColor={{ false: "#CBD5E1", true: "#2563EB" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Permission: Background Mic */}
          <View style={styles.permRow}>
            <View style={styles.permTextGroup}>
              <Text style={styles.permTitle}>🎙️ Background Distress Detection</Text>
              <Text style={styles.permDesc}>
                Monitors for emergency cries ("Help me", "बचाओ") and alerts nursing station.
              </Text>
            </View>
            <Switch
              value={voiceSafety}
              onValueChange={setVoiceSafety}
              trackColor={{ false: "#CBD5E1", true: "#2563EB" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Permission: Battery Exemption */}
          <View style={styles.permRow}>
            <View style={styles.permTextGroup}>
              <Text style={styles.permTitle}>🔋 Battery Saver Exemption</Text>
              <Text style={styles.permDesc}>
                Ensures critical medical dose alarms are never silenced while phone is idle.
              </Text>
            </View>
            <Switch
              value={batteryExempt}
              onValueChange={setBatteryExempt}
              trackColor={{ false: "#CBD5E1", true: "#2563EB" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleConfirmAndProceed}
          activeOpacity={0.8}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Grant Permissions & Continue →
          </Text>
        </TouchableOpacity>

        {onOpenPrivacyPolicy && (
          <TouchableOpacity
            onPress={onOpenPrivacyPolicy}
            activeOpacity={0.7}
            style={styles.policyLink}
          >
            <Text style={styles.policyLinkText}>
              Read Hospital Privacy Policy & Google Play Disclosures
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  header: { alignItems: "center", marginBottom: 20 },
  logo: { fontSize: 44, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18 },
  privacyBanner: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  privacyIcon: { fontSize: 24, marginRight: 12 },
  privacyTextGroup: { flex: 1 },
  privacyTitle: { fontSize: 13, fontWeight: "bold", color: "#166534", marginBottom: 2 },
  privacyDesc: { fontSize: 12, color: "#166534", lineHeight: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardHeader: { fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 4 },
  cardSub: { fontSize: 12, color: "#64748B", marginBottom: 12 },
  alertOption: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
  },
  alertOptionSelected: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  alertOptionHeader: { flexDirection: "row", alignItems: "flex-start" },
  alertOptionIcon: { fontSize: 24, marginRight: 10, marginTop: 2 },
  alertOptionTextGroup: { flex: 1 },
  alertOptionTitle: { fontSize: 13, fontWeight: "bold", color: "#0F172A", marginBottom: 2 },
  alertOptionDesc: { fontSize: 11, color: "#64748B", lineHeight: 16 },
  personaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 6 },
  personaChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
  },
  personaChipSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  personaChipEmoji: { fontSize: 14, marginRight: 4 },
  personaChipName: { fontSize: 11, color: "#334155" },
  personaChipNameSelected: { color: "#FFFFFF", fontWeight: "bold" },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  permTextGroup: { flex: 1, marginRight: 12 },
  permTitle: { fontSize: 13, fontWeight: "bold", color: "#1E293B", marginBottom: 2 },
  permDesc: { fontSize: 11, color: "#64748B", lineHeight: 15 },
  primaryButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "bold" },
  policyLink: { alignItems: "center", padding: 8, marginBottom: 20 },
  policyLinkText: { fontSize: 12, color: "#2563EB", textDecorationLine: "underline" },
});
