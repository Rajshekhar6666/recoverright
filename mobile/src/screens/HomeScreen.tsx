import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { PatientPlan, SyncStatus } from "../api/types";
import { nativeSpeech } from "../services/nativeSpeech";
import { apiClient } from "../api/client";
import { speakPersonaText, stopSpeech } from "../services/tts";
import {
  generatePersonaMilestoneSpeech,
  generatePersonaTaskDoneSpeech,
  generatePersonaSosSpeech,
  loadPersonaPreference,
} from "../services/voicePersona";

const I18N = {
  en: {
    greeting: (name: string, hour: number) => {
      if (hour >= 5 && hour < 12) return `Good morning, ${name}!`;
      if (hour >= 12 && hour < 17) return `Good afternoon, ${name}!`;
      if (hour >= 17 && hour < 21) return `Good evening, ${name}!`;
      return `Good night, ${name}!`;
    },
    planTitle: "Your recovery plan",
    motto: "Small steps every day lead to steady progress.",
    scanPillBottle: "Scan Pill Bottle",
    todaysProgress: "Today's progress",
    tasksCompleted: (c: number, total: number) => `${c} of ${total} tasks completed`,
    dayTimeline: (day: number, total: number, rem: number) => `Day ${day} of ${total} planned days — ${rem} days remaining`,
    disclaimer: "Planned duration is an estimated recovery timeline from your care team, not a guarantee of clinical recovery.",
    viewMilestone: "View Milestone Quote",
    yourTasks: "Your tasks",
    voiceTip: "Say \"task 1 done\" or \"I took my medicine\"",
    markDone: "Mark done",
    done: "✓ Done",
    myMedications: "My medications",
    upcomingAppointments: "Upcoming appointments",
    needToChange: "Need to change or reschedule?",
    callNow: "📞 Call now",
    voiceCompanion: "Voice Companion",
    turnOnVoice: "🎙️ Turn on voice",
    turnOffVoice: "⏹️ Turn off voice",
    listeningNow: "Listening... speak now",
    readyToListen: "Ready to listen",
    listeningOff: "Listening is off.",
    tryPrompt: "Try: \"task 1 done\", \"I took my medicine\", \"help\"",
    sensitivity: "Sensitivity",
    language: "Language",
    spokenReplies: "Spoken replies",
    needHelp: "Need help?",
    needHelpSub: "Have a question, need assistance, or feeling unwell?",
    sosBtn: "⚠️ I need help now",
    callCareTeam: "📞 Call Care Team",
    sendMessage: "💬 Send a message",
    emergencyNote: "In an emergency, call your local emergency number (108).",
    yourCareTeam: "Your care team",
    call: "📞 Call",
    milestoneTitle: "Recovery Milestone",
    milestoneQuote: "\"Small, consistent steps each morning build the foundation of lasting healing. You are doing wonderful work today.\"",
    milestoneAuthor: "— Aurevia Hospital Clinical Care Team",
    milestoneBtn: "Continue My Recovery",
    scanModalTitle: "Scan Pill Bottle",
    scanModalSubtitle: "Point camera at your prescription label to verify medicine and dose.",
    selectMedToScan: "Select Medicine to Scan",
    matchedLabel: "✓ MATCHED PRESCRIPTION LABEL",
    batch: "Batch",
    pharmacyVerified: "Aurevia Hospital Pharmacy Verified",
    recordDoseBtn: "Record Dose as Taken",
    cancel: "Cancel",
    verifiedSuccessTitle: "Prescription Verified",
    verifiedSuccessMsg: (medName: string) => `${medName} dose recorded and verified in your recovery plan.`,
    task1: { title: "Wound care", sub: "Keep the area clean and dry." },
    task2: { title: "Take your medicine", sub: "Take all doses as scheduled." },
    task3: { title: "Recovery exercises", sub: "Use support when walking." },
    task4: { title: "Follow-up appointment", sub: "Confirm your next appointment." },
    task5: { title: "Drink fluids", sub: "Stay hydrated and eat light meals." },
  },
  hi: {
    greeting: (name: string, hour: number) => {
      if (hour >= 5 && hour < 12) return `शुभ प्रभात, ${name}!`;
      if (hour >= 12 && hour < 17) return `नमस्कार, ${name}!`;
      if (hour >= 17 && hour < 21) return `शुभ संध्या, ${name}!`;
      return `शुभ रात्रि, ${name}!`;
    },
    planTitle: "आपकी रिकवरी योजना",
    motto: "हर दिन छोटे कदम लगातार स्वस्थ होने की ओर ले जाते हैं।",
    scanPillBottle: "दवा की बोतल स्कैन करें",
    todaysProgress: "आज की प्रगति",
    tasksCompleted: (c: number, total: number) => `${total} में से ${c} कार्य पूर्ण`,
    dayTimeline: (day: number, total: number, rem: number) => `${total} में से दिन ${day} — ${rem} दिन शेष`,
    disclaimer: "योजनाबद्ध अवधि आपकी देखभाल टीम द्वारा अनुमानित रिकवरी समय है, कोई चिकित्सीय गारंटी नहीं।",
    viewMilestone: "प्रेरणादायक संदेश देखें",
    yourTasks: "आपके दैनिक कार्य",
    voiceTip: "बोलें \"टास्क 1 हो गया\" या \"दवा ले ली\"",
    markDone: "पूर्ण करें",
    done: "✓ पूर्ण हुआ",
    myMedications: "मेरी दवाइयाँ",
    upcomingAppointments: "आगामी अपॉइंटमेंट्स",
    needToChange: "समय बदलना या दोबारा तय करना है?",
    callNow: "📞 अभी कॉल करें",
    voiceCompanion: "आवाज़ साथी (Voice Companion)",
    turnOnVoice: "🎙️ आवाज़ चालू करें",
    turnOffVoice: "⏹️ आवाज़ बंद करें",
    listeningNow: "सुन रहा हूँ... अब बोलें",
    readyToListen: "सुनने के लिए तैयार",
    listeningOff: "आवाज़ बंद है।",
    tryPrompt: "बोलें: \"टास्क 1 हो गया\", \"दवा ले ली\", \"मदद\"",
    sensitivity: "संवेदनशीलता",
    language: "भाषा (Language)",
    spokenReplies: "बोलकर उत्तर दें",
    needHelp: "मदद चाहिए?",
    needHelpSub: "कोई सवाल है, सहायता चाहिए, या अस्वस्थ लग रहा है?",
    sosBtn: "⚠️ मुझे तुरंत मदद चाहिए",
    callCareTeam: "📞 केयर टीम को कॉल करें",
    sendMessage: "💬 संदेश भेजें",
    emergencyNote: "आपात स्थिति में अपने स्थानीय आपातकालीन नंबर (108) पर कॉल करें।",
    yourCareTeam: "आपकी देखभाल टीम",
    call: "📞 कॉल करें",
    milestoneTitle: "प्रेरणादायक रिकवरी संदेश",
    milestoneQuote: "\"हर सुबह उठाए गए छोटे और दृढ़ कदम ही संपूर्ण स्वास्थ्य लाभ की नींव रखते हैं। आप बहुत अच्छा प्रयास कर रहे हैं।\"",
    milestoneAuthor: "— ऑरेविया अस्पताल (Aurevia Hospital) केयर टीम",
    milestoneBtn: "रिकवरी जारी रखें",
    scanModalTitle: "दवा की बोतल स्कैन करें",
    scanModalSubtitle: "दवा और खुराक की पुष्टि के लिए अपने प्रिस्क्रिप्शन लेबल पर कैमरा लाएं।",
    selectMedToScan: "स्कैन करने के लिए दवा चुनें",
    matchedLabel: "✓ सत्यापित प्रिस्क्रिप्शन लेबल",
    batch: "बैच",
    pharmacyVerified: "ऑरेविया अस्पताल फार्मेसी द्वारा सत्यापित",
    recordDoseBtn: "खुराक दर्ज करें",
    cancel: "रद्द करें",
    verifiedSuccessTitle: "दवा सत्यापित",
    verifiedSuccessMsg: (medName: string) => `${medName} की खुराक सफलतापूर्वक दर्ज कर ली गई है।`,
    task1: { title: "घाव की देखभाल", sub: "घाव के क्षेत्र को साफ और सूखा रखें।" },
    task2: { title: "अपनी दवा लें", sub: "समय पर सभी खुराक लें।" },
    task3: { title: "रिकवरी व्यायाम", sub: "चलते समय सहारे का प्रयोग करें।" },
    task4: { title: "डॉक्टर से मिलना (फॉलो-अप)", sub: "अपनी अगली अपॉइंटमेंट की पुष्टि करें।" },
    task5: { title: "पर्याप्त तरल पदार्थ पिएं", sub: "खूब पानी पिएं और हल्का सुपाच्य भोजन लें।" },
  },
};

function getTimeGreeting(name: string, lang: "en" | "hi" = "en"): { greeting: string; icon: string } {
  const hour = new Date().getHours();
  let icon = "☀️";
  if (hour >= 5 && hour < 12) icon = "🌅";
  else if (hour >= 12 && hour < 17) icon = "☀️";
  else if (hour >= 17 && hour < 21) icon = "🌆";
  else icon = "🌙";
  return { greeting: I18N[lang].greeting(name, hour), icon };
}

interface Props {
  plan: PatientPlan;
  syncStatus: SyncStatus;
  token?: string;
  onTakeDose: (medId: string) => Promise<void>;
  onSnoozeDose: (medId: string) => Promise<void>;
  onEmergencyTrigger: (reason: string) => Promise<void>;
  onNavigateToCall: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToAlarms: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToVoice?: () => void;
  onNavigateToVitals?: () => void;
  onNavigateToPersona?: () => void;
  onNavigateToStory?: () => void;
  recoveryDay?: number;
  totalRecoveryDays?: number;
  language?: string;
  onLanguageChange?: (lang: string) => void;
}

interface DailyTask {
  id: string;
  number: number;
  icon: string;
  title: string;
  subtitle: string;
  completed: boolean;
}

export const HomeScreen: React.FC<Props> = ({
  plan,
  syncStatus,
  token,
  onTakeDose,
  onSnoozeDose,
  onEmergencyTrigger,
  onNavigateToCall,
  onNavigateToCalendar,
  onNavigateToAlarms,
  onNavigateToSettings,
  onNavigateToVoice,
  onNavigateToVitals,
  recoveryDay = 1,
  totalRecoveryDays = 14,
  language = "en",
  onLanguageChange,
}) => {
  const [currentLang, setCurrentLang] = useState<"en" | "hi">(
    language === "hi" || plan.language === "hi" ? "hi" : "en"
  );

  useEffect(() => {
    if (language === "hi" || language === "en") {
      setCurrentLang(language as "en" | "hi");
    }
  }, [language]);

  const switchLanguage = (newLang: "en" | "hi") => {
    setCurrentLang(newLang);
    setVoiceLang(newLang);
    if (onLanguageChange) onLanguageChange(newLang);
  };

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScanCaptured, setIsScanCaptured] = useState(false);
  const isContinuousListeningRef = useRef(false);
  const t = I18N[currentLang];
  const patientDisplayName = plan.patient_name?.split(" ")[0] || "Priya";
  const { greeting } = getTimeGreeting(patientDisplayName, currentLang);
  const remainingDays = Math.max(0, totalRecoveryDays - recoveryDay);

  // Daily Tasks State — seeded from live plan.tasks_today, falls back to defaults
  const defaultTasks: DailyTask[] = [
    { id: "task_1", number: 1, icon: "🛡️", title: "Wound care", subtitle: "Keep the area clean and dry.", completed: false },
    { id: "task_2", number: 2, icon: "💊", title: "Take your medicine", subtitle: "Take all doses as scheduled.", completed: false },
    { id: "task_3", number: 3, icon: "🚶", title: "Recovery exercises", subtitle: "Use support when walking.", completed: false },
    { id: "task_4", number: 4, icon: "📅", title: "Follow-up appointment", subtitle: "Confirm your next appointment.", completed: false },
    { id: "task_5", number: 5, icon: "💧", title: "Drink fluids", subtitle: "Stay hydrated and eat light meals.", completed: false },
  ];

  const taskIconMap: Record<string, string> = {
    wound: "🛡️", medicine: "💊", medication: "💊", exercise: "🚶", walk: "🚶",
    appointment: "📅", follow: "📅", fluid: "💧", water: "💧", hydrat: "💧",
    rest: "🛌", sleep: "🛌", diet: "🥗", food: "🥗", vitals: "🩺", check: "✅",
  };

  const getTaskIcon = (title: string): string => {
    const lower = title.toLowerCase();
    for (const [key, icon] of Object.entries(taskIconMap)) {
      if (lower.includes(key)) return icon;
    }
    return "✅";
  };

  const seedTasks = useMemo((): DailyTask[] => {
    const apiTasks = (plan as any).tasks_today as Array<{ task_id: string; title?: string; description?: string; completed?: boolean }> | undefined;
    if (apiTasks && apiTasks.length > 0) {
      return apiTasks.map((t, idx) => ({
        id: t.task_id,
        number: idx + 1,
        icon: getTaskIcon(t.title || ""),
        title: t.title || `Task ${idx + 1}`,
        subtitle: t.description || "",
        completed: t.completed || false,
      }));
    }
    return defaultTasks;
  }, [plan.run_id]);

  const [tasks, setTasks] = useState<DailyTask[]>(seedTasks);

  const displayMedications = useMemo(() => {
    if (plan.medications && plan.medications.length > 0) {
      return plan.medications.map((m, idx) => {
        let times = (m.times || []).filter((t) => t && t !== "time_not_set");
        if (times.length === 0) {
          const freq = (m.frequency || "").toLowerCase();
          if (freq.includes("three") || freq.includes("tid") || freq.includes("3")) {
            times = ["8:00 AM", "2:00 PM", "8:00 PM"];
          } else if (freq.includes("twice") || freq.includes("bid") || freq.includes("2")) {
            times = ["8:00 AM", "8:00 PM"];
          } else {
            times = ["8:00 AM"];
          }
        }
        return {
          id: m.medication_id || `med_${idx}`,
          name: m.name,
          dose: m.dose,
          frequency: m.frequency,
          duration: m.instructions || m.dose || "As directed",
          times,
        };
      });
    }
    return [
      { id: "f2", name: "Paracetamol 500 mg", dose: "500 mg", frequency: "Three times daily", duration: "5 days", times: ["8:00 AM", "2:00 PM", "8:00 PM"] },
      { id: "f3", name: "Amoxicillin 500 mg", dose: "500 mg", frequency: "Twice daily", duration: "5 days", times: ["8:00 AM", "8:00 PM"] },
      { id: "f4", name: "Pantoprazole 40 mg", dose: "40 mg", frequency: "Once daily", duration: "14 days · Once daily before breakfast", times: ["8:00 AM"] },
    ];
  }, [plan.medications]);

  // Medication Doses Taken State
  const [takenDoses, setTakenDoses] = useState<Record<string, boolean>>({});

  // Voice Companion State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"en" | "hi">("en");
  const [voiceSensitivity, setVoiceSensitivity] = useState<"high" | "standard">("high");
  const [spokenReplies, setSpokenReplies] = useState(true);
  const [voiceStatusText, setVoiceStatusText] = useState("Ready to listen");
  const [heardTranscript, setHeardTranscript] = useState<string | null>(null);

  // Modals
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showPillScanModal, setShowPillScanModal] = useState(false);
  const [selectedScanMedIndex, setSelectedScanMedIndex] = useState(0);
  const [hasShownMilestone, setHasShownMilestone] = useState(false);
  const [customMedInput, setCustomMedInput] = useState("");
  const [scannedMedOverride, setScannedMedOverride] = useState<{
    name: string;
    dose?: string;
    isContraindicated?: boolean;
    warning?: string;
  } | null>(null);

  const openPillScanner = (medIndex: number = 0) => {
    setSelectedScanMedIndex(medIndex);
    setScannedMedOverride(null);
    setCustomMedInput("");
    setIsScanCaptured(false);
    setShowPillScanModal(true);
  };

  const handleScanCustomMedicine = (name: string, dose?: string, isWarning?: boolean, warnText?: string) => {
    const isIbu = name.toLowerCase().includes("ibuprofen") || isWarning;
    const isAsp = name.toLowerCase().includes("aspirin");
    if (isIbu || isAsp) {
      const warn = warnText || (isIbu
        ? (currentLang === "hi"
            ? "सुरक्षा चेतावनी: Ibuprofen एक NSAID है जो आपके डिस्चार्ज प्लान में नहीं है। यह ब्लीडिंग का जोखिम बढ़ा सकती है। कृपया इसे न लें।"
            : "SAFETY ALERT: Ibuprofen is an NSAID not prescribed in your discharge plan. NSAIDs can increase bleeding risk. Do NOT take this medication.")
        : (currentLang === "hi"
            ? "सुरक्षा चेतावनी: Aspirin आपके प्लान में नहीं है। यह सर्जरी के बाद खून पतला करके ब्लीडिंग का जोखिम बढ़ा सकती है।"
            : "SAFETY ALERT: Aspirin is a blood thinner not prescribed in your recovery plan. Do not take this medication."));
      setScannedMedOverride({
        name,
        dose: dose || "400 mg",
        isContraindicated: true,
        warning: warn,
      });
      setIsScanCaptured(true);
      const activePersona = loadPersonaPreference();
      speakPersonaText(
        currentLang === "hi"
          ? `चेतावनी! ${name} आपके डॉक्टर के पर्चे में नहीं है। कृपया यह दवा न लें।`
          : `Warning! ${name} is not on your prescription. Do not take this medication.`,
        activePersona,
        currentLang
      );
      return;
    }

    const matchedIdx = displayMedications.findIndex(
      (m) => m.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(m.name.toLowerCase())
    );
    if (matchedIdx !== -1) {
      setSelectedScanMedIndex(matchedIdx);
      setScannedMedOverride(null);
    } else {
      setScannedMedOverride({
        name,
        dose: dose || "Prescribed dose",
        isContraindicated: false,
      });
    }
    setIsScanCaptured(true);
    const activePersona = loadPersonaPreference();
    const verifyMsg =
      currentLang === "hi"
        ? `${name} का प्रिस्क्रिप्शन लेबल सत्यापित हो गया है!`
        : `${name} verified from prescription!`;
    speakPersonaText(verifyMsg, activePersona, currentLang);
  };

  // Auto-popup Milestone Quote upon completion of tasks
  useEffect(() => {
    if (tasks.length > 0 && tasks.every((item) => item.completed) && !hasShownMilestone) {
      setShowMilestoneModal(true);
      setHasShownMilestone(true);
    }
  }, [tasks, hasShownMilestone]);

  const getTaskTitle = (tItem: DailyTask) => {
    if (currentLang === "hi") {
      const lower = tItem.title.toLowerCase();
      if (lower.includes("wound")) return t.task1.title;
      if (lower.includes("medicine") || lower.includes("dawa")) return t.task2.title;
      if (lower.includes("exercise") || lower.includes("walk")) return t.task3.title;
      if (lower.includes("appointment") || lower.includes("follow")) return t.task4.title;
      if (lower.includes("fluid") || lower.includes("water")) return t.task5.title;
    }
    return tItem.title;
  };

  const getTaskSubtitle = (tItem: DailyTask) => {
    if (currentLang === "hi") {
      const lower = tItem.title.toLowerCase();
      if (lower.includes("wound")) return t.task1.sub;
      if (lower.includes("medicine") || lower.includes("dawa")) return t.task2.sub;
      if (lower.includes("exercise") || lower.includes("walk")) return t.task3.sub;
      if (lower.includes("appointment") || lower.includes("follow")) return t.task4.sub;
      if (lower.includes("fluid") || lower.includes("water")) return t.task5.sub;
    }
    return tItem.subtitle;
  };

  // Direct Phone Dialer Action
  const directPhoneCall = (phoneNumber: string, name?: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9+]/g, "");
    const telUrl = `tel:${cleanNumber}`;
    Linking.canOpenURL(telUrl)
      .then((supported) => {
        if (!supported) {
          Alert.alert("Dialer Unavailable", `Cannot make calls to ${phoneNumber} on this device.`);
        } else {
          Linking.openURL(telUrl);
        }
      })
      .catch((err) => {
        Alert.alert("Call Error", `Failed to dial ${phoneNumber}: ${err?.message || ""}`);
      });
  };

  // Toggle Task Completion & Sync with Server
  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const newCompleted = !t.completed;
          const activeToken = token || (plan as any).patient_token || plan.patient_slug || "pat_demo_straightforward";
          apiClient.updateTaskAction(activeToken, taskId, newCompleted ? "complete" : "reset").catch(() => {});
          if (newCompleted) {
            const activePersona = loadPersonaPreference();
            const taskText = getTaskTitle(t);
            const cheer = generatePersonaTaskDoneSpeech(activePersona, taskText, patientDisplayName, currentLang);
            speakPersonaText(cheer, activePersona, currentLang);
          }
          return { ...t, completed: newCompleted };
        }
        return t;
      })
    );
  };

  // Toggle Medication Dose & Sync with Server
  const toggleDose = async (medId: string, timeKey: string) => {
    const isTaken = takenDoses[timeKey];
    setTakenDoses((p) => ({ ...p, [timeKey]: !isTaken }));
    if (!isTaken) {
      await onTakeDose(medId);
      const activePersona = loadPersonaPreference();
      const med = displayMedications.find((m) => m.id === medId);
      if (med) {
        const cheer = generatePersonaTaskDoneSpeech(activePersona, med.name, patientDisplayName, currentLang);
        speakPersonaText(cheer, activePersona, currentLang);
      }
    } else {
      await onSnoozeDose(medId);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  // Handle Speech Recognition Result
  const handleHeardUtterance = (rawText: string) => {
    const text = rawText.toLowerCase().trim();
    setHeardTranscript(rawText);
    const activePersona = loadPersonaPreference();

    // Command: Task 1 Done / Wound care
    if (text.includes("task 1") || text.includes("wound") || text.includes("saaf") || text.includes("ghav")) {
      setTasks((prev) => prev.map((t) => (t.id === "task_1" ? { ...t, completed: true } : t)));
      setVoiceStatusText(`✓ Marked "Wound care" complete`);
      const cheer = generatePersonaTaskDoneSpeech(activePersona, currentLang === "hi" ? "घाव की देखभाल" : "Wound care", patientDisplayName, currentLang);
      speakPersonaText(cheer, activePersona, currentLang);
      return;
    }

    // Command: Took medicine / Task 2 Done / Dawa
    if (text.includes("medicine") || text.includes("task 2") || text.includes("dawa") || text.includes("pill") || text.includes("paracetamol") || text.includes("amoxicillin") || text.includes("pantoprazole")) {
      setTasks((prev) => prev.map((t) => (t.id === "task_2" || t.title.toLowerCase().includes("medicine") ? { ...t, completed: true } : t)));
      const matchedMed = displayMedications.find((m) => text.includes(m.name.toLowerCase().split(" ")[0])) || displayMedications[0];
      if (matchedMed) {
        const update: Record<string, boolean> = {};
        (matchedMed.times || []).forEach((tm) => { update[`${matchedMed.id}_${tm}`] = true; });
        setTakenDoses((prev) => ({ ...prev, ...update }));
        onTakeDose(matchedMed.id);
        setVoiceStatusText(`✓ Recorded ${matchedMed.name} taken`);
        const cheer = generatePersonaTaskDoneSpeech(activePersona, matchedMed.name, patientDisplayName, currentLang);
        speakPersonaText(cheer, activePersona, currentLang);
      }
      return;
    }

    // Command: Task 3 / Exercises / Walk
    if (text.includes("task 3") || text.includes("exercise") || text.includes("walk") || text.includes("kasrat")) {
      setTasks((prev) => prev.map((t) => (t.id === "task_3" ? { ...t, completed: true } : t)));
      setVoiceStatusText(`✓ Marked "Recovery exercises" complete`);
      const cheer = generatePersonaTaskDoneSpeech(activePersona, currentLang === "hi" ? "रिकवरी व्यायाम" : "Recovery exercises", patientDisplayName, currentLang);
      speakPersonaText(cheer, activePersona, currentLang);
      return;
    }

    // Command: Task 4 / Appointment
    if (text.includes("task 4") || text.includes("appointment") || text.includes("doctor")) {
      setTasks((prev) => prev.map((t) => (t.id === "task_4" ? { ...t, completed: true } : t)));
      setVoiceStatusText(`✓ Confirmed follow-up appointment`);
      const cheer = generatePersonaTaskDoneSpeech(activePersona, currentLang === "hi" ? "फॉलो-अप अपॉइंटमेंट" : "Follow-up appointment", patientDisplayName, currentLang);
      speakPersonaText(cheer, activePersona, currentLang);
      return;
    }

    // Command: Task 5 / Drink fluids / Water
    if (text.includes("task 5") || text.includes("fluid") || text.includes("water") || text.includes("paani")) {
      setTasks((prev) => prev.map((t) => (t.id === "task_5" ? { ...t, completed: true } : t)));
      setVoiceStatusText(`✓ Marked hydration goal complete`);
      const cheer = generatePersonaTaskDoneSpeech(activePersona, currentLang === "hi" ? "तरल पदार्थ" : "Hydration", patientDisplayName, currentLang);
      speakPersonaText(cheer, activePersona, currentLang);
      return;
    }

    // Command: Emergency / Help / Bachao
    if (text.includes("help") || text.includes("emergency") || text.includes("bachao") || text.includes("madad") || text.includes("pain")) {
      const sosSpeech = generatePersonaSosSpeech(activePersona, patientDisplayName, currentLang);
      speakPersonaText(sosSpeech, activePersona, currentLang);
      onEmergencyTrigger(`Voice Trigger: Heard "${rawText}"`);
      setVoiceStatusText(`⚠️ Emergency alert dispatched!`);
      Alert.alert(
        currentLang === "hi" ? "केयर टीम को सूचित किया गया" : "Care Team Alerted",
        currentLang === "hi"
          ? "आपकी वॉइस अलर्ट Aurevia नर्सिंग टीम को भेज दी गई है।"
          : "Your voice alert has been sent to Nursing Coordinator Anita Singh.",
        [
          { text: currentLang === "hi" ? "नर्स को कॉल करें" : "Call Nurse Now", onPress: () => directPhoneCall("+919876543210") },
          { text: "OK" },
        ]
      );
      return;
    }

    setVoiceStatusText(`Heard: "${rawText}"`);
  };

  // Continuous Voice Listening (Always-Listening Mode)
  const startContinuousListening = async () => {
    isContinuousListeningRef.current = true;
    setIsVoiceActive(true);
    setVoiceStatusText(currentLang === "hi" ? "सुन रहा हूँ... बोलिए" : "Listening... speak now");

    const listenCycle = async () => {
      if (!isContinuousListeningRef.current) return;
      try {
        await nativeSpeech.startListening(currentLang, {
          onStart: () => {
            setVoiceStatusText(currentLang === "hi" ? "सुन रहा हूँ... बोलिए" : "Listening... speak now");
          },
          onResults: (results) => {
            if (results && results.length > 0) {
              handleHeardUtterance(results[0]);
            }
            if (isContinuousListeningRef.current) {
              setTimeout(listenCycle, 400);
            }
          },
          onError: () => {
            if (isContinuousListeningRef.current) {
              setTimeout(listenCycle, 800);
            }
          },
          onEnd: () => {
            if (isContinuousListeningRef.current) {
              setTimeout(listenCycle, 400);
            }
          },
        });
      } catch (_) {
        if (isContinuousListeningRef.current) {
          setTimeout(listenCycle, 1000);
        }
      }
    };

    listenCycle();
  };

  const stopContinuousListening = async () => {
    isContinuousListeningRef.current = false;
    setIsVoiceActive(false);
    await nativeSpeech.stopListening();
    setVoiceStatusText(currentLang === "hi" ? "आवाज़ बंद है।" : "Listening is off.");
  };

  const toggleVoiceListening = async () => {
    if (isVoiceActive) {
      await stopContinuousListening();
    } else {
      await startContinuousListening();
    }
  };

  useEffect(() => {
    return () => {
      isContinuousListeningRef.current = false;
      nativeSpeech.stopListening();
      stopSpeech();
    };
  }, []);

  const openMilestoneModal = () => {
    setShowMilestoneModal(true);
    const activePersona = loadPersonaPreference();
    const milestoneData = generatePersonaMilestoneSpeech(activePersona, patientDisplayName, currentLang);
    speakPersonaText(milestoneData.speech, activePersona, currentLang);
  };

  const primaryContact = plan.contacts?.[0] || { label: "Nurse Anita Singh, care coordinator", value: "+91 98765 43210" };
  const nurseDutyPhone = primaryContact.value || "+91 98765 43210";
  const nurseDisplayName = primaryContact.label || "Nurse Anita Singh, care coordinator";
  const careCoordinatorPhone = plan.contacts?.[1]?.value || "+91 98000 00000";
  const hospitalEmergencyHelpline = "108";

  const primaryAppointment = plan.follow_ups?.[0] || {
    what: "Post-surgery follow-up",
    when: "28 Apr 2025, 10:00 AM",
    where: "CityCare Hospital, Dr. Mehta",
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── 1. Hero Banner: Emerald/Teal Gradient with Aurevia & Language Switcher ── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopMetaRow}>
          <View style={styles.hospitalBrandChip}>
            <Text style={styles.hospitalBrandChipText}>🏥 Aurevia Hospital Network</Text>
          </View>
          <View style={styles.langPill}>
            <TouchableOpacity
              onPress={() => switchLanguage("en")}
              style={[styles.langChoice, currentLang === "en" && styles.langChoiceActive]}
            >
              <Text style={[styles.langChoiceText, currentLang === "en" && styles.langChoiceTextActive]}>EN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchLanguage("hi")}
              style={[styles.langChoice, currentLang === "hi" && styles.langChoiceActive]}
            >
              <Text style={[styles.langChoiceText, currentLang === "hi" && styles.langChoiceTextActive]}>हिन्दी</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>{greeting}</Text>
            <Text style={styles.heroSubtitle}>{t.planTitle}</Text>
            <Text style={styles.heroMotto}>{t.motto}</Text>
            <TouchableOpacity
              style={styles.heroScanBtn}
              activeOpacity={0.85}
              onPress={() => openPillScanner(0)}
            >
              <Text style={styles.heroScanBtnIcon}>📷</Text>
              <Text style={styles.heroScanBtnText}>{t.scanPillBottle}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.heroSunCircle}>
            <Text style={styles.heroSunIcon}>☀️</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Today's Progress Card ── */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeaderRow}>
          <View>
            <Text style={styles.progressSectionTitle}>{t.todaysProgress}</Text>
            <Text style={styles.progressTaskCount}>
              {t.tasksCompleted(completedCount, tasks.length)}
            </Text>
          </View>
          <View style={styles.percentBadge}>
            <Text style={styles.percentBadgeText}>{progressPercent}%</Text>
          </View>
        </View>

        {/* Horizontal Progress Bar */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <Text style={styles.progressTimelineText}>
          {t.dayTimeline(recoveryDay, totalRecoveryDays, remainingDays)}
        </Text>
        <Text style={styles.progressDisclaimerText}>
          {t.disclaimer}
        </Text>

        <TouchableOpacity
          style={styles.milestoneLinkRow}
          activeOpacity={0.7}
          onPress={openMilestoneModal}
        >
          <Text style={styles.milestoneLinkIcon}>📜</Text>
          <Text style={styles.milestoneLinkText}>{t.viewMilestone}</Text>
        </TouchableOpacity>
      </View>

      {/* ── 3. Your Tasks Checklist ── */}
      <View style={styles.tasksSection}>
        <View style={styles.tasksHeaderRow}>
          <Text style={styles.tasksSectionTitle}>{t.yourTasks}</Text>
          <Text style={styles.tasksVoiceTip}>{t.voiceTip}</Text>
        </View>

        {tasks.map((task) => (
          <View key={task.id} style={[styles.taskCard, task.completed && styles.taskCardCompleted]}>
            <View style={styles.taskNumBadge}>
              <Text style={styles.taskNumText}>{task.number}</Text>
            </View>
            <View style={styles.taskIconWrap}>
              <Text style={styles.taskEmoji}>{task.icon}</Text>
            </View>
            <View style={styles.taskInfoWrap}>
              <Text style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}>
                {getTaskTitle(task)}
              </Text>
              <Text style={styles.taskSubtitle}>{getTaskSubtitle(task)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => toggleTask(task.id)}
              activeOpacity={0.8}
              style={[styles.taskDoneBtn, task.completed && styles.taskDoneBtnActive]}
            >
              <Text style={[styles.taskDoneBtnText, task.completed && styles.taskDoneBtnTextActive]}>
                {task.completed ? t.done : t.markDone}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ── 4. My Medications Section ── */}
      <View style={styles.medsSection}>
        <View style={styles.medsHeaderRow}>
          <Text style={styles.medsSectionTitle}>{t.myMedications}</Text>
          <TouchableOpacity
            style={styles.scanPillHeaderBtn}
            activeOpacity={0.8}
            onPress={() => openPillScanner(0)}
          >
            <Text style={styles.scanPillHeaderBtnText}>📷 {t.scanPillBottle}</Text>
          </TouchableOpacity>
        </View>

        {displayMedications.map((med, medIdx) => (
          <View key={med.id} style={styles.medCard}>
            <View style={styles.medHeaderRow}>
              <View style={styles.medIconPill}>
                <Text style={styles.medIconEmoji}>💊</Text>
              </View>
              <View style={styles.medTitleCol}>
                <Text style={styles.medName}>{med.name}</Text>
                <Text style={styles.medDuration}>
                  {med.duration ? `${med.duration}` : ""}{med.frequency && med.frequency !== med.duration ? ` · ${med.frequency}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.medCardScanBtn}
                activeOpacity={0.8}
                onPress={() => openPillScanner(medIdx)}
              >
                <Text style={styles.medCardScanBtnText}>📷 Scan</Text>
              </TouchableOpacity>
            </View>
            {med.times && med.times.length > 0 && (
              <View style={styles.dosePillsRow}>
                {med.times.map((time, idx) => {
                  const key = `${med.id}_${time}`;
                  const isTaken = takenDoses[key];
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => toggleDose(med.id, key)}
                      activeOpacity={0.75}
                      style={[styles.timeChip, isTaken && styles.timeChipTaken]}
                    >
                      <Text style={[styles.timeChipText, isTaken && styles.timeChipTextTaken]}>
                        {isTaken ? `✓ ${time}` : time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* ── 5. Upcoming Appointments ── */}
      <View style={styles.appointmentCard}>
        <Text style={styles.appointmentSectionTitle}>{t.upcomingAppointments}</Text>
        <View style={styles.appointmentRow}>
          <View style={styles.appointmentIconWrap}>
            <Text style={styles.appointmentCalendarEmoji}>📅</Text>
          </View>
          <View style={styles.appointmentDetails}>
            <Text style={styles.appointmentTitle}>{primaryAppointment.what}</Text>
            <Text style={styles.appointmentSubtitle}>
              {primaryAppointment.when}{primaryAppointment.where ? ` · ${primaryAppointment.where}` : ""}{primaryAppointment.doctor ? `, ${primaryAppointment.doctor}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.appointmentActionRow}>
          <Text style={styles.appointmentActionLabel}>{t.needToChange}</Text>
          <TouchableOpacity
            style={styles.appointmentCallBtn}
            activeOpacity={0.8}
            onPress={() => directPhoneCall(careCoordinatorPhone || "+919800000000", "Hospital OPD")}
          >
            <Text style={styles.appointmentCallBtnText}>{t.callNow}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 6. Voice Companion Card ── */}
      <View style={styles.voiceCard}>
        <View style={styles.voiceHeader}>
          <View style={[styles.voiceMicCircle, isVoiceActive && styles.voiceMicCircleActive]}>
            <Text style={styles.voiceMicEmoji}>🎙️</Text>
          </View>
          <Text style={styles.voiceCardTitle}>{t.voiceCompanion}</Text>
          <View style={styles.voiceStatusPill}>
            <View style={[styles.voiceDot, isVoiceActive ? styles.voiceDotLive : styles.voiceDotIdle]} />
            <Text style={styles.voiceStatusText}>{voiceStatusText}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.voiceToggleBtn, isVoiceActive && styles.voiceToggleBtnActive]}
          activeOpacity={0.8}
          onPress={toggleVoiceListening}
        >
          <Text style={styles.voiceToggleBtnText}>
            {isVoiceActive ? t.turnOffVoice : t.turnOnVoice}
          </Text>
        </TouchableOpacity>

        {heardTranscript && (
          <View style={styles.heardTranscriptBox}>
            <Text style={styles.heardTranscriptLabel}>Last Heard:</Text>
            <Text style={styles.heardTranscriptText}>"{heardTranscript}"</Text>
          </View>
        )}

        <Text style={styles.voiceTryLabel}>{t.tryPrompt}</Text>

        {/* Quick Voice Simulation Chips */}
        <View style={styles.quickVoiceChipsRow}>
          {[
            currentLang === "hi" ? "टास्क 1 हो गया" : "task 1 done",
            currentLang === "hi" ? "दवा ले ली" : "I took my medicine",
            currentLang === "hi" ? "टास्क 3 हो गया" : "task 3 done",
            currentLang === "hi" ? "मदद" : "help",
          ].map((prompt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quickChip}
              activeOpacity={0.7}
              onPress={() => handleHeardUtterance(prompt)}
            >
              <Text style={styles.quickChipText}>"{prompt}"</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.voiceControlsRow}>
          <View style={styles.voiceParamGroup}>
            <Text style={styles.voiceParamLabel}>{t.sensitivity}</Text>
            <View style={styles.paramChipsRow}>
              {(["high", "standard"] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.paramChip, voiceSensitivity === s && styles.paramChipActive]}
                  onPress={() => setVoiceSensitivity(s)}
                >
                  <Text style={[styles.paramChipText, voiceSensitivity === s && styles.paramChipTextActive]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.voiceParamGroup}>
            <Text style={styles.voiceParamLabel}>{t.language}</Text>
            <View style={styles.paramChipsRow}>
              <TouchableOpacity
                style={[styles.paramChip, currentLang === "en" && styles.paramChipActive]}
                onPress={() => switchLanguage("en")}
              >
                <Text style={[styles.paramChipText, currentLang === "en" && styles.paramChipTextActive]}>
                  English
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paramChip, currentLang === "hi" && styles.paramChipActive]}
                onPress={() => switchLanguage("hi")}
              >
                <Text style={[styles.paramChipText, currentLang === "hi" && styles.paramChipTextActive]}>
                  हिंदी
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.spokenRepliesRow}
          activeOpacity={0.8}
          onPress={() => setSpokenReplies(!spokenReplies)}
        >
          <Text style={styles.checkboxEmoji}>{spokenReplies ? "☑️" : "⬜"}</Text>
          <Text style={styles.spokenRepliesLabel}>{t.spokenReplies}</Text>
        </TouchableOpacity>
      </View>

      {/* ── 7. Need Help? Card ── */}
      <View style={styles.helpCard}>
        <Text style={styles.helpCardTitle}>{t.needHelp}</Text>
        <Text style={styles.helpCardSubtitle}>{t.needHelpSub}</Text>

        {/* Red SOS Button */}
        <TouchableOpacity
          style={styles.helpSosBtn}
          activeOpacity={0.85}
          onPress={() => {
            onEmergencyTrigger("Patient pressed 'I need help now' on Companion App");
            Alert.alert(
              "Help Request Sent",
              "Your care team has been notified with high priority. A nurse coordinator will contact you immediately.",
              [
                { text: "Call Nurse Anita", onPress: () => directPhoneCall(nurseDutyPhone, "Nurse Anita") },
                { text: "Call Ambulance 108", onPress: () => directPhoneCall(hospitalEmergencyHelpline, "Ambulance") },
                { text: "OK" },
              ]
            );
          }}
        >
          <Text style={styles.helpSosBtnText}>{t.sosBtn}</Text>
        </TouchableOpacity>

        {/* Direct Call Care Team Button */}
        <TouchableOpacity
          style={styles.helpCallTeamBtn}
          activeOpacity={0.8}
          onPress={() => directPhoneCall(nurseDutyPhone, nurseDisplayName)}
        >
          <Text style={styles.helpCallTeamBtnText}>{t.callCareTeam}</Text>
        </TouchableOpacity>

        {/* Secondary Call Button */}
        <TouchableOpacity
          style={styles.helpSecCallBtn}
          activeOpacity={0.8}
          onPress={() => directPhoneCall(careCoordinatorPhone, "Care Coordinator")}
        >
          <Text style={styles.helpSecCallBtnText}>📞 {t.callCareTeam} ({careCoordinatorPhone})</Text>
        </TouchableOpacity>

        {/* Send a Message */}
        <TouchableOpacity
          style={styles.helpMsgBtn}
          activeOpacity={0.8}
          onPress={() => {
            if (onNavigateToVoice) onNavigateToVoice();
          }}
        >
          <Text style={styles.helpMsgBtnText}>{t.sendMessage}</Text>
        </TouchableOpacity>

        <Text style={styles.emergencyHelplineFoot}>{t.emergencyNote}</Text>
      </View>

      {/* ── 8. Your Care Team Card ── */}
      <View style={styles.careTeamCard}>
        <Text style={styles.careTeamSectionTitle}>{t.yourCareTeam}</Text>
        <View style={styles.careTeamRow}>
          <View style={styles.careTeamAvatar}>
            <Text style={styles.careTeamAvatarEmoji}>👩‍⚕️</Text>
          </View>
          <View style={styles.careTeamInfo}>
            <Text style={styles.careTeamName}>{nurseDisplayName}</Text>
            <Text style={styles.careTeamPhone}>{nurseDutyPhone}</Text>
          </View>
          <TouchableOpacity
            style={styles.careTeamCallBtn}
            activeOpacity={0.8}
            onPress={() => directPhoneCall(nurseDutyPhone, nurseDisplayName)}
          >
            <Text style={styles.careTeamCallBtnText}>{t.call}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Milestone Quote Modal ── */}
      <Modal visible={showMilestoneModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🌱</Text>
            <Text style={styles.modalTitle}>{t.milestoneTitle}</Text>
            {(() => {
              const activePersona = loadPersonaPreference();
              const milestoneData = generatePersonaMilestoneSpeech(activePersona, patientDisplayName, currentLang);
              return (
                <>
                  <Text style={styles.modalQuote}>{milestoneData.quote}</Text>
                  <Text style={styles.modalAuthor}>{milestoneData.author}</Text>
                  <TouchableOpacity
                    style={styles.modalSpeakBtn}
                    activeOpacity={0.8}
                    onPress={() => speakPersonaText(milestoneData.speech, activePersona, currentLang)}
                  >
                    <Text style={styles.modalSpeakBtnText}>
                      🔊 {currentLang === "hi" ? "आवाज़ दोबारा सुनें" : "Listen in Voice Persona"}
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                stopSpeech();
                setShowMilestoneModal(false);
              }}
            >
              <Text style={styles.modalCloseBtnText}>{t.milestoneBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Pill Bottle Scanner Modal (Dynamic for Every Medicine in Plan) ── */}
      <Modal visible={showPillScanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.scannerModalCard}>
            <Text style={styles.modalEmoji}>📷</Text>
            <Text style={styles.modalTitle}>{t.scanModalTitle}</Text>
            <Text style={styles.modalSubtitle}>{t.scanModalSubtitle}</Text>

            {/* 1. Prescribed Medications Chips (Every Medicine in Plan) */}
            <Text style={styles.scannerSelectLabel}>
              {currentLang === "hi" ? "📋 आपके डिस्चार्ज प्लान की दवाएं (चुनें या स्कैन करें):" : "📋 Prescribed in Your Plan (Tap to Verify):"}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scannerMedScroll}
              contentContainerStyle={styles.scannerMedScrollContent}
            >
              {displayMedications.map((m, idx) => {
                const isSelected = !scannedMedOverride && idx === selectedScanMedIndex;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => {
                      setSelectedScanMedIndex(idx);
                      setScannedMedOverride(null);
                      setIsScanCaptured(false);
                    }}
                    style={[styles.scannerMedChip, isSelected && styles.scannerMedChipActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.scannerMedChipText, isSelected && styles.scannerMedChipTextActive]}>
                      💊 {m.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 2. Custom Medicine Search / Input (Scan Any Pill Bottle or Brand) */}
            <View style={styles.scannerSearchWrap}>
              <TextInput
                style={styles.scannerSearchInput}
                value={customMedInput}
                onChangeText={setCustomMedInput}
                placeholder={currentLang === "hi" ? "दवा का नाम लिखें (जैसे Metformin, Atorvastatin)..." : "Type any pill name to scan..."}
                placeholderTextColor="#94A3B8"
              />
              <TouchableOpacity
                style={styles.scannerSearchBtn}
                onPress={() => {
                  if (customMedInput.trim()) {
                    handleScanCustomMedicine(customMedInput.trim());
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.scannerSearchBtnText}>
                  {currentLang === "hi" ? "स्कैन" : "Scan"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3. Safety Warning Test Chips (Unprescribed NSAIDs) */}
            <View style={styles.scannerContraWrap}>
              <Text style={styles.scannerContraLabel}>
                {currentLang === "hi" ? "⚠️ सुरक्षा चेतावनी टेस्ट (असुरक्षित दवाएं):" : "⚠️ Safety Contraindication Test:"}
              </Text>
              <View style={styles.scannerContraRow}>
                <TouchableOpacity
                  style={styles.contraChip}
                  onPress={() => handleScanCustomMedicine("Ibuprofen 400 mg", "400 mg", true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.contraChipText}>🚨 Ibuprofen 400mg (NSAID)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.contraChip}
                  onPress={() => handleScanCustomMedicine("Aspirin 75 mg", "75 mg", true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.contraChipText}>🚨 Aspirin 75mg</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Live Camera Scanner Viewport or Matched Label */}
            {(() => {
              const activeMed = scannedMedOverride || displayMedications[selectedScanMedIndex] || displayMedications[0];
              const batchCode = `ARV-${(activeMed.name || "MED").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-908`;
              const isWarning = scannedMedOverride?.isContraindicated;

              if (!isScanCaptured) {
                return (
                  <View style={styles.cameraBox}>
                    {cameraPermission?.granted ? (
                      <View style={styles.cameraInner}>
                        <CameraView style={styles.cameraView} facing="back">
                          <View style={styles.cameraTargetBox}>
                            <View style={styles.cameraCornerTL} />
                            <View style={styles.cameraCornerTR} />
                            <View style={styles.cameraCornerBL} />
                            <View style={styles.cameraCornerBR} />
                            <Text style={styles.cameraTargetText}>
                              {currentLang === "hi" ? "दवाई के लेबल को यहाँ लाएं" : "ALIGN LABEL IN FRAME"}
                            </Text>
                          </View>
                        </CameraView>
                      </View>
                    ) : (
                      <View style={styles.cameraPermCard}>
                        <Text style={styles.cameraPermIcon}>📷</Text>
                        <Text style={styles.cameraPermTitle}>Aurevia Optical Scanner</Text>
                        <Text style={styles.cameraPermDesc}>
                          {currentLang === "hi"
                            ? "दवाई का लेबल स्कैन करने के लिए कैमरा अनुमति दें"
                            : "Enable camera to scan prescription bottle labels"}
                        </Text>
                        <TouchableOpacity
                          style={styles.cameraPermBtn}
                          onPress={requestCameraPermission}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.cameraPermBtnText}>
                            {currentLang === "hi" ? "कैमरा चालू करें" : "Enable Camera"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.cameraCaptureBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        setIsScanCaptured(true);
                        const activePersona = loadPersonaPreference();
                        const verifyMsg =
                          currentLang === "hi"
                            ? `${activeMed.name} का प्रिस्क्रिप्शन लेबल सत्यापित हो गया है!`
                            : `${activeMed.name} verified from prescription!`;
                        speakPersonaText(verifyMsg, activePersona, currentLang);
                      }}
                    >
                      <Text style={styles.cameraCaptureBtnText}>
                        📸 {currentLang === "hi" ? "दवा का लेबल स्कैन करें" : "Capture & Verify Bottle"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (isWarning) {
                return (
                  <View style={[styles.scannerFrame, { borderColor: "#EF4444", backgroundColor: "#450A0A" }]}>
                    <View style={styles.scannerCrosshairRow}>
                      <Text style={[styles.scannerCrosshair, { color: "#F87171" }]}>[ SAFETY CONTRAINDICATION ALERT ]</Text>
                      <View style={[styles.scannerLiveBadge, { backgroundColor: "rgba(239, 68, 68, 0.4)" }]}>
                        <View style={styles.scannerLiveDot} />
                        <Text style={styles.scannerLiveText}>HIGH RISK</Text>
                      </View>
                    </View>

                    <View style={[styles.scannerTargetCard, { borderColor: "rgba(239, 68, 68, 0.4)", backgroundColor: "rgba(0,0,0,0.3)" }]}>
                      <Text style={[styles.scannerMatchHeader, { color: "#F87171" }]}>⚠️ UNPRESCRIBED MEDICATION</Text>
                      <Text style={styles.scannerMedNameText}>{activeMed.name}</Text>
                      <Text style={[styles.scannerDoseDetail, { color: "#FCA5A5", fontSize: 13, lineHeight: 18 }]}>
                        {scannedMedOverride?.warning}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.scanAnotherBtn, { backgroundColor: "#EF4444" }]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setIsScanCaptured(false);
                        setScannedMedOverride(null);
                      }}
                    >
                      <Text style={styles.scanAnotherBtnText}>
                        🔄 {currentLang === "hi" ? "दूसरी दवाई स्कैन करें" : "Scan Another Medicine"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <View style={styles.scannerFrame}>
                  <View style={styles.scannerCrosshairRow}>
                    <Text style={styles.scannerCrosshair}>[ AUREVIA PHARMACY OPTICAL SCANNER ]</Text>
                    <View style={styles.scannerLiveBadge}>
                      <View style={[styles.scannerLiveDot, { backgroundColor: "#10B981" }]} />
                      <Text style={[styles.scannerLiveText, { color: "#10B981" }]}>VERIFIED</Text>
                    </View>
                  </View>

                  <View style={styles.scannerTargetCard}>
                    <Text style={styles.scannerMatchHeader}>{t.matchedLabel}</Text>
                    <Text style={styles.scannerMedNameText}>{activeMed.name}</Text>
                    <Text style={styles.scannerDoseDetail}>
                      {activeMed.dose ? `Dose: ${activeMed.dose} · ` : ""}{(activeMed as any).frequency || (activeMed as any).duration || "As prescribed"}
                    </Text>
                    <View style={styles.scannerMetaRow}>
                      <Text style={styles.scannerBatchText}>{t.batch}: {batchCode}</Text>
                      <Text style={styles.scannerStampText}>✓ {t.pharmacyVerified}</Text>
                    </View>
                  </View>

                  {/* Scan Another Medicine Button */}
                  <TouchableOpacity
                    style={styles.scanAnotherBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setIsScanCaptured(false);
                      setScannedMedOverride(null);
                    }}
                  >
                    <Text style={styles.scanAnotherBtnText}>
                      🔄 {currentLang === "hi" ? "दूसरी दवाई स्कैन करें (Scan Another)" : "Scan Another Medicine"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {/* Confirm & Dismiss Buttons */}
            {!(scannedMedOverride?.isContraindicated) && (
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                activeOpacity={0.85}
                onPress={async () => {
                  const activeMed = scannedMedOverride || displayMedications[selectedScanMedIndex] || displayMedications[0];
                  const medId = (activeMed as any).id || `custom_${Date.now()}`;
                  const times = (activeMed as any).times || ["8:00 AM"];
                  const newTaken: Record<string, boolean> = {};
                  times.forEach((time: string) => {
                    newTaken[`${medId}_${time}`] = true;
                  });
                  setTakenDoses((p) => ({ ...p, ...newTaken }));

                  await onTakeDose(medId);

                  setTasks((prev) =>
                    prev.map((t) => (t.id === "task_2" || t.title.toLowerCase().includes("medicine") ? { ...t, completed: true } : t))
                  );

                  const activePersona = loadPersonaPreference();
                  const cheer = generatePersonaTaskDoneSpeech(activePersona, activeMed.name, patientDisplayName, currentLang);
                  speakPersonaText(cheer, activePersona, currentLang);

                  setShowPillScanModal(false);
                  setIsScanCaptured(false);
                  setScannedMedOverride(null);
                  Alert.alert(
                    t.verifiedSuccessTitle,
                    t.verifiedSuccessMsg(activeMed.name),
                    [{ text: "OK" }]
                  );
                }}
              >
                <Text style={styles.modalConfirmBtnText}>✓ {t.recordDoseBtn}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalDismissBtn}
              onPress={() => {
                setShowPillScanModal(false);
                setIsScanCaptured(false);
              }}
            >
              <Text style={styles.modalDismissBtnText}>{t.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 14, paddingBottom: 95 },

  // 1. Hero Card (Emerald/Teal Gradient)
  heroCard: {
    backgroundColor: "#0D9488",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTopMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  hospitalBrandChip: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  hospitalBrandChipText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  langPill: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 14,
    padding: 2,
  },
  langChoice: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  langChoiceActive: {
    backgroundColor: "#FFFFFF",
  },
  langChoiceText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#CCFBF1",
  },
  langChoiceTextActive: {
    color: "#0D9488",
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLeft: { flex: 1, paddingRight: 10 },
  heroTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#CCFBF1",
    marginBottom: 4,
  },
  heroMotto: {
    fontSize: 12,
    color: "#E0F2FE",
    lineHeight: 17,
    marginBottom: 14,
  },
  heroScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  heroScanBtnIcon: { fontSize: 13, marginRight: 6 },
  heroScanBtnText: { fontSize: 12, fontWeight: "700", color: "#0F766E" },
  heroSunCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroSunIcon: { fontSize: 26 },

  // 2. Today's Progress Card
  progressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressSectionTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A" },
  progressTaskCount: { fontSize: 12, color: "#64748B", marginTop: 1 },
  percentBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  percentBadgeText: { fontSize: 13, fontWeight: "bold", color: "#0F766E" },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
    marginVertical: 10,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 4,
  },
  progressTimelineText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
    marginBottom: 4,
  },
  progressDisclaimerText: {
    fontSize: 10,
    color: "#94A3B8",
    lineHeight: 14,
    marginBottom: 10,
  },
  milestoneLinkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  milestoneLinkIcon: { fontSize: 12, marginRight: 6 },
  milestoneLinkText: { fontSize: 12, color: "#0D9488", fontWeight: "600" },

  // 3. Your Tasks Section
  tasksSection: { marginBottom: 14 },
  tasksHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  tasksSectionTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  tasksVoiceTip: { fontSize: 10, color: "#64748B" },
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  taskCardCompleted: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  taskNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  taskNumText: { fontSize: 11, fontWeight: "bold", color: "#0284C7" },
  taskIconWrap: { marginRight: 10 },
  taskEmoji: { fontSize: 16 },
  taskInfoWrap: { flex: 1, paddingRight: 8 },
  taskTitle: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  taskTitleCompleted: { textDecorationLine: "line-through", color: "#64748B" },
  taskSubtitle: { fontSize: 11, color: "#64748B", marginTop: 2 },
  taskDoneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  taskDoneBtnActive: { backgroundColor: "#10B981", borderColor: "#059669" },
  taskDoneBtnText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  taskDoneBtnTextActive: { color: "#FFFFFF" },

  // 4. My Medications Section
  medsSection: { marginBottom: 14 },
  medsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  medsSectionTitle: { fontSize: 16, fontWeight: "bold", color: "#0F172A" },
  scanPillHeaderBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  scanPillHeaderBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "bold" },
  medCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  medHeaderRow: { flexDirection: "row", alignItems: "center" },
  medIconPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  medIconEmoji: { fontSize: 16 },
  medTitleCol: { flex: 1 },
  medName: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  medDuration: { fontSize: 11, color: "#64748B", marginTop: 1 },
  dosePillsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  timeChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#F0FDFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#99F6E4",
    marginRight: 8,
    marginBottom: 4,
  },
  timeChipTaken: { backgroundColor: "#0D9488", borderColor: "#0F766E" },
  timeChipText: { fontSize: 11, fontWeight: "700", color: "#0F766E" },
  timeChipTextTaken: { color: "#FFFFFF" },

  // 5. Upcoming Appointments
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  appointmentSectionTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  appointmentRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  appointmentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  appointmentCalendarEmoji: { fontSize: 16 },
  appointmentDetails: { flex: 1 },
  appointmentTitle: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  appointmentSubtitle: { fontSize: 11, color: "#64748B", marginTop: 2 },
  appointmentActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
  },
  appointmentActionLabel: { fontSize: 11, color: "#64748B" },
  appointmentCallBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  appointmentCallBtnText: { fontSize: 11, fontWeight: "700", color: "#1D4ED8" },

  // 6. Voice Companion Card
  voiceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  voiceHeader: { alignItems: "center", marginBottom: 12 },
  voiceMicCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0D9488",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  voiceMicCircleActive: {
    backgroundColor: "#DC2626",
  },
  voiceMicEmoji: { fontSize: 24 },
  voiceCardTitle: { fontSize: 15, fontWeight: "bold", color: "#0F172A" },
  voiceStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  voiceDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  voiceDotLive: { backgroundColor: "#10B981" },
  voiceDotIdle: { backgroundColor: "#94A3B8" },
  voiceStatusText: { fontSize: 11, color: "#475569" },
  voiceToggleBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  voiceToggleBtnActive: { backgroundColor: "#DC2626" },
  voiceToggleBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "bold" },
  heardTranscriptBox: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  heardTranscriptLabel: { fontSize: 10, color: "#166534", fontWeight: "bold" },
  heardTranscriptText: { fontSize: 12, color: "#14532D", fontStyle: "italic", marginTop: 2 },
  voiceTryLabel: { fontSize: 11, color: "#64748B", textAlign: "center", marginBottom: 8 },
  quickVoiceChipsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginBottom: 10 },
  quickChip: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    margin: 3,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  quickChipText: { fontSize: 10, color: "#334155" },
  voiceControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    marginBottom: 8,
  },
  voiceParamGroup: { flex: 1, alignItems: "center" },
  voiceParamLabel: { fontSize: 10, color: "#64748B", marginBottom: 4 },
  paramChipsRow: { flexDirection: "row" },
  paramChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginHorizontal: 2,
  },
  paramChipActive: { backgroundColor: "#0D9488", borderColor: "#0D9488" },
  paramChipText: { fontSize: 10, color: "#475569" },
  paramChipTextActive: { color: "#FFFFFF", fontWeight: "bold" },
  spokenRepliesRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 },
  checkboxEmoji: { fontSize: 12, marginRight: 6 },
  spokenRepliesLabel: { fontSize: 11, color: "#475569" },

  // 7. Need Help? Card
  helpCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  helpCardTitle: { fontSize: 15, fontWeight: "bold", color: "#991B1B" },
  helpCardSubtitle: { fontSize: 11, color: "#7F1D1D", marginTop: 2, marginBottom: 10 },
  helpSosBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  helpSosBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "bold" },
  helpCallTeamBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 6,
  },
  helpCallTeamBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  helpSecCallBtn: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  helpSecCallBtnText: { color: "#334155", fontSize: 11, fontWeight: "600" },
  helpMsgBtn: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  helpMsgBtnText: { color: "#334155", fontSize: 11, fontWeight: "600" },
  emergencyHelplineFoot: {
    fontSize: 10,
    color: "#991B1B",
    textAlign: "center",
    fontStyle: "italic",
  },

  // 8. Your Care Team Card
  careTeamCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  careTeamSectionTitle: { fontSize: 14, fontWeight: "bold", color: "#0F172A", marginBottom: 10 },
  careTeamRow: { flexDirection: "row", alignItems: "center" },
  careTeamAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  careTeamAvatarEmoji: { fontSize: 18 },
  careTeamInfo: { flex: 1 },
  careTeamName: { fontSize: 12, fontWeight: "700", color: "#1E293B" },
  careTeamPhone: { fontSize: 11, color: "#0D9488", marginTop: 1 },
  careTeamCallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  careTeamCallBtnText: { fontSize: 11, fontWeight: "bold", color: "#1D4ED8" },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
  },
  modalEmoji: { fontSize: 36, marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "bold", color: "#0F172A", marginBottom: 6 },
  modalSubtitle: { fontSize: 12, color: "#64748B", textAlign: "center", marginBottom: 14 },
  modalQuote: {
    fontSize: 14,
    color: "#334155",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 20,
    marginVertical: 10,
  },
  modalAuthor: { fontSize: 11, color: "#0D9488", fontWeight: "bold", marginBottom: 16 },
  modalCloseBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  modalCloseBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "bold" },
  scannerModalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  scannerSelectLabel: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  scannerMedScroll: {
    width: "100%",
    maxHeight: 40,
    marginBottom: 10,
  },
  scannerMedScrollContent: {
    paddingVertical: 2,
    gap: 8,
  },
  scannerMedChip: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  scannerMedChipActive: {
    backgroundColor: "#0D9488",
    borderColor: "#0F766E",
  },
  scannerMedChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  scannerMedChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  scannerSearchWrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  scannerSearchInput: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 12,
    color: "#0F172A",
  },
  scannerSearchBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  scannerSearchBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  scannerContraWrap: {
    width: "100%",
    marginBottom: 8,
  },
  scannerContraLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#EF4444",
    marginBottom: 4,
  },
  scannerContraRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  contraChip: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  contraChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B91C1C",
  },
  scannerFrame: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  scannerCrosshairRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  scannerCrosshair: {
    color: "#38BDF8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  scannerLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  scannerLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
    marginRight: 4,
  },
  scannerLiveText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#EF4444",
  },
  scannerTargetCard: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  scannerMatchHeader: {
    color: "#4ADE80",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scannerMedNameText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 2,
  },
  scannerDoseDetail: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 8,
  },
  scannerMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 6,
  },
  scannerBatchText: {
    color: "#CBD5E1",
    fontSize: 10,
    fontWeight: "600",
  },
  scannerStampText: {
    color: "#2DD4BF",
    fontSize: 10,
    fontWeight: "600",
  },
  medCardScanBtn: {
    backgroundColor: "#ECFDF5",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  medCardScanBtnText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#059669",
  },
  modalConfirmBtn: {
    backgroundColor: "#0D9488",
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 6,
  },
  modalConfirmBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "bold" },
  modalDismissBtn: { paddingVertical: 8 },
  modalDismissBtnText: { color: "#64748B", fontSize: 13, fontWeight: "500" },
  modalSpeakBtn: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  modalSpeakBtnText: { color: "#1D4ED8", fontSize: 12, fontWeight: "bold" },
  cameraBox: {
    width: "100%",
    marginVertical: 10,
    alignItems: "center",
  },
  cameraInner: {
    width: "100%",
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  cameraView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraTargetBox: {
    width: 220,
    height: 120,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.7)",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cameraCornerTL: { position: "absolute", top: -2, left: -2, width: 14, height: 14, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#38BDF8" },
  cameraCornerTR: { position: "absolute", top: -2, right: -2, width: 14, height: 14, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#38BDF8" },
  cameraCornerBL: { position: "absolute", bottom: -2, left: -2, width: 14, height: 14, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#38BDF8" },
  cameraCornerBR: { position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#38BDF8" },
  cameraTargetText: {
    color: "#38BDF8",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cameraPermCard: {
    width: "100%",
    padding: 20,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    alignItems: "center",
  },
  cameraPermIcon: { fontSize: 32, marginBottom: 8 },
  cameraPermTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "bold", marginBottom: 4 },
  cameraPermDesc: { color: "#94A3B8", fontSize: 11, textAlign: "center", marginBottom: 12 },
  cameraPermBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cameraPermBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "bold" },
  cameraCaptureBtn: {
    backgroundColor: "#2563EB",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  cameraCaptureBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "bold" },
  scanAnotherBtn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 10,
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },
  scanAnotherBtnText: { color: "#1E293B", fontSize: 12, fontWeight: "700" },
});
