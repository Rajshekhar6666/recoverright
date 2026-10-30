import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  isValidServerUrl,
  SUPPORTED_LANGUAGES,
} from "../services/settings";
import {
  getPersonaProfile,
  loadAlertModePreference,
  loadEmotionalStatePreference,
  loadPersonaPreference,
  saveAlertModePreference,
  AlertMode,
} from "../services/voicePersona";

export { isValidServerUrl, SUPPORTED_LANGUAGES };

export interface PatientSettingsScreenProps {
  onBack: () => void;
  currentServerUrl: string;
  onServerUrlChange: (url: string) => void;
  backgroundListening: boolean;
  onBackgroundListeningChange: (enabled: boolean) => void;
  language?: string;
  onLanguageChange?: (lang: string) => void;
  syncIntervalMinutes?: number;
  onSyncIntervalChange?: (mins: number) => void;
  onNavigateToConsentGate?: () => void;
  onNavigateToLogin?: () => void;
  onNavigateToPersona?: () => void;
  onNavigateToPrivacyPolicy?: () => void;
}

export const PatientSettingsScreen: React.FC<PatientSettingsScreenProps> = ({
  onBack,
  currentServerUrl,
  onServerUrlChange,
  backgroundListening,
  onBackgroundListeningChange,
  language = "en",
  onLanguageChange,
  syncIntervalMinutes = 15,
  onSyncIntervalChange,
  onNavigateToConsentGate,
  onNavigateToLogin,
  onNavigateToPersona,
  onNavigateToPrivacyPolicy,
}) => {
  const [urlInput, setUrlInput] = useState(currentServerUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [syncInterval, setSyncInterval] = useState(syncIntervalMinutes);
  const [selectedLang, setSelectedLang] = useState<string>(language);
  const [alertMode, setAlertMode] = useState<AlertMode>(() => loadAlertModePreference());
  const [queueCleared, setQueueCleared] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dataErasedMsg, setDataErasedMsg] = useState(false);

  const activePersona = getPersonaProfile(loadPersonaPreference());

  const handleTestConnection = async (targetUrl: string = urlInput) => {
    const cleanUrl = targetUrl.trim().replace(/\/+$/, "");
    if (!isValidServerUrl(cleanUrl)) {
      setUrlError("Please enter a valid HTTP or HTTPS URL.");
      return;
    }
    setUrlError(null);
    setPingStatus("testing");

    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;
      const res = await fetch(`${cleanUrl}/health`, { signal: controller ? controller.signal : undefined });
      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        setPingStatus("success");
        onServerUrlChange(cleanUrl);
        Alert.alert(
          selectedLang === "hi" ? "अस्पताल सर्वर कनेक्ट हुआ" : "Hospital Server Connected",
          selectedLang === "hi"
            ? `Aurevia Hospital सर्वर से लाइव संपर्क स्थापित हो गया:\n${cleanUrl}`
            : `Successfully established live connection to Aurevia Hospital server:\n${cleanUrl}`
        );
      } else {
        setPingStatus("failed");
        Alert.alert(
          selectedLang === "hi" ? "सर्वर से संपर्क नहीं हुआ" : "Server Unreachable",
          selectedLang === "hi"
            ? `सर्वर ने उत्तर नहीं दिया (${cleanUrl})। कृपया जांचें कि आपका फोन उसी वाई-फाई से जुड़ा है।`
            : `Server returned non-OK status (${cleanUrl}). Verify connection to the local hospital network.`
        );
      }
    } catch (err: any) {
      setPingStatus("failed");
      Alert.alert(
        selectedLang === "hi" ? "सर्वर ऑफलाइन" : "Server Offline",
        selectedLang === "hi"
          ? `सर्वर (${cleanUrl}) तक नहीं पहुँचा जा सका। सुनिश्चित करें कि फोन उसी Wi-Fi नेटवर्क (192.168.1.7) पर है। सुरक्षित ऑफलाइन मोड में काम जारी है।`
          : `Could not reach ${cleanUrl}. Ensure your phone is on the same local Wi-Fi (192.168.1.7) or running the local server. Operating safely in offline demo mode.`
      );
    }
  };

  const handleSelectPreset = (presetUrl: string) => {
    setUrlInput(presetUrl);
    handleTestConnection(presetUrl);
  };

  const handleSaveAlertMode = (mode: AlertMode) => {
    setAlertMode(mode);
    saveAlertModePreference(mode);
  };

  const handleEraseAllData = () => {
    try {
      if (typeof localStorage !== "undefined" && localStorage.clear) {
        localStorage.clear();
      }
    } catch (_) {}
    setShowDeleteConfirm(false);
    setDataErasedMsg(true);
    setTimeout(() => {
      if (onNavigateToConsentGate) onNavigateToConsentGate();
      else if (onNavigateToLogin) onNavigateToLogin();
    }, 1200);
  };

  const handleClearQueue = () => {
    try {
      if (typeof localStorage !== "undefined" && localStorage.removeItem) {
        localStorage.removeItem("rr_offline_queue");
      }
    } catch (_) {}
    setQueueCleared(true);
    setTimeout(() => setQueueCleared(false), 2500);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Patient Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Hospital Server Connection */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Hospital Server Connection</Text>
            {pingStatus === "success" && (
              <View style={styles.badgeSuccess}>
                <Text style={styles.badgeSuccessText}>● Connected</Text>
              </View>
            )}
            {pingStatus === "failed" && (
              <View style={styles.badgeFailed}>
                <Text style={styles.badgeFailedText}>● Offline</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardDesc}>
            Connects mobile companion directly to doctor's nursing station & plan API.
          </Text>

          {/* Quick Connect Presets */}
          <Text style={styles.presetLabel}>Quick Connect Presets:</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              onPress={() => handleSelectPreset("http://192.168.1.7:8000")}
              activeOpacity={0.8}
              style={[
                styles.presetBtn,
                urlInput === "http://192.168.1.7:8000" && styles.presetBtnActive,
              ]}
            >
              <Text style={styles.presetBtnText}>🖥️ Wi-Fi PC (192.168.1.7)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSelectPreset("https://recoverright-webonrender.com")}
              activeOpacity={0.8}
              style={[
                styles.presetBtn,
                urlInput === "https://recoverright-webonrender.com" && styles.presetBtnActive,
              ]}
            >
              <Text style={styles.presetBtnText}>🌐 Web Cloud (Render)</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.presetRow, { marginTop: 6 }]}>
            <TouchableOpacity
              onPress={() => handleSelectPreset("http://10.0.2.2:8000")}
              activeOpacity={0.8}
              style={[
                styles.presetBtn,
                urlInput === "http://10.0.2.2:8000" && styles.presetBtnActive,
              ]}
            >
              <Text style={styles.presetBtnText}>📱 Emulator (10.0.2.2)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSelectPreset("http://127.0.0.1:8000")}
              activeOpacity={0.8}
              style={[
                styles.presetBtn,
                urlInput === "http://127.0.0.1:8000" && styles.presetBtnActive,
              ]}
            >
              <Text style={styles.presetBtnText}>💻 Localhost (127.0.0.1)</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.textInput, urlError ? styles.textInputError : null]}
            value={urlInput}
            onChangeText={(t) => { setUrlInput(t); setUrlError(null); setPingStatus("idle"); }}
            placeholder="http://192.168.1.7:8000"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {urlError ? <Text style={styles.errorText}>{urlError}</Text> : null}

          <TouchableOpacity
            onPress={() => handleTestConnection()}
            disabled={pingStatus === "testing"}
            activeOpacity={0.8}
            style={styles.saveBtn}
          >
            {pingStatus === "testing" ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Test & Connect to Hospital</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Dose Announcement Style: Standard vs Character */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dose Announcement Style</Text>
          <Text style={styles.cardDesc}>
            Choose between clear neutral reminders or optional caring voice characters.
          </Text>
          <View style={styles.alertModeRow}>
            <TouchableOpacity
              onPress={() => handleSaveAlertMode("standard")}
              activeOpacity={0.8}
              style={[
                styles.alertModeBtn,
                alertMode === "standard" && styles.alertModeBtnActive,
              ]}
            >
              <Text style={styles.alertModeIcon}>🩺</Text>
              <Text
                style={[
                  styles.alertModeTitle,
                  alertMode === "standard" && styles.alertModeTitleActive,
                ]}
              >
                Standard (Neutral)
              </Text>
              <Text style={styles.alertModeSub}>
                "Time for your medicine: Paracetamol. Did you take it?"
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSaveAlertMode("persona")}
              activeOpacity={0.8}
              style={[
                styles.alertModeBtn,
                alertMode === "persona" && styles.alertModeBtnActive,
              ]}
            >
              <Text style={styles.alertModeIcon}>👥</Text>
              <Text
                style={[
                  styles.alertModeTitle,
                  alertMode === "persona" && styles.alertModeTitleActive,
                ]}
              >
                Voice Character
              </Text>
              <Text style={styles.alertModeSub}>
                Optional: {activePersona.displayName} ({activePersona.displayNameHi})
              </Text>
            </TouchableOpacity>
          </View>

          {alertMode === "persona" && onNavigateToPersona && (
            <TouchableOpacity
              onPress={onNavigateToPersona}
              activeOpacity={0.8}
              style={styles.navLinkBtn}
            >
              <Text style={styles.navLinkText}>
                🎭 Change Voice Character (Maa, Bhai, Didi, Elder) →
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Background Voice Safety */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <Text style={styles.cardTitle}>Background Safety Microphone</Text>
              <Text style={styles.cardDesc}>
                Listens in volatile device RAM for distress words ("Bachao", "Help me") and alerts nurse.
              </Text>
            </View>
            <Switch
              value={backgroundListening}
              onValueChange={onBackgroundListeningChange}
              trackColor={{ false: "#CBD5E1", true: "#2563EB" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Language Preference */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Language / भाषा</Text>
          <View style={styles.langRow}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                onPress={() => {
                  setSelectedLang(l.code);
                  if (onLanguageChange) onLanguageChange(l.code);
                }}
                activeOpacity={0.8}
                style={[styles.langBtn, selectedLang === l.code && styles.langBtnSelected]}
              >
                <Text style={[styles.langBtnText, selectedLang === l.code && styles.langBtnTextSelected]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Permissions & Security */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛡️ Privacy & Account Controls</Text>
          <View style={styles.navBtnGroup}>
            {onNavigateToConsentGate && (
              <TouchableOpacity
                onPress={onNavigateToConsentGate}
                activeOpacity={0.8}
                style={[styles.navBtn, styles.navBtnGreen]}
              >
                <Text style={[styles.navBtnText, styles.navBtnGreenText]}>
                  🔒 Re-check Permissions & System Dialogs →
                </Text>
              </TouchableOpacity>
            )}
            {onNavigateToLogin && (
              <TouchableOpacity
                onPress={onNavigateToLogin}
                activeOpacity={0.8}
                style={[styles.navBtn, styles.navBtnBlue]}
              >
                <Text style={[styles.navBtnText, styles.navBtnBlueText]}>
                  🔑 Hospital Patient Login / Switch Account →
                </Text>
              </TouchableOpacity>
            )}
            {onNavigateToPrivacyPolicy && (
              <TouchableOpacity
                onPress={onNavigateToPrivacyPolicy}
                activeOpacity={0.8}
                style={styles.navBtn}
              >
                <Text style={styles.navBtnText}>
                  📜 Read Full Health Privacy Policy →
                </Text>
              </TouchableOpacity>
            )}

            {/* Data Erasure */}
            <View style={styles.deleteDivider} />
            {dataErasedMsg ? (
              <View style={styles.erasedMsg}>
                <Text style={styles.erasedMsgText}>✓ All Data & Session Erased</Text>
              </View>
            ) : !showDeleteConfirm ? (
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(true)}
                activeOpacity={0.8}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>
                  🗑️ Erase Clinical Data & Reset Account
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.deleteConfirm}>
                <Text style={styles.deleteConfirmText}>
                  Permanently erase all stored recovery plans, vitals, and login session?
                </Text>
                <View style={styles.deleteConfirmBtns}>
                  <TouchableOpacity
                    onPress={handleEraseAllData}
                    activeOpacity={0.8}
                    style={styles.confirmYes}
                  >
                    <Text style={styles.confirmYesText}>Yes, Erase</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowDeleteConfirm(false)}
                    activeOpacity={0.8}
                    style={styles.confirmNo}
                  >
                    <Text style={styles.confirmNoText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Offline Queue Diagnostics */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Offline Data Diagnostics</Text>
          <Text style={styles.cardDesc}>
            Clear pending queued offline actions if data appears out of sync.
          </Text>
          <TouchableOpacity
            onPress={handleClearQueue}
            activeOpacity={0.8}
            style={styles.clearQueueBtn}
          >
            <Text style={styles.clearQueueBtnText}>
              {queueCleared ? "✓ Offline Queue Cleared" : "Clear Pending Offline Queue"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          RecoverRight Companion v1.0.0 (Production)
          {"\n"}Hospital Clinical Safety Network · ABDM Ready
        </Text>
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
  headerTitle: { fontSize: 17, fontWeight: "bold", color: "#0F172A" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "bold", color: "#1E293B" },
  cardDesc: { fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 17 },
  badgeSuccess: {
    backgroundColor: "#DCFCE7",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeSuccessText: { color: "#166534", fontSize: 11, fontWeight: "bold" },
  badgeFailed: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeFailedText: { color: "#991B1B", fontSize: 11, fontWeight: "bold" },
  presetLabel: { fontSize: 11, fontWeight: "bold", color: "#475569", marginBottom: 6 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  presetBtn: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  presetBtnActive: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  presetBtnText: { fontSize: 11, color: "#1E293B", fontWeight: "600" },
  textInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  textInputError: { borderColor: "#EF4444" },
  errorText: { color: "#EF4444", fontSize: 12, marginBottom: 8 },
  saveBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "bold" },
  alertModeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  alertModeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  alertModeBtnActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  alertModeIcon: { fontSize: 20, marginBottom: 4 },
  alertModeTitle: { fontSize: 13, fontWeight: "bold", color: "#1E293B", marginBottom: 2 },
  alertModeTitleActive: { color: "#1E40AF" },
  alertModeSub: { fontSize: 10, color: "#64748B", lineHeight: 14 },
  navLinkBtn: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    alignItems: "center",
  },
  navLinkText: { fontSize: 11, color: "#2563EB", fontWeight: "600" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLeft: { flex: 1, marginRight: 12 },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  langBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  langBtnSelected: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  langBtnText: { fontSize: 12, color: "#475569" },
  langBtnTextSelected: { color: "#1E40AF", fontWeight: "bold" },
  navBtnGroup: { marginTop: 4 },
  navBtn: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  navBtnText: { fontSize: 13, color: "#0F172A", fontWeight: "600" },
  navBtnGreen: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  navBtnGreenText: { color: "#166534" },
  navBtnBlue: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  navBtnBlueText: { color: "#1E40AF" },
  deleteDivider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 8 },
  deleteBtn: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    borderRadius: 8,
  },
  deleteBtnText: { fontSize: 13, color: "#DC2626", fontWeight: "600" },
  deleteConfirm: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
  },
  deleteConfirmText: { fontSize: 12, color: "#991B1B", fontWeight: "bold", marginBottom: 8 },
  deleteConfirmBtns: { flexDirection: "row", gap: 8 },
  confirmYes: {
    flex: 1,
    backgroundColor: "#DC2626",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  confirmYesText: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold" },
  confirmNo: {
    padding: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  confirmNoText: { fontSize: 12, color: "#475569" },
  erasedMsg: { padding: 8, backgroundColor: "#DCFCE7", borderRadius: 6, alignItems: "center" },
  erasedMsgText: { color: "#166534", fontSize: 12, fontWeight: "bold" },
  clearQueueBtn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  clearQueueBtnText: { fontSize: 12, color: "#475569" },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 18,
  },
});
