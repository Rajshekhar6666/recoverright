import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { HomeScreen } from "./screens/HomeScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { AlarmsScreen } from "./screens/AlarmsScreen";
import { VoiceSafetyScreen } from "./screens/VoiceSafetyScreen";
import { CallScreen } from "./screens/CallScreen";
import { PatientSettingsScreen } from "./screens/PatientSettingsScreen";
import { VoiceAssistantScreen } from "./screens/VoiceAssistantScreen";
import { VitalsScreen } from "./screens/VitalsScreen";
import { ConsentGateScreen } from "./screens/ConsentGateScreen";
import { PatientLoginScreen } from "./screens/PatientLoginScreen";
import { VoicePersonaScreen } from "./screens/VoicePersonaScreen";
import { RecoveryStoryScreen } from "./screens/RecoveryStoryScreen";
import { PrivacyPolicyScreen } from "./screens/PrivacyPolicyScreen";
import { LiveCallState, PatientPlan, SyncStatus } from "./api/types";
import { planSynchronizer } from "./services/sync";
import { patientCallManager } from "./services/calling";
import { voiceSafety } from "./services/voiceSafety";
import { deviceAlarms } from "./services/notifications";
import { deviceSecurity } from "./services/security";
import { apiClient } from "./api/client";

import {
  BACKGROUND_MEDICATION_CHECK,
  BACKGROUND_SYNC_FETCH,
  mobileTaskManager,
} from "./services/backgroundTasks";

export { BACKGROUND_MEDICATION_CHECK, BACKGROUND_SYNC_FETCH, mobileTaskManager };

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || "An unexpected error occurred." };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RecoverRight ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>🛡️</Text>
            <Text style={styles.errorTitle}>RecoverRight Safety Shield</Text>
            <Text style={styles.errorDesc}>
              The application encountered a display exception, but your background medical reminders and offline emergency
              safeguards remain active.
            </Text>
            <Text style={styles.errorDetails}>{this.state.errorMessage}</Text>
            <TouchableOpacity style={styles.restartButton} onPress={this.handleRestart} activeOpacity={0.8}>
              <Text style={styles.restartButtonText}>Resume Companion</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export type Screen =
  | "home"
  | "calendar"
  | "alarms"
  | "safety"
  | "call"
  | "settings"
  | "voice_assistant"
  | "vitals"
  | "consent_gate"
  | "login"
  | "voice_persona"
  | "recovery_story"
  | "privacy_policy";

interface AppProps {
  initialPatientToken?: string;
  serverUrl?: string;
}

// Default to host Wi-Fi LAN IP & Priya Sharma's demo token for instant live connectivity
const DEFAULT_HOST_URL = "http://192.168.1.7:8000";

export const AppInternal: React.FC<AppProps> = ({
  initialPatientToken = "pat_demo_straightforward",
  serverUrl = DEFAULT_HOST_URL,
}) => {
  // Navigation History Stack
  const [screenStack, setScreenStack] = useState<Screen[]>(() => {
    const consent = deviceSecurity.getConsentState();
    return consent.hasCompletedConsentGate ? ["home"] : ["consent_gate"];
  });

  const currentScreen = screenStack[screenStack.length - 1] || "home";

  const navigateTo = (screen: Screen) => {
    if (screen === currentScreen) return;
    setScreenStack((prev) => [...prev, screen]);
  };

  const goBack = () => {
    setScreenStack((prev) => {
      if (prev.length <= 1) return ["home"];
      return prev.slice(0, prev.length - 1);
    });
  };

  const [activeServerUrl, setActiveServerUrl] = useState<string>(serverUrl);
  const [appLanguage, setAppLanguage] = useState<string>("en");
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverModalInput, setServerModalInput] = useState(activeServerUrl);
  const [pingTesting, setPingTesting] = useState(false);

  const [plan, setPlan] = useState<PatientPlan | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(planSynchronizer.getStatus());
  const [callState, setCallState] = useState<LiveCallState>(patientCallManager.getState());
  const [loading, setLoading] = useState(true);
  const [isVoiceListening, setIsVoiceListening] = useState(true);

  // Hardware Android Back Button Handler
  useEffect(() => {
    const onHardwareBack = () => {
      if (currentScreen === "call") {
        patientCallManager.endCall("patient_hangup");
        goBack();
        return true;
      }
      if (screenStack.length > 1) {
        goBack();
        return true;
      }
      return false; // Exit app if at root
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [screenStack, currentScreen]);

  // Core Service Synchronizer & Network Poller
  useEffect(() => {
    apiClient.setBaseUrl(activeServerUrl);

    // Register lockscreen notification action categories
    try {
      deviceAlarms.getNotificationCategoryDefinition();
    } catch (_) {}

    const unsubStatus = planSynchronizer.onStatusChange(setSyncStatus);
    const unsubPlan = planSynchronizer.onPlanUpdate(setPlan);
    const unsubCall = patientCallManager.subscribe((st) => {
      setCallState(st);
      if (st.status === "ringing" || st.status === "connected") {
        navigateTo("call");
      }
    });

    if (isVoiceListening) {
      voiceSafety.startListening();
    }
    const unsubVoice = voiceSafety.onDistressDetected(async (detection) => {
      if (plan) {
        await handleEmergencyDistress(
          `Voice Distress Detected: heard "${detection.heard_text}" (${detection.language})`
        );
      }
    });

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    planSynchronizer
      .initialize(initialPatientToken)
      .then((loadedPlan) => {
        setPlan(loadedPlan);
        patientCallManager.connectSignaling(loadedPlan.run_id, loadedPlan.patient_name);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[RecoverRight] Server unreachable, using local clinical shell:", err);
        setLoading(false);
      });

    return () => {
      clearTimeout(safetyTimer);
      unsubStatus();
      unsubPlan();
      unsubCall();
      unsubVoice();
      voiceSafety.stopListening();
      patientCallManager.disconnect();
    };
  }, [initialPatientToken, activeServerUrl, isVoiceListening]);

  const handleTakeDose = async (medId: string) => {
    await planSynchronizer.recordDose(medId, true, "app_button");
  };

  const handleSnoozeDose = async (medId: string) => {
    await planSynchronizer.recordDose(medId, false, "app_button");
  };

  const handleEmergencyDistress = async (heardReason: string) => {
    if (!plan) return;
    await apiClient.sendEmergencyDistress({
      run_id: plan.run_id,
      heard: heardReason,
      severity: "critical",
      source: "voice",
      label: "Patient Mobile Distress Alert",
      patient_name: plan.patient_name,
      client_time: new Date().toISOString(),
    });
  };

  const handleRescheduleRequest = async (fieldId: string) => {
    if (!initialPatientToken) return;
    await apiClient.recordFollowUpAttendance(initialPatientToken, "reschedule_requested", fieldId);
  };

  const handleTestAndSwitchServer = async (targetUrl: string = serverModalInput) => {
    const clean = targetUrl.trim().replace(/\/+$/, "");
    setPingTesting(true);
    try {
      apiClient.setBaseUrl(clean);
      const ok = await apiClient.checkHealth();
      setActiveServerUrl(clean);
      setServerModalInput(clean);
      setPingTesting(false);
      setShowServerModal(false);
      if (ok) {
        planSynchronizer.initialize(initialPatientToken).then((p) => setPlan(p)).catch(() => {});
        Alert.alert("Hospital Connected", `Successfully connected to hospital server at:\n${clean}`);
      } else {
        Alert.alert("Offline Mode", `Server at ${clean} did not respond. Continuing in safe offline demo mode.`);
      }
    } catch (_) {
      setPingTesting(false);
      setShowServerModal(false);
      Alert.alert("Offline Mode", `Continuing in safe offline demo mode.`);
    }
  };

  // Fallback demo plan when offline
  const activePlan: PatientPlan = plan || {
    run_id: "demo_patient_01",
    patient_name: "Self-Care Patient",
    phone: "+91 99000 00000",
    language: "en",
    version: 1,
    approved_at: new Date().toISOString(),
    hospital_name: "RecoverRight Care",
    is_self_managed: true,
    plan_duration_days: 14,
    medications: [
      {
        medication_id: "med_demo_01",
        name: "Paracetamol 500mg",
        dose: "1 tablet after meals",
        frequency: "twice daily",
        instructions: "Take after food with a full glass of water",
        times: ["08:00 AM", "08:00 PM"],
        requires_time_setting: false,
        status: "pending",
      },
      {
        medication_id: "med_demo_02",
        name: "Amoxicillin 250mg",
        dose: "1 capsule",
        frequency: "three times daily",
        instructions: "Complete the full course even if you feel better",
        times: ["08:00 AM", "02:00 PM", "08:00 PM"],
        requires_time_setting: false,
        status: "taken",
        last_taken_at: new Date().toISOString(),
      },
    ],
    instructions: { general: ["Stay hydrated and rest adequately during recovery.", "Avoid heavy physical activity for 5 days."] },
    follow_ups: [
      {
        field_id: "fu_01",
        what: "Post-Discharge Clinical Tele-Review",
        when: "In 7 days",
        where: "Hospital Outpatient Clinic",
        doctor: "Dr. Sharma",
      },
    ],
    contacts: [
      { label: "Sister Anita (Care Navigator)", value: "+91 98765 43210" },
      { label: "Hospital Emergency Helpline", value: "108" },
    ],
  };

  const calculatedRecoveryDay = useMemo(() => {
    if (!activePlan?.approved_at) return 1;
    const diffMs = Date.now() - new Date(activePlan.approved_at).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, Math.min(days, activePlan.plan_duration_days || 14));
  }, [activePlan?.approved_at, activePlan?.plan_duration_days]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <View style={styles.loadingCard}>
          <Text style={styles.loadingLogo}>🏥</Text>
          <Text style={styles.loadingTitle}>RecoverRight Companion</Text>
          <Text style={styles.loadingSubtitle}>Connecting to clinical handover network...</Text>
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  // Active Live Call Screen
  if (currentScreen === "call" || callState.status === "ringing" || callState.status === "connected") {
    return (
      <SafeAreaView style={styles.fullScreen}>
        <CallScreen
          callState={callState}
          onHangup={() => {
            patientCallManager.endCall("patient_hangup");
            goBack();
          }}
          onAcceptIncoming={() => patientCallManager.acceptIncomingCall()}
        />
      </SafeAreaView>
    );
  }

  // Screen Title Formatter for Top Bar
  const getScreenTitle = (): string => {
    if (appLanguage === "hi") {
      switch (currentScreen) {
        case "home": return "रिकवरी डैशबोर्ड";
        case "alarms": return "दवाई अलार्म";
        case "calendar": return "अपॉइंटमेंट कैलेंडर";
        case "vitals": return "वाइटल्स व MEWS";
        case "settings": return "सेटिंग्स";
        case "voice_assistant": return "AI केयर सहायक";
        case "voice_persona": return "वॉइस साथी";
        case "recovery_story": return "रिकवरी प्रमाण पत्र";
        case "privacy_policy": return "डेटा सुरक्षा व गोपनीयता";
        case "consent_gate": return "सिस्टम अनुमतियाँ";
        case "login": return "मरीज़ साइन इन";
        default: return "Aurevia RecoverRight";
      }
    }
    switch (currentScreen) {
      case "home": return "Dashboard";
      case "alarms": return "Dose Alarms";
      case "calendar": return "OPD Calendar";
      case "vitals": return "Vitals & MEWS";
      case "settings": return "Settings";
      case "voice_assistant": return "AI Care Assistant";
      case "voice_persona": return "Voice Companions";
      case "recovery_story": return "Recovery Certificate";
      case "privacy_policy": return "Privacy & Data Safety";
      case "consent_gate": return "Permissions Gateway";
      case "login": return "Patient Sign In";
      default: return "RecoverRight";
    }
  };

  const isTabScreen = ["home", "alarms", "vitals", "settings"].includes(currentScreen);
  const showTopBar = !["consent_gate", "login"].includes(currentScreen);
  const showBottomBar = !["consent_gate", "login"].includes(currentScreen);

  return (
    <SafeAreaView style={styles.fullScreen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Unified Navigation & Status Bar ── */}
      {showTopBar && (
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            {!isTabScreen ? (
              <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backButton}>
                <Text style={styles.backButtonIcon}>←</Text>
                <Text style={styles.backButtonLabel}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.brandRow}>
                <Image
                  source={require("./assets/logo.png")}
                  style={{ width: 26, height: 26, borderRadius: 6, marginRight: 8 }}
                  resizeMode="contain"
                />
                <Text style={styles.brandName}>RecoverRight</Text>
              </View>
            )}
          </View>

          <View style={styles.topBarCenter}>
            <Text style={styles.screenTitleText} numberOfLines={1}>
              {getScreenTitle()}
            </Text>
          </View>

          {/* Connection Status Pill -> Click opens Quick Server Sheet */}
          <TouchableOpacity
            onPress={() => setShowServerModal(true)}
            activeOpacity={0.8}
            style={[
              styles.connectionPill,
              syncStatus.server_reachable ? styles.connectionPillLive : styles.connectionPillOffline,
            ]}
          >
            <View
              style={[
                styles.connectionDot,
                syncStatus.server_reachable ? styles.connectionDotLive : styles.connectionDotOffline,
              ]}
            />
            <Text
              style={[
                styles.connectionPillText,
                syncStatus.server_reachable ? styles.connectionPillTextLive : styles.connectionPillTextOffline,
              ]}
            >
              {syncStatus.server_reachable ? "Live" : "Offline Demo"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main Screen Viewport (Zero Nested Scroll Conflict) ── */}
      <View style={styles.contentViewport}>
        {currentScreen === "home" && (
          <HomeScreen
            plan={activePlan}
            syncStatus={syncStatus}
            token={initialPatientToken}
            language={appLanguage}
            onLanguageChange={setAppLanguage}
            recoveryDay={calculatedRecoveryDay}
            totalRecoveryDays={activePlan.plan_duration_days || 14}
            onTakeDose={handleTakeDose}
            onSnoozeDose={handleSnoozeDose}
            onEmergencyTrigger={handleEmergencyDistress}
            onNavigateToCall={() => {
              patientCallManager.initiateCallToNurse();
              navigateTo("call");
            }}
            onNavigateToCalendar={() => navigateTo("calendar")}
            onNavigateToAlarms={() => navigateTo("alarms")}
            onNavigateToSettings={() => navigateTo("settings")}
            onNavigateToVoice={() => navigateTo("voice_assistant")}
            onNavigateToVitals={() => navigateTo("vitals")}
            onNavigateToPersona={() => navigateTo("voice_persona")}
            onNavigateToStory={() => navigateTo("recovery_story")}
          />
        )}

        {currentScreen === "calendar" && (
          <CalendarScreen
            followUps={activePlan.follow_ups}
            patientName={activePlan.patient_name}
            onBack={goBack}
            onRescheduleRequest={handleRescheduleRequest}
          />
        )}

        {currentScreen === "alarms" && (
          <AlarmsScreen
            alarms={deviceAlarms.getActiveAlarms()}
            language={appLanguage}
            patientName={activePlan.patient_name}
            onBack={goBack}
            onNavigateToPersona={() => navigateTo("voice_persona")}
          />
        )}

        {currentScreen === "safety" && (
          <VoiceSafetyScreen
            onBack={goBack}
            onDistressDetected={async (detection) => {
              await handleEmergencyDistress(`Voice match: ${detection.heard_text}`);
            }}
          />
        )}

        {currentScreen === "settings" && (
          <PatientSettingsScreen
            currentServerUrl={activeServerUrl}
            onServerUrlChange={(newUrl) => {
              setActiveServerUrl(newUrl);
              apiClient.setBaseUrl(newUrl);
            }}
            language={appLanguage}
            onLanguageChange={setAppLanguage}
            backgroundListening={isVoiceListening}
            onBackgroundListeningChange={(enabled) => {
              setIsVoiceListening(enabled);
              if (enabled) voiceSafety.startListening();
              else voiceSafety.stopListening();
            }}
            onNavigateToConsentGate={() => navigateTo("consent_gate")}
            onNavigateToLogin={() => navigateTo("login")}
            onNavigateToPersona={() => navigateTo("voice_persona")}
            onNavigateToPrivacyPolicy={() => navigateTo("privacy_policy")}
            onBack={goBack}
          />
        )}

        {currentScreen === "voice_assistant" && (
          <VoiceAssistantScreen
            patientToken={initialPatientToken}
            patientName={activePlan.patient_name}
            onBack={goBack}
            onEmergencyTrigger={handleEmergencyDistress}
          />
        )}

        {currentScreen === "vitals" && (
          <VitalsScreen
            patientToken={initialPatientToken}
            patientName={activePlan.patient_name}
            onBack={goBack}
            onEmergencyTrigger={handleEmergencyDistress}
          />
        )}

        {currentScreen === "consent_gate" && (
          <ConsentGateScreen
            onConsentCompleted={() => navigateTo("login")}
            onOpenPrivacyPolicy={() => navigateTo("privacy_policy")}
          />
        )}

        {currentScreen === "login" && (
          <PatientLoginScreen
            onLoginSuccess={(token, name) => {
              planSynchronizer.initialize(token).then((loaded) => setPlan(loaded));
              setScreenStack(["home"]);
            }}
            onSkipToDemo={() => setScreenStack(["home"])}
          />
        )}

        {currentScreen === "voice_persona" && (
          <VoicePersonaScreen
            patientName={activePlan.patient_name}
            onSelectPersona={() => {}}
            onBack={goBack}
          />
        )}

        {currentScreen === "recovery_story" && (
          <RecoveryStoryScreen
            patientName={activePlan.patient_name}
            runId={activePlan.run_id}
            onBack={goBack}
          />
        )}

        {currentScreen === "privacy_policy" && (
          <PrivacyPolicyScreen onBack={goBack} />
        )}
      </View>

      {/* ── Bottom Fixed Tab Bar ── */}
      {showBottomBar && (
        <View style={styles.bottomTabBar}>
          <TouchableOpacity
            onPress={() => navigateTo("home")}
            activeOpacity={0.7}
            style={[styles.tabItem, currentScreen === "home" && styles.tabItemActive]}
          >
            <Text style={styles.tabIcon}>🏠</Text>
            <Text style={[styles.tabLabel, currentScreen === "home" && styles.tabLabelActive]}>
              {appLanguage === "hi" ? "डैशबोर्ड" : "Home"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateTo("alarms")}
            activeOpacity={0.7}
            style={[styles.tabItem, currentScreen === "alarms" && styles.tabItemActive]}
          >
            <Text style={styles.tabIcon}>⏰</Text>
            <Text style={[styles.tabLabel, currentScreen === "alarms" && styles.tabLabelActive]}>
              {appLanguage === "hi" ? "अलार्म" : "Alarms"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateTo("vitals")}
            activeOpacity={0.7}
            style={[styles.tabItem, currentScreen === "vitals" && styles.tabItemActive]}
          >
            <Text style={styles.tabIcon}>❤️</Text>
            <Text style={[styles.tabLabel, currentScreen === "vitals" && styles.tabLabelActive]}>
              {appLanguage === "hi" ? "वाइटल्स" : "Vitals"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                appLanguage === "hi" ? "नर्स / आपातकालीन कॉल" : "Direct Nurse / Emergency Call",
                appLanguage === "hi" ? "किसको कॉल करना चाहते हैं चुनें:" : "Choose who you would like to call on your phone dialer:",
                [
                  {
                    text: appLanguage === "hi" ? "📞 कॉल नर्स अनिता (+91 98765 43210)" : "📞 Call Nurse Anita (+91 98765 43210)",
                    onPress: () => {
                      Linking.openURL("tel:+919876543210").catch(() => {});
                    },
                  },
                  {
                    text: appLanguage === "hi" ? "🚨 अस्पताल हेल्पलाइन (108)" : "🚨 Hospital Helpline (108)",
                    onPress: () => {
                      Linking.openURL("tel:108").catch(() => {});
                    },
                  },
                  {
                    text: appLanguage === "hi" ? "📞 केयर कोऑर्डिनेटर (+91 98000 00000)" : "📞 Care Coordinator (+91 98000 00000)",
                    onPress: () => {
                      Linking.openURL("tel:+919800000000").catch(() => {});
                    },
                  },
                  { text: appLanguage === "hi" ? "रद्द करें" : "Cancel", style: "cancel" },
                ]
              );
            }}
            activeOpacity={0.7}
            style={styles.tabItem}
          >
            <Text style={styles.tabIcon}>📞</Text>
            <Text style={styles.tabLabel}>
              {appLanguage === "hi" ? "कॉल नर्स" : "Nurse Call"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateTo("settings")}
            activeOpacity={0.7}
            style={[styles.tabItem, currentScreen === "settings" && styles.tabItemActive]}
          >
            <Text style={styles.tabIcon}>⚙️</Text>
            <Text style={[styles.tabLabel, currentScreen === "settings" && styles.tabLabelActive]}>
              {appLanguage === "hi" ? "सेटिंग्स" : "Settings"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Quick Server Connection Modal Sheet ── */}
      <Modal
        visible={showServerModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowServerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>🏥 Hospital Server Connection</Text>
              <TouchableOpacity onPress={() => setShowServerModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Connect mobile companion to your doctor's clinical server. Select a preset or type your PC's IP address:
            </Text>

            {/* Presets */}
            <View style={styles.presetGroup}>
              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer("http://192.168.1.7:8000")}
                style={styles.presetOption}
              >
                <Text style={styles.presetOptionTitle}>🖥️ Wi-Fi Host PC (Current: 192.168.1.7)</Text>
                <Text style={styles.presetOptionSub}>http://192.168.1.7:8000</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer("http://10.21.96.158:8000")}
                style={styles.presetOption}
              >
                <Text style={styles.presetOptionTitle}>🖥️ Wi-Fi PC (Previous IP)</Text>
                <Text style={styles.presetOptionSub}>http://10.21.96.158:8000</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer("https://recoverright-web.onrender.com")}
                style={styles.presetOption}
              >
                <Text style={styles.presetOptionTitle}>🌐 Render Cloud Server</Text>
                <Text style={styles.presetOptionSub}>https://recoverright-web.onrender.com</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer("http://10.0.2.2:8000")}
                style={styles.presetOption}
              >
                <Text style={styles.presetOptionTitle}>📱 Android Studio Emulator</Text>
                <Text style={styles.presetOptionSub}>http://10.0.2.2:8000</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer("http://127.0.0.1:8000")}
                style={styles.presetOption}
              >
                <Text style={styles.presetOptionTitle}>🏠 Localhost</Text>
                <Text style={styles.presetOptionSub}>http://127.0.0.1:8000</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputPrompt}>Or enter custom URL:</Text>
            <TextInput
              style={styles.modalInput}
              value={serverModalInput}
              onChangeText={setServerModalInput}
              placeholder="http://10.21.96.158:8000"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="url"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => handleTestAndSwitchServer(serverModalInput)}
                disabled={pingTesting}
                activeOpacity={0.8}
                style={styles.modalConnectBtn}
              >
                {pingTesting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConnectBtnText}>Test & Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export const App: React.FC<AppProps> = (props) => (
  <ErrorBoundary>
    <AppInternal {...props} />
  </ErrorBoundary>
);

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0,
  },
  contentViewport: {
    flex: 1,
  },
  topBar: {
    height: 54,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  topBarLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  backButtonIcon: {
    fontSize: 18,
    color: "#2563EB",
    fontWeight: "bold",
    marginRight: 4,
  },
  backButtonLabel: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "bold",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  brandName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0F172A",
  },
  topBarCenter: {
    flex: 1,
    alignItems: "center",
  },
  screenTitleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  connectionPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  connectionPillLive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  connectionPillOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  connectionDotLive: {
    backgroundColor: "#10B981",
  },
  connectionDotOffline: {
    backgroundColor: "#F59E0B",
  },
  connectionPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  connectionPillTextLive: {
    color: "#065F46",
  },
  connectionPillTextOffline: {
    color: "#92400E",
  },
  bottomTabBar: {
    height: Platform.OS === "android" ? 64 : 70,
    paddingBottom: Platform.OS === "android" ? 6 : 14,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: "#2563EB",
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "#2563EB",
    fontWeight: "bold",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingCard: {
    alignItems: "center",
    padding: 24,
    maxWidth: 360,
  },
  loadingLogo: {
    fontSize: 52,
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  loadingSubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    maxWidth: 420,
    width: "100%",
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  errorDesc: {
    fontSize: 14,
    color: "#CBD5E1",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  errorDetails: {
    fontSize: 12,
    color: "#EF4444",
    backgroundColor: "#450A0A",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    width: "100%",
    textAlign: "center",
  },
  restartButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  restartButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0F172A",
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "bold",
  },
  modalSub: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 14,
    lineHeight: 17,
  },
  presetGroup: {
    gap: 8,
    marginBottom: 14,
  },
  presetOption: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
  },
  presetOptionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#1E293B",
  },
  presetOptionSub: {
    fontSize: 11,
    color: "#2563EB",
    marginTop: 2,
  },
  inputPrompt: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#334155",
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#0F172A",
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
  },
  modalConnectBtn: {
    flex: 1,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalConnectBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
});
