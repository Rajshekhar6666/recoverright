"use client";

import { normalize } from "./voice/phrases";

export type VoiceStatus =
  | "ready"
  | "listening"
  | "processing"
  | "command_recognized"
  | "completed"
  | "navigation_completed"
  | "clarification_needed"
  | "clarification_required"
  | "patient_not_found"
  | "not_understood"
  | "mic_unavailable"
  | "error";

export type CommandIntentType =
  | "task_complete"
  | "task_negation"
  | "task_future"
  | "task_question"
  | "medication_query"
  | "care_plan"
  | "appointment_query"
  | "wound_care"
  | "warning_signs"
  | "emergency"
  | "staff_nav_patient"
  | "staff_nav_report"
  | "staff_nav_profile"
  | "staff_nav_care_plan"
  | "staff_nav_tasks"
  | "staff_nav_dashboard"
  | "staff_nav_analytics"
  | "staff_nav_pending_review"
  | "staff_query_incomplete"
  | "staff_add_doc"
  | "staff_approve"
  | "unknown";

export interface StaffPatientRef {
  id: string;
  name: string;
  status?: string;
  filename?: string;
  created_at?: string;
  to_check?: number | null;
  age?: number;
  condition?: string;
  phone?: string;
}

export interface StaffNavigationContext {
  patients: StaffPatientRef[];
  activePatient?: StaffPatientRef | null;
  runs?: { run_id: string; status: string; patient?: { name?: string }; filename?: string; created_at?: string }[];
  lang?: "en" | "hi";
}

export interface StaffNavigationResult {
  status:
    | "navigated"
    | "ambiguous"
    | "not_found"
    | "clarification_needed"
    | "query_answered"
    | "not_understood";
  targetUrl?: string;
  matchedPatient?: StaffPatientRef;
  candidates?: StaffPatientRef[];
  speechResponse: { en: string; hi: string };
  uiFeedback: { en: string; hi: string };
  actionType?:
    | "report"
    | "profile"
    | "care_plan"
    | "tasks"
    | "dashboard"
    | "analytics"
    | "pending_review"
    | "query_incomplete";
}

export interface ParsedCommand {
  type: CommandIntentType;
  target?: string;
  targetNumber?: number | "all" | "last" | "pending";
  detail?: string;
  confidence: number;
  isNegation?: boolean;
  isFuture?: boolean;
  isQuestion?: boolean;
}

export interface TaskContextItem {
  id: string;
  title: string;
  category?: string;
  status: "completed" | "pending" | "overdue" | "snoozed" | "missed" | "cancelled";
  n: number; // 1-indexed display order
  scheduled_time?: string | null;
}

export interface TaskResolutionResult {
  status:
    | "matched"
    | "already_completed"
    | "ambiguous"
    | "not_found"
    | "all_matched"
    | "negation"
    | "future_intention"
    | "question";
  matchedTask?: TaskContextItem;
  allTasks?: TaskContextItem[];
  candidates?: TaskContextItem[];
  speechResponse: { en: string; hi: string };
  uiFeedback: { en: string; hi: string };
}

// ----------------------------------------------------------------- Linguistic Helpers
export function normalizeSpoken(raw: string): string {
  if (!raw) return "";
  const s = normalize(raw)
    .replace(/[,\.?!;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

export function isNegationUtterance(raw: string): boolean {
  const s = normalizeSpoken(raw);
  // Match negation tokens in Hindi/Hinglish/English
  const hindiNegation = /(nahi\s*(?:li|liya|ki|kiya|hua|karenge|khayi|pee)|nahin|nhi|nahi\s*li\s*hai|abhi\s*nahi)/i.test(s) ||
    /(नहीं\s*ली|नहीं\s*किया|नहीं\s*हुआ|नहीं\s*ली\s*है|अभी\s*नहीं)/.test(raw);
  const englishNegation = /\b(didn't|did not|have not|haven't|not yet|not taken|not done|not completed|never took|never had)\b/i.test(s);
  return hindiNegation || englishNegation;
}

export function isFutureIntentionUtterance(raw: string): boolean {
  const s = normalizeSpoken(raw);
  const hindiFuture = /(abhi\s*leni\s*hai|leni\s*hai|karni\s*hai|karenge|karunga|karungi|baad\s*mein|baad\s*me|snooze|later|baaki\s*hai|baki\s*hai)/i.test(s) ||
    /(अभी\s*लेनी\s*है|लेनी\s*है|करनी\s*है|करूँगा|करूँगी|करेंगे|बाद\s*में|बाकी\s*है)/.test(raw);
  const englishFuture = /\b(need to take|have to take|will take|planning to|going to|take later|snooze|still pending)\b/i.test(s);
  return hindiFuture || englishFuture;
}

export function isQuestionUtterance(raw: string): boolean {
  const s = normalizeSpoken(raw);
  const hindiQuestion = /(le\s*lu|le\s*loon|le\s*sakta|le\s*sakti|kar\s*lu|kar\s*loon|kya\s*main\s*le|kya\s*dawai\s*le|kya\s*task\s*kar)/i.test(s) ||
    /(ले\s*लूँ|ले\s*सकता|ले\s*सकती|कर\s*लूँ|क्या\s*मैं\s*ले)/.test(raw);
  const englishQuestion = /\b(should i take|can i take|may i take|should i do my task|can i do my task)\b/i.test(s);
  return hindiQuestion || englishQuestion;
}

// ----------------------------------------------------------------- Command Parsing
export function parseBilingualCommand(raw: string, lang: "en" | "hi" = "en"): ParsedCommand {
  const s = normalizeSpoken(raw);
  if (!s) return { type: "unknown", confidence: 0 };

  // 1. Emergency / Distress (Highest Priority)
  const isEmergency =
    /\b(help|emergency|chest pain|can't breathe|cannot breathe|bleeding|faint|severe pain|unbearable|ambulance|call nurse|call doctor)\b/i.test(s) ||
    /(मदद|बचाओ|सांस नहीं|सीने में दर्द|बेहोश|चक्कर|खून बह रहा|डॉक्टर को बुलाओ|नर्स को बुलाओ|इमरजेंसी|ambulance)/i.test(raw) ||
    /\b(madad|bachao|saans nahi|seene mein dard|chakkar)\b/i.test(s);

  if (isEmergency) {
    return { type: "emergency", detail: raw, confidence: 1 };
  }

  // 2. Check for Informational Queries first (so questions like "When is my dose?" aren't treated as completion)
  const isMedQuery =
    /\b(next medicine|next dose|when is my dose|which medicine|what medicine|list medicines|my tablets|my pills)\b/i.test(s) ||
    /(अगली दवा|दवाई कब|दवाइयों की सूची|कौन सी दवा|मेरी दवाइयाँ|दवा का समय)/.test(raw) ||
    /\b(aglee dawai|agli dawai|dawai kab|kaun si dawai)\b/i.test(s);

  if (isMedQuery) {
    return { type: "medication_query", confidence: 0.9 };
  }

  const isCarePlan =
    /\b(care plan|recovery plan|show plan|my plan|check progress)\b/i.test(s) ||
    /(देखभाल योजना|रिकवरी प्लान|मेरी योजना|प्रगति दिखाओ|प्लान दिखाओ)/.test(raw) ||
    /\b(plan dikhao|mera plan|progress dikhao)\b/i.test(s);

  if (isCarePlan) {
    return { type: "care_plan", confidence: 0.9 };
  }

  const isAppointment =
    /\b(appointment|follow up|doctor visit|when do i see doctor|clinic visit)\b/i.test(s) ||
    /(अपॉइंटमेंट|डॉक्टर को कब|फॉलो-अप|जाँच कब|अगली मुलाकात)/.test(raw) ||
    /\b(doctor se kab milna|clinic kab jana)\b/i.test(s);

  if (isAppointment) {
    return { type: "appointment_query", confidence: 0.9 };
  }

  const isWound =
    /\b(wound|dressing|stitches|bandage|incision|shower|bath)\b/i.test(s) ||
    /(घाव की देखभाल|ड्रेसिंग|पट्टी|टांके|नहाना)/.test(raw);

  if (isWound) {
    return { type: "wound_care", confidence: 0.9 };
  }

  const isWarning =
    /\b(warning signs|danger signs|red flags|when to call|complications)\b/i.test(s) ||
    /(खतरे के लक्षण|चेतावनी संकेत|कब सतर्क|सावधानियाँ)/.test(raw);

  if (isWarning) {
    return { type: "warning_signs", confidence: 0.9 };
  }

  // 3. Check for Negation (e.g. "Dawai nahi li", "Did not take medicine")
  if (isNegationUtterance(raw)) {
    let target = "general";
    if (/paracetamol|पैरासिटामोल/i.test(raw)) target = "Paracetamol";
    else if (/pantoprazole|पैंटोप्राजोल/i.test(raw)) target = "Pantoprazole";
    else if (/amoxicillin|अमोक्सीसिलिन/i.test(raw)) target = "Amoxicillin-Clavulanate";
    else if (/dawai|dawa|medicine|goli|tablet|दवा/i.test(raw)) target = "medication";
    else if (/exercise|physio|व्यायाम/i.test(raw)) target = "exercise";
    else if (/walk|टहलना/i.test(raw)) target = "walk";

    return { type: "task_negation", target, detail: raw, confidence: 0.95, isNegation: true };
  }

  // 4. Check for Future Intention (e.g. "Dawai abhi leni hai", "Will take medicine later")
  if (isFutureIntentionUtterance(raw)) {
    let target = "general";
    if (/dawai|dawa|medicine|goli|tablet|दवा/i.test(raw)) target = "medication";
    else if (/exercise|physio|व्यायाम/i.test(raw)) target = "exercise";
    return { type: "task_future", target, detail: raw, confidence: 0.9, isFuture: true };
  }

  // 5. Check for Questions (e.g. "Dawai le lu?", "Should I take medicine now?")
  if (isQuestionUtterance(raw)) {
    let target = "general";
    if (/dawai|dawa|medicine|goli|tablet|दवा/i.test(raw)) target = "medication";
    else if (/exercise|physio|व्यायाम/i.test(raw)) target = "exercise";
    return { type: "task_question", target, detail: raw, confidence: 0.9, isQuestion: true };
  }

  // 6. Numbered Task Completion (e.g. "Teesra kaam ho gaya", "Task 3 complete", "Third task done")
  let targetNum: number | "all" | "last" | "pending" | undefined;
  if (/\b(pehla|pehli|1st|first|one)\b/i.test(s) || /(पहला|पहले)/.test(raw)) targetNum = 1;
  else if (/\b(doosra|doosri|dusra|dusri|2nd|second|two)\b/i.test(s) || /(दूसरा|दूसरे)/.test(raw)) targetNum = 2;
  else if (/\b(teesra|teesri|tisra|tisri|3rd|third|three)\b/i.test(s) || /(तीसरा|तीसरे)/.test(raw)) targetNum = 3;
  else if (/\b(chautha|chauthi|4th|fourth|four)\b/i.test(s) || /(चौथा|चौथे)/.test(raw)) targetNum = 4;
  else if (/\b(aakhri|akhri|last)\b/i.test(s) || /(आखरी|आखिरी)/.test(raw)) targetNum = "last";
  else if (/\b(saare|sare|sab|all)\b/i.test(s) || /(सारे|सब)/.test(raw)) targetNum = "all";
  else if (/\b(jo pending tha|jo pending hai|pending wala|pending task)\b/i.test(s) || /(पेंडिंग)/.test(raw)) targetNum = "pending";

  const isCompletionVerb =
    /\b(ho gaya|ho gya|hogaya|ho gayi|hogayi|ho gae|ho gaye|kar li|karli|kar liya|karliya|kar lee|kar diya|kardiya|kar dia|kardia|le li|leli|le liya|leliya|le lia|lelia|le lee|kha li|khali|kha liya|khaliya|kha lia|khalia|pee li|peeli|pee liya|peeliya|complete|completed|done|finish|finished|took|taken|ticked|checked|drank|khaya)\b/i.test(s) ||
    /(हो गया|हो गई|हो गए|कर ली|कर लिया|कर दिया|पूरा हुआ|पूरा हो गया|पी लिया|पी ली|खा लिया|खा ली|ले ली|ले लिया)/.test(raw);

  if (targetNum !== undefined && (isCompletionVerb || /\btask\b/i.test(s) || /\bkaam\b/i.test(s) || /(काम|टास्क)/.test(raw))) {
    return {
      type: "task_complete",
      target: typeof targetNum === "number" ? `task_${targetNum}` : String(targetNum),
      targetNumber: targetNum,
      confidence: 0.98,
    };
  }

  // 7. Action-based / Descriptive Task Completion
  if (isCompletionVerb) {
    let target = "general";
    if (/paracetamol|पैरासिटामोल/i.test(raw)) target = "Paracetamol";
    else if (/pantoprazole|पैंटोप्राजोल/i.test(raw)) target = "Pantoprazole";
    else if (/amoxicillin|अमोक्सीसिलिन/i.test(raw)) target = "Amoxicillin-Clavulanate";
    else if (/dawai|dawa|medicine|medication|goli|tablet|pill|dose|capsule|दवा/i.test(raw)) target = "medication";
    else if (/exercise|physio|stretch|kasrat|workout|कसरत|व्यायाम/i.test(raw)) target = "exercise";
    else if (/walk|walking|chala|tehal|tahal|टहलना/i.test(raw)) target = "walk";
    else if (/paani|water|drink|drank|fluid|hydrat|khana|food|diet|पानी|खाना/i.test(raw)) target = "diet";
    else if (/bp|blood pressure|sugar|pulse|vitals|बीपी|शुगर/i.test(raw)) target = "vitals";
    else if (/wound|dressing|bandage|stitch|patti|घाव|पट्टी/i.test(raw)) target = "wound";

    return { type: "task_complete", target, confidence: 0.95 };
  }

  // 12. Staff commands: Dashboard / Analytics / Pending review
  if (/\b(staff dashboard|main dashboard|back to dashboard|dashboard par|wapas jao|dashboard)\b/i.test(s) || /(डैशबोर्ड|वापस जाओ)/.test(raw)) {
    return { type: "staff_nav_dashboard", confidence: 0.95 };
  }

  if (/\b(patient analytics|show analytics|open analytics|clinical analytics|reports section|open reports|analytics dikhao)\b/i.test(s) || /(एनालिटिक्स|रिपोर्ट्स सेक्शन)/.test(raw)) {
    return { type: "staff_nav_analytics", confidence: 0.95 };
  }

  if (/\b(which patients have incomplete|who has incomplete care plans|kis patient ke tasks|incomplete care plans|pending care plans)\b/i.test(s) || /(अधूरे केयर प्लान|किस मरीज़ के कार्य बाकी|पेंडिंग टास्क)/.test(raw)) {
    return { type: "staff_query_incomplete", confidence: 0.95 };
  }

  if (/\b(document awaiting review|pending documents?|review ke liye jo report|awaiting review|show me the latest uploaded report)\b/i.test(s) || /(समीक्षा बाकी|पेंडिंग दस्तावेज़|लेटेस्ट रिपोर्ट)/.test(raw)) {
    return { type: "staff_nav_pending_review", confidence: 0.92 };
  }

  // 13. Staff commands: Navigate to patient
  const navMatch =
    s.match(/\b(?:open|go to|show|select|view)\s+(?:patient\s+)?([a-z]+)/i) ||
    raw.match(/(?:मरीज़|मरीज)\s+([^\s]+)\s+(?:खोलो|दिखाओ)/);

  if (navMatch) {
    return { type: "staff_nav_patient", target: navMatch[1], confidence: 0.85 };
  }

  // 14. Staff commands: Add document
  const isAddDoc =
    /\b(add document|upload document|new document|upload discharge)\b/i.test(s) ||
    /(दस्तावेज़ जोड़ें|दस्तावेज़ अपलोड|नया दस्तावेज़)/.test(raw);

  if (isAddDoc) {
    return { type: "staff_add_doc", confidence: 0.95 };
  }

  // 15. Staff commands: Approve plan
  const isApprove =
    /\b(approve plan|lock plan|sign off plan)\b/i.test(s) ||
    /(योजना स्वीकृत|प्लान मंज़ूर|स्वीकृत करें)/.test(raw);

  if (isApprove) {
    return { type: "staff_approve", confidence: 0.9 };
  }

  return { type: "unknown", detail: raw, confidence: 0.3 };
}

// ----------------------------------------------------------------- Contextual Task Resolver
export function resolveTaskFromUtterance(
  raw: string,
  tasks: TaskContextItem[],
  lang: "en" | "hi" = "en"
): TaskResolutionResult {
  const parsed = parseBilingualCommand(raw, lang);

  // 1. Negation handling: Do NOT complete the task
  if (parsed.type === "task_negation") {
    let matchedTask = tasks.find((t) =>
      parsed.target === "medication"
        ? t.category === "medication" || /medicine|tablet|pill|dose|दवा/i.test(t.title)
        : parsed.target === "exercise"
        ? t.category === "activity" || /exercise|walk|physio/i.test(t.title)
        : t.title.toLowerCase().includes((parsed.target || "").toLowerCase())
    );

    return {
      status: "negation",
      matchedTask,
      speechResponse: {
        en: matchedTask
          ? `Noted that ${matchedTask.title} was not taken yet.`
          : "Noted that your task was not completed yet.",
        hi: matchedTask
          ? `${matchedTask.title} अभी नहीं ली गई है, यह नोट कर लिया गया है।`
          : "कार्य अभी पूरा नहीं किया गया है, यह नोट कर लिया गया है।",
      },
      uiFeedback: {
        en: "Status noted as pending (no completion applied)",
        hi: "स्थिति लंबित दर्ज (कार्य पूर्ण नहीं किया गया)",
      },
    };
  }

  // 2. Future intention handling: Do NOT complete the task
  if (parsed.type === "task_future") {
    let matchedTask = tasks.find((t) =>
      t.category === "medication" || /medicine|tablet|pill|dose|दवा/i.test(t.title)
    );
    return {
      status: "future_intention",
      matchedTask,
      speechResponse: {
        en: matchedTask
          ? `Okay, please remember to take ${matchedTask.title} on time.`
          : "Okay, please remember to complete your task on time.",
        hi: matchedTask
          ? `ठीक है, कृपया अपनी ${matchedTask.title} समय पर लें।`
          : "ठीक है, कृपया अपना कार्य समय पर पूरा करें।",
      },
      uiFeedback: {
        en: "Intention noted: task remains pending for scheduled time",
        hi: "भविष्य का समय नोट किया गया: कार्य लंबित रहेगा",
      },
    };
  }

  // 3. Question handling: Do NOT complete the task
  if (parsed.type === "task_question") {
    let matchedTask = tasks.find((t) =>
      t.category === "medication" || /medicine|tablet|pill|dose|दवा/i.test(t.title)
    );
    return {
      status: "question",
      matchedTask,
      speechResponse: {
        en: matchedTask
          ? `Your ${matchedTask.title} is on your schedule${matchedTask.scheduled_time ? ` for ${matchedTask.scheduled_time}` : ""}. Please take as prescribed.`
          : "Please check your schedule with your care team.",
        hi: matchedTask
          ? `आपकी ${matchedTask.title} योजना में निर्धारित है${matchedTask.scheduled_time ? ` (${matchedTask.scheduled_time})` : ""}। कृपया निर्देशानुसार लें।`
          : "कृपया अपनी देखभाल टीम के निर्देशों का पालन करें।",
      },
      uiFeedback: {
        en: "Clarification provided: schedule confirmed",
        hi: "स्पष्टीकरण दिया गया: शेड्यूल की पुष्टि की गई",
      },
    };
  }

  // 4. "All tasks completed" (e.g. "Saare kaam ho gaye")
  if (parsed.targetNumber === "all") {
    const pendingTasks = tasks.filter((t) => t.status !== "completed");
    return {
      status: "all_matched",
      allTasks: pendingTasks,
      speechResponse: {
        en: `All ${pendingTasks.length} pending tasks have been marked as completed.`,
        hi: `सभी ${pendingTasks.length} शेष कार्य पूर्ण दर्ज कर दिए गए हैं।`,
      },
      uiFeedback: {
        en: `All ${pendingTasks.length} pending tasks updated`,
        hi: `सभी ${pendingTasks.length} शेष कार्य अद्यतित किए गए`,
      },
    };
  }

  // 5. Numbered reference resolution against active patient's tasks
  if (typeof parsed.targetNumber === "number") {
    const idx = parsed.targetNumber - 1;
    const task = tasks[idx] || tasks.find((t) => t.n === parsed.targetNumber);

    if (!task) {
      return {
        status: "not_found",
        speechResponse: {
          en: `Task number ${parsed.targetNumber} was not found on this patient's care plan.`,
          hi: `इस मरीज़ की देखभाल योजना में कार्य संख्या ${parsed.targetNumber} उपलब्ध नहीं है।`,
        },
        uiFeedback: {
          en: `Task #${parsed.targetNumber} not found`,
          hi: `कार्य #${parsed.targetNumber} नहीं मिला`,
        },
      };
    }

    if (task.status === "completed") {
      return {
        status: "already_completed",
        matchedTask: task,
        speechResponse: {
          en: `Task ${task.n}, ${task.title}, is already marked as completed.`,
          hi: `कार्य ${task.n}, ${task.title}, पहले से ही पूरा हो चुका है।`,
        },
        uiFeedback: {
          en: `Task #${task.n} already completed`,
          hi: `कार्य #${task.n} पहले से पूर्ण है`,
        },
      };
    }

    return {
      status: "matched",
      matchedTask: task,
      speechResponse: {
        en: `Task ${task.n}, ${task.title}, marked as completed.`,
        hi: `कार्य ${task.n}, ${task.title}, पूरा दर्ज कर दिया गया है।`,
      },
      uiFeedback: {
        en: `Task #${task.n} completed`,
        hi: `कार्य #${task.n} पूर्ण`,
      },
    };
  }

  // 6. Descriptive & Category-based Task Resolution
  if (parsed.type === "task_complete") {
    const target = parsed.target || "general";

    // Exact medicine name check (e.g. "Paracetamol", "Pantoprazole")
    if (target === "Paracetamol" || target === "Pantoprazole" || target === "Amoxicillin-Clavulanate") {
      const match = tasks.find((t) =>
        t.title.toLowerCase().includes(target.toLowerCase()) ||
        t.id.toLowerCase().includes(target.toLowerCase())
      );
      if (match) {
        if (match.status === "completed") {
          return {
            status: "already_completed",
            matchedTask: match,
            speechResponse: {
              en: `${match.title} is already marked as completed.`,
              hi: `${match.title} पहले से ही लिया हुआ दर्ज है।`,
            },
            uiFeedback: {
              en: `${target} already recorded`,
              hi: `${target} पहले से दर्ज`,
            },
          };
        }
        return {
          status: "matched",
          matchedTask: match,
          speechResponse: {
            en: `Marked ${match.title} as completed.`,
            hi: `दवा लेने की जानकारी दर्ज कर दी गई है: ${match.title}`,
          },
          uiFeedback: {
            en: `${target} recorded`,
            hi: `${target} दर्ज किया गया`,
          },
        };
      }
    }

    // Medication tasks (e.g. "Dawai le li")
    if (target === "medication") {
      const medTasks = tasks.filter((t) =>
        t.category === "medication" ||
        /\b(medicine|medication|tablet|pill|dose|capsule|दवा)\b/i.test(t.title)
      );

      if (medTasks.length === 0) {
        return {
          status: "not_found",
          speechResponse: {
            en: "No medication task was found on this patient's care plan.",
            hi: "इस मरीज़ की देखभाल योजना में कोई दवा कार्य नहीं मिला।",
          },
          uiFeedback: {
            en: "No medication task found",
            hi: "कोई दवा कार्य नहीं मिला",
          },
        };
      }

      if (medTasks.length === 1) {
        const task = medTasks[0];
        if (task.status === "completed") {
          return {
            status: "already_completed",
            matchedTask: task,
            speechResponse: {
              en: `${task.title} is already marked as completed.`,
              hi: `${task.title} पहले से ही लिया हुआ दर्ज है।`,
            },
            uiFeedback: {
              en: "Medication already recorded",
              hi: "दवा पहले से दर्ज है",
            },
          };
        }
        return {
          status: "matched",
          matchedTask: task,
          speechResponse: {
            en: `Marked ${task.title} as completed.`,
            hi: `दवा लेने की जानकारी दर्ज कर दी गई है: ${task.title}`,
          },
          uiFeedback: {
            en: "Medication recorded",
            hi: "दवा दर्ज की गई",
          },
        };
      }

      // Multiple medication tasks: check if one is pending vs already completed
      const pendingMeds = medTasks.filter((t) => t.status !== "completed");
      if (pendingMeds.length === 1) {
        const task = pendingMeds[0];
        return {
          status: "matched",
          matchedTask: task,
          speechResponse: {
            en: `Marked ${task.title} as completed.`,
            hi: `दवा लेने की जानकारी दर्ज कर दी गई है: ${task.title}`,
          },
          uiFeedback: {
            en: `${task.title} recorded`,
            hi: `${task.title} दर्ज`,
          },
        };
      }

      // Ambiguity check: Prompt user to specify which medicine
      return {
        status: "ambiguous",
        candidates: medTasks,
        speechResponse: {
          en: "Which medicine did you take? Please specify the medication name.",
          hi: "आपने कौन सी दवा ली है? कृपया दवा का नाम बताएं।",
        },
        uiFeedback: {
          en: "Clarification needed: multiple medications on plan",
          hi: "स्पष्टीकरण आवश्यक: योजना में एकाधिक दवाइयाँ हैं",
        },
      };
    }

    // Exercise & physical recovery tasks (e.g. "Exercise kar li", "Walk ho gayi")
    if (target === "exercise" || target === "walk") {
      const actTask = tasks.find((t) =>
        t.category === "activity" ||
        /\b(exercise|walk|physio|stretch|moved|चला|घूमा|व्यायाम)\b/i.test(t.title)
      );

      if (actTask) {
        if (actTask.status === "completed") {
          return {
            status: "already_completed",
            matchedTask: actTask,
            speechResponse: {
              en: `${actTask.title} is already marked as completed.`,
              hi: `${actTask.title} पहले से ही पूरा दर्ज है।`,
            },
            uiFeedback: {
              en: "Exercise already completed",
              hi: "व्यायाम पहले से पूर्ण है",
            },
          };
        }
        return {
          status: "matched",
          matchedTask: actTask,
          speechResponse: {
            en: `Marked ${actTask.title} as completed.`,
            hi: `व्यायाम पूरा होने की जानकारी दर्ज कर दी गई है: ${actTask.title}`,
          },
          uiFeedback: {
            en: "Exercise recorded",
            hi: "व्यायाम दर्ज किया गया",
          },
        };
      }
    }

    // Diet / hydration (e.g. "Paani pee liya", "Khana kha liya")
    if (target === "diet") {
      const dietTask = tasks.find((t) =>
        t.category === "diet" ||
        /\b(water|drink|fluid|diet|hydration|पानी|खाना)\b/i.test(t.title)
      );
      if (dietTask) {
        return {
          status: "matched",
          matchedTask: dietTask,
          speechResponse: {
            en: `Marked ${dietTask.title} as completed.`,
            hi: `${dietTask.title} पूरा दर्ज कर दिया गया है।`,
          },
          uiFeedback: {
            en: "Hydration/diet recorded",
            hi: "आहार/जलपान दर्ज",
          },
        };
      }
    }

    // Vitals check (e.g. "BP check karwa liya", "Sugar check kar li")
    if (target === "vitals") {
      const vitalTask = tasks.find((t) =>
        t.category === "vital_check" ||
        /\b(bp|blood pressure|sugar|vital|बीपी|शुगर)\b/i.test(t.title)
      );
      if (vitalTask) {
        return {
          status: "matched",
          matchedTask: vitalTask,
          speechResponse: {
            en: `Marked ${vitalTask.title} as completed.`,
            hi: `${vitalTask.title} पूरा दर्ज कर दिया गया है।`,
          },
          uiFeedback: {
            en: "Vital check recorded",
            hi: "वाइटल चेक दर्ज",
          },
        };
      }
    }

    // Wound care (e.g. "Patti badal li", "Wound cleaned")
    if (target === "wound") {
      const woundTask = tasks.find((t) =>
        t.category === "wound_care" ||
        /\b(wound|dressing|bandage|stitch|clean|पट्टी|घाव)\b/i.test(t.title)
      );
      if (woundTask) {
        return {
          status: "matched",
          matchedTask: woundTask,
          speechResponse: {
            en: `Marked ${woundTask.title} as completed.`,
            hi: `घाव की देखभाल पूर्ण दर्ज कर दी गई है: ${woundTask.title}`,
          },
          uiFeedback: {
            en: "Wound care recorded",
            hi: "घाव देखभाल दर्ज",
          },
        };
      }
    }

    // "Jo pending tha, woh kar diya"
    if (parsed.targetNumber === "pending" || target === "general") {
      const pending = tasks.filter((t) => t.status !== "completed");
      if (pending.length === 1) {
        const task = pending[0];
        return {
          status: "matched",
          matchedTask: task,
          speechResponse: {
            en: `Marked pending task "${task.title}" as completed.`,
            hi: `लंबित कार्य "${task.title}" पूरा दर्ज कर दिया गया है।`,
          },
          uiFeedback: {
            en: `Task #${task.n} completed`,
            hi: `कार्य #${task.n} पूर्ण`,
          },
        };
      }
      if (pending.length > 1) {
        return {
          status: "ambiguous",
          candidates: pending,
          speechResponse: {
            en: "You have multiple pending tasks. Which task would you like to complete?",
            hi: "आपके कई कार्य बाकी हैं। आप कौन सा कार्य पूरा करना चाहते हैं?",
          },
          uiFeedback: {
            en: "Clarification needed: multiple pending tasks",
            hi: "स्पष्टीकरण आवश्यक: कई कार्य बाकी हैं",
          },
        };
      }
    }
  }

  return {
    status: "not_found",
    speechResponse: {
      en: `Could not determine the intended task from "${raw}". Try saying "task 1 done" or "took my medicine".`,
      hi: `"${raw}" से संबंधित कार्य नहीं मिला। बोलें "पहला काम हो गया" या "दवा ले ली"।`,
    },
    uiFeedback: {
      en: "Task not recognized",
      hi: "कार्य पहचाना नहीं गया",
    },
  };
}

// ----------------------------------------------------------------- Staff Voice Navigation
const STAFF_STOP_WORDS = new Set([
  "the", "a", "an", "her", "his", "their", "she", "he", "patient", "mr", "mrs", "dr",
  "report", "profile", "details", "dashboard", "analytics", "care", "plan", "tasks",
  "pending", "latest", "staff", "document", "documents", "which", "who", "what",
  "incomplete", "review", "show", "open", "go", "to", "back", "for", "of", "me",
  "kholo", "dikhao", "wapas", "jao", "par", "hai", "hain", "ke", "ka", "ki", "k",
  "uska", "uske", "uski", "unka", "unki", "iska", "iske", "iski", "awaiting", "uploaded",
  "newest", "recent", "all", "sab", "saare",
]);

export function isStaffStopWord(word: string): boolean {
  if (!word) return true;
  const tokens = word.toLowerCase().trim().split(/\s+/);
  return tokens.every((t) => STAFF_STOP_WORDS.has(t));
}

export function isPronounUtterance(raw: string): boolean {
  return (
    /\b(her|his|their|she|he|the patient)\b/i.test(raw) ||
    /(उसका|उसके|उसकी|उनका|उनकी|इसके|इसकी|uska|uske|uski|unka|unki|iska|iske|iski)/i.test(raw)
  );
}

export function extractPatientNameFromUtterance(raw: string): string | null {
  const s = raw.trim();

  // Pattern A: "Open the latest report for Priya" / "Report for Priya"
  const forMatch = s.match(/\b(?:report|profile|details|care\s*plan|tasks|progress|documents?)\s+(?:for|of)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
  if (forMatch && !isStaffStopWord(forMatch[1])) return forMatch[1].trim();

  // Pattern B: "[Name]'s report / profile / details / dashboard / care plan / tasks"
  const apostropheMatch = s.match(/(?:open|show(?:\s+me)?|view|go\s+to)?\s*([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)(?:'s|’s)\s*(?:report|profile|details|dashboard|care\s*plan|pending\s*tasks|tasks|progress|documents?)?/i);
  if (apostropheMatch && !isStaffStopWord(apostropheMatch[1])) return apostropheMatch[1].trim();

  // Pattern C: Hindi / Hinglish "Priya ki report / profile / details / care plan / tasks", "Rahul ke patient details"
  const hindiPostMatch = s.match(/(?:mujhe\s+)?([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:ki|ka|ke|k|की|का|के)\s+(?:latest\s+)?(?:report|profile|details|patient\s+details|care\s*plan|plan|pending\s*(?:tasks|documents?)|tasks|progress|dastavez|document|रिपोर्ट|प्रोफ़ाइल|प्लान|टास्क)/i);
  if (hindiPostMatch && !isStaffStopWord(hindiPostMatch[1])) return hindiPostMatch[1].trim();

  // Pattern D: "Open patient Priya Sharma" / "मरीज़ प्रिया शर्मा"
  const patientPrefixMatch = s.match(/(?:patient|मरीज़|मरीज)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
  if (patientPrefixMatch && !isStaffStopWord(patientPrefixMatch[1])) return patientPrefixMatch[1].trim();

  // Pattern E: "Mujhe Priya ki report dikhao"
  const mujheMatch = s.match(/mujhe\s+([a-zA-Z\u0900-\u097F]+)\s+(?:ki|ka|ke)/i);
  if (mujheMatch && !isStaffStopWord(mujheMatch[1])) return mujheMatch[1].trim();

  // Pattern F: "Open Priya" / "Go to Rahul" / "Open Iyer Dashboard"
  // Strip trailing nav keywords so "Open Iyer Dashboard" → "Iyer" not "Iyer Dashboard"
  const NAV_SUFFIX = /\s+(?:dashboard|report|profile|details|care\s*plan|tasks|progress|documents?|analytics|overview|summary)$/i;
  const openNameMatch = s.match(/\b(?:open|go\s+to|show\s+me|show)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
  if (openNameMatch) {
    const extracted = openNameMatch[1].replace(NAV_SUFFIX, "").trim();
    if (extracted && !isStaffStopWord(extracted)) return extracted;
  }

  return null;
}

export function resolveStaffNavigation(
  raw: string,
  context: StaffNavigationContext
): StaffNavigationResult {
  const s = raw.trim();

  // 1. Staff Dashboard Navigation
  if (
    /\b(staff dashboard|main dashboard|back to dashboard|dashboard par|wapas jao|go to dashboard)\b/i.test(s) ||
    /(डैशबोर्ड|वापस जाओ)/.test(raw)
  ) {
    return {
      status: "navigated",
      targetUrl: "/staff",
      actionType: "dashboard",
      speechResponse: {
        en: "Navigating to the staff dashboard.",
        hi: "स्टाफ़ डैशबोर्ड पर वापस जा रहे हैं।",
      },
      uiFeedback: {
        en: "Navigating to staff dashboard",
        hi: "स्टाफ़ डैशबोर्ड पर जा रहे हैं",
      },
    };
  }

  // 2. Clinical Analytics Navigation
  if (
    /\b(patient analytics|show analytics|open analytics|clinical analytics|reports section|open reports|analytics dikhao)\b/i.test(s) ||
    /(एनालिटिक्स|रिपोर्ट्स सेक्शन)/.test(raw)
  ) {
    return {
      status: "navigated",
      targetUrl: "/staff?tab=analytics",
      actionType: "analytics",
      speechResponse: {
        en: "Opening clinical analytics.",
        hi: "क्लिनिकल एनालिटिक्स खोला जा रहा है।",
      },
      uiFeedback: {
        en: "Opening clinical analytics",
        hi: "क्लिनिकल एनालिटिक्स खोला जा रहा है",
      },
    };
  }

  // 3. Incomplete care plans query
  if (
    /\b(which patients have incomplete|who has incomplete care plans|kis patient ke tasks|incomplete care plans|pending care plans)\b/i.test(s) ||
    /(अधूरे केयर प्लान|किस मरीज़ के कार्य बाकी|पेंडिंग टास्क)/.test(raw)
  ) {
    return {
      status: "query_answered",
      targetUrl: "/staff?tab=attention",
      actionType: "query_incomplete",
      speechResponse: {
        en: "Displaying patients with incomplete care plans and pending tasks.",
        hi: "अधूरे केयर प्लान और लंबित कार्यों वाले मरीज़ दिखाए जा रहे हैं।",
      },
      uiFeedback: {
        en: "Showing incomplete care plans",
        hi: "अधूरे केयर प्लान दिखाए जा रहे हैं",
      },
    };
  }

  // 4. Pending Document Review (Global or unassigned)
  const isPendingReviewQuery =
    /\b(document awaiting review|pending documents?|review ke liye jo report|awaiting review|show me the latest uploaded report)\b/i.test(s) ||
    /(समीक्षा बाकी|पेंडिंग दस्तावेज़|लेटेस्ट रिपोर्ट)/.test(raw);

  const extractedName = extractPatientNameFromUtterance(raw);
  const isPronoun = isPronounUtterance(raw);

  if (isPendingReviewQuery && !extractedName && !isPronoun) {
    const pendingRun =
      context.runs?.find((r) => r.status === "needs_review") ||
      context.patients.find((p) => p.status === "needs_review");

    if (pendingRun) {
      const runId = (pendingRun as any).run_id || (pendingRun as any).id;
      const patientName = (pendingRun as any).patient?.name || (pendingRun as any).name || "Patient";
      return {
        status: "navigated",
        targetUrl: `/staff/runs/${runId}/review`,
        actionType: "pending_review",
        speechResponse: {
          en: `Opening document awaiting review for ${patientName}.`,
          hi: `${patientName} के लिए समीक्षा बाकी दस्तावेज़ खोला जा रहा है।`,
        },
        uiFeedback: {
          en: `Opening review: ${patientName}`,
          hi: `समीक्षा खोली जा रही है: ${patientName}`,
        },
      };
    }

    return {
      status: "query_answered",
      targetUrl: "/staff?tab=needs_review",
      actionType: "pending_review",
      speechResponse: {
        en: "No documents are currently awaiting review.",
        hi: "वर्तमान में किसी दस्तावेज़ की समीक्षा लंबित नहीं है।",
      },
      uiFeedback: {
        en: "No documents awaiting review",
        hi: "समीक्षा के लिए कोई दस्तावेज़ लंबित नहीं है",
      },
    };
  }

  // 5. Patient Resolution: Pronoun vs Extracted Name
  let targetPatient: StaffPatientRef | undefined;

  if (isPronoun) {
    if (context.activePatient) {
      targetPatient = context.activePatient;
    } else {
      return {
        status: "clarification_needed",
        speechResponse: {
          en: "Which patient would you like to view?",
          hi: "आप किस मरीज़ को देखना चाहते हैं?",
        },
        uiFeedback: {
          en: "Clarification needed: specify patient",
          hi: "स्पष्टीकरण आवश्यक: मरीज़ का नाम बताएं",
        },
      };
    }
  } else if (extractedName) {
    const query = extractedName.toLowerCase();
    // 1. Exact match on full name
    let matches = context.patients.filter(
      (p) => p.name.toLowerCase() === query
    );

    // 2. First name match or startsWith
    if (matches.length === 0) {
      matches = context.patients.filter((p) => {
        const parts = p.name.toLowerCase().split(/\s+/);
        return parts[0] === query || p.name.toLowerCase().startsWith(query);
      });
    }

    // 3. Substring match
    if (matches.length === 0) {
      matches = context.patients.filter((p) =>
        p.name.toLowerCase().includes(query)
      );
    }

    if (matches.length > 1) {
      const namesList = matches.map((m) => m.name).join(" and ");
      const namesListHi = matches.map((m) => m.name).join(" और ");
      return {
        status: "ambiguous",
        candidates: matches,
        speechResponse: {
          en: `Multiple patients found named ${extractedName}: ${namesList}. Which one would you like to open?`,
          hi: `${extractedName} नाम के ${matches.length} मरीज़ मिले: ${namesListHi}। आप किसे खोलना चाहते हैं?`,
        },
        uiFeedback: {
          en: `Ambiguous patient: ${matches.length} matches`,
          hi: `अस्पष्ट मरीज़: ${matches.length} परिणाम`,
        },
      };
    }

    if (matches.length === 0) {
      return {
        status: "not_found",
        speechResponse: {
          en: `No patient named "${extractedName}" found in your authorized records.`,
          hi: `आपके अधिकृत रिकॉर्ड में "${extractedName}" नाम का कोई मरीज़ नहीं मिला।`,
        },
        uiFeedback: {
          en: `Patient "${extractedName}" not found`,
          hi: `मरीज़ "${extractedName}" नहीं मिला`,
        },
      };
    }

    targetPatient = matches[0];
  }

  // If a target patient was resolved (either via name or pronoun):
  if (targetPatient) {
    const isCarePlan = /\b(care\s*plan|recovery\s*plan|progress|योजना|केयर\s*प्लान|प्रगति)\b/i.test(s);
    const isTasks = /\b(pending\s*tasks|tasks|kaam|काम|टास्क)\b/i.test(s);
    const isReport = /\b(report|dastavez|document|review|रिपोर्ट|दस्तावेज़)\b/i.test(s);
    const isProfile = /\b(profile|details|dashboard|प्रोफ़ाइल|जानकारी|विवरण)\b/i.test(s);

    if (isCarePlan) {
      return {
        status: "navigated",
        targetUrl: `/staff/runs/${targetPatient.id}/review`,
        matchedPatient: targetPatient,
        actionType: "care_plan",
        speechResponse: {
          en: `Showing care plan and progress for ${targetPatient.name}.`,
          hi: `${targetPatient.name} की देखभाल योजना और प्रगति दिखाई जा रही है।`,
        },
        uiFeedback: {
          en: `Care plan: ${targetPatient.name}`,
          hi: `केयर प्लान: ${targetPatient.name}`,
        },
      };
    }

    if (isTasks) {
      return {
        status: "navigated",
        targetUrl: `/staff/runs/${targetPatient.id}/review`,
        matchedPatient: targetPatient,
        actionType: "tasks",
        speechResponse: {
          en: `Opening pending recovery tasks for ${targetPatient.name}.`,
          hi: `${targetPatient.name} के बाकी कार्य खोले जा रहे हैं।`,
        },
        uiFeedback: {
          en: `Pending tasks: ${targetPatient.name}`,
          hi: `बाकी कार्य: ${targetPatient.name}`,
        },
      };
    }

    if (isProfile && !isReport) {
      return {
        status: "navigated",
        targetUrl: `/staff/patients/${targetPatient.id}`,
        matchedPatient: targetPatient,
        actionType: "profile",
        speechResponse: {
          en: `Opening profile for ${targetPatient.name}.`,
          hi: `${targetPatient.name} की प्रोफ़ाइल खोली जा रही है।`,
        },
        uiFeedback: {
          en: `Profile: ${targetPatient.name}`,
          hi: `प्रोफ़ाइल: ${targetPatient.name}`,
        },
      };
    }

    // Default to document review / report workspace
    return {
      status: "navigated",
      targetUrl: `/staff/runs/${targetPatient.id}/review`,
      matchedPatient: targetPatient,
      actionType: "report",
      speechResponse: {
        en: `Opening latest report for ${targetPatient.name}.`,
        hi: `${targetPatient.name} की नवीनतम रिपोर्ट खोली जा रही है।`,
      },
      uiFeedback: {
        en: `Report: ${targetPatient.name}`,
        hi: `रिपोर्ट: ${targetPatient.name}`,
      },
    };
  }

  return {
    status: "not_understood",
    speechResponse: {
      en: `Command not recognized: "${raw}". You can say "Open Priya's report" or "Show patient analytics".`,
      hi: `निर्देश समझ नहीं आया: "${raw}"। आप बोल सकते हैं "प्रिया की रिपोर्ट खोलो" या "Patient analytics dikhao"।`,
    },
    uiFeedback: {
      en: "Command not understood",
      hi: "निर्देश समझ नहीं आया",
    },
  };
}

// ----------------------------------------------------------------- Text To Speech
export function speakConfirmation(text: string, lang: "en" | "hi" = "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96;
    u.pitch = 1.0;
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find((v) =>
      lang === "hi"
        ? v.lang.startsWith("hi") || v.lang.includes("Hindi")
        : v.lang.startsWith("en-IN") || v.lang.startsWith("en-GB") || v.lang.startsWith("en")
    );
    if (matchedVoice) u.voice = matchedVoice;

    window.speechSynthesis.speak(u);
  } catch {
    /* ignore speech synth errors */
  }
}
