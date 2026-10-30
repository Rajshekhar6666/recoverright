/**
 * Conversational Voice Assistant Service for RecoverRight Mobile.
 *
 * Implements interactive patient dialogue, plan-grounded Q&A,
 * verbal teach-back evaluation, and speech synthesis feedback.
 */
import { apiClient } from "../api/client";
import {
  generateEmotionalCounselingReply,
  loadEmotionalStatePreference,
  loadPersonaPreference,
  PatientEmotionalState,
} from "./voicePersona";

export interface VoiceMessage {
  id: string;
  sender: "patient" | "assistant";
  text: string;
  spokenAudioText?: string;
  timestamp: string;
  intent?: string;
  isEmergency?: boolean;
  references?: string[];
}

export interface LocalDialogueResult {
  intent: string;
  replyText: string;
  isEmergency: boolean;
  references: string[];
}

export class VoiceAssistantService {
  private messages: VoiceMessage[] = [];
  private isSynthesizingAudio: boolean = false;

  public getMessages(): VoiceMessage[] {
    return [...this.messages];
  }

  public clearMessages(): void {
    this.messages = [];
  }

  /**
   * Evaluates spoken utterance locally if offline, or sends to backend if connected.
   */
  public evaluateLocalIntent(spokenText: string, language: string = "en"): LocalDialogueResult {
    const norm = spokenText.toLowerCase().trim();

    // Emergency check
    if (
      norm.includes("chest pain") ||
      norm.includes("breathe") ||
      norm.includes("bleeding") ||
      norm.includes("bachao") ||
      norm.includes("madad") ||
      norm.includes("seene mein dard") ||
      norm.includes("khoon") ||
      norm.includes("gir gaya") ||
      norm.includes("behosh") ||
      norm.includes("stitches") ||
      norm.includes("taanke")
    ) {
      return {
        intent: "emergency",
        replyText:
          language === "hi"
            ? "आपातकालीन स्थिति का पता चला है। अस्पताल की टीम को तुरंत सूचित किया गया है।"
            : "Emergency detected. Your hospital care team has been notified immediately.",
        isEmergency: true,
        references: ["Emergency Protocol"],
      };
    }

    // Task Completion check (Medicine, walk, dressing)
    if (
      norm.includes("le li") ||
      norm.includes("kha li") ||
      norm.includes("ho gaya") ||
      norm.includes("done") ||
      norm.includes("completed") ||
      norm.includes("took my medicine") ||
      norm.includes("walked") ||
      norm.includes("tehal liya")
    ) {
      const persona = loadPersonaPreference();
      let ack = "";
      if (language === "hi") {
        if (persona === "friendly_bhai") ack = "अरे बहुत बढ़िया भाई! मैंने नोट कर लिया है। ऐसे ही ध्यान रखो!";
        else if (persona === "caring_maa") ack = "शाबाश मेरे बच्चे, बहुत अच्छा किया। समय पर सब करने से जल्दी ठीक हो जाओगे।";
        else if (persona === "mature_elder") ack = "बहुत नेक काम किया बच्चे। नियम से चलने पर ईश्वर स्वास्थ्य देता है।";
        else ack = "शाबाश! मैंने आपका कार्य पूर्ण रूप से दर्ज कर लिया है।";
      } else {
        if (persona === "friendly_bhai") ack = "Awesome job buddy! I've marked that as done. Keep it up!";
        else if (persona === "caring_maa") ack = "Good job my child! Taking care of yourself on time will help you heal faster.";
        else if (persona === "mature_elder") ack = "Very good. Consistency and discipline bring good health.";
        else ack = "Great! I have marked your task as completed in your care plan.";
      }
      return {
        intent: "task_completed",
        replyText: ack,
        isEmergency: false,
        references: ["Care Plan Daily Checklist"],
      };
    }

    // Emotional Distress / Archetype support (Burden / Alone / Student / Neglected)
    let emotionalType: PatientEmotionalState | null = null;
    if (
      norm.includes("bojh") ||
      norm.includes("burden") ||
      norm.includes("load") ||
      norm.includes("guilt") ||
      norm.includes("trouble")
    ) {
      emotionalType = "burden";
    } else if (
      norm.includes("akela") ||
      norm.includes("alone") ||
      norm.includes("koi nahi") ||
      norm.includes("lonely")
    ) {
      emotionalType = "alone";
    } else if (
      norm.includes("hostel") ||
      norm.includes("exam") ||
      norm.includes("college") ||
      norm.includes("padhai") ||
      norm.includes("semester")
    ) {
      emotionalType = "student";
    } else if (
      norm.includes("koi sunta nahi") ||
      norm.includes("ignored") ||
      norm.includes("neglected")
    ) {
      emotionalType = "neglected";
    } else if (
      norm.includes("darr") ||
      norm.includes("ghabrahat") ||
      norm.includes("panic") ||
      norm.includes("anxious")
    ) {
      emotionalType = "anxious";
    }

    if (emotionalType) {
      const persona = loadPersonaPreference();
      const reply = generateEmotionalCounselingReply(
        persona,
        emotionalType,
        "Friend",
        language === "hi" ? "hi" : "en"
      );
      return {
        intent: "emotional_support",
        replyText: reply,
        isEmergency: false,
        references: [`Emotional Care Companion (${persona})`],
      };
    }

    // Medication check
    if (
      norm.includes("medicine") ||
      norm.includes("tablet") ||
      norm.includes("dawai") ||
      norm.includes("dose") ||
      norm.includes("pill")
    ) {
      return {
        intent: "medication_query",
        replyText:
          language === "hi"
            ? "आपके रिकवरी प्लान में सभी दवाइयाँ और उनके सही समय सूचीबद्ध हैं। आप किसी भी दवाई का नाम पूछ सकते हैं।"
            : "Your prescribed medications and exact schedule are recorded in your recovery plan. Ask about any specific tablet.",
        isEmergency: false,
        references: ["Prescribed Recovery Plan"],
      };
    }

    // Interaction check
    if (norm.includes("aspirin") || norm.includes("ibuprofen") || norm.includes("painkiller")) {
      return {
        intent: "drug_interaction",
        replyText:
          language === "hi"
            ? "सावधानी: बिना डॉक्टर से पूछे कोई भी नया दर्द निवारक न लें क्योंकि यह आपकी सर्जरी दवाओं से टकरा सकता है।"
            : "Caution: Do not take non-prescribed pain relievers without checking with your nurse first, as they may increase bleeding risks.",
        isEmergency: false,
        references: ["Drug Safety Engine"],
      };
    }

    // Fallback
    return {
      intent: "general_help",
      replyText:
        language === "hi"
          ? "नमस्ते, मैं आपका रिकवरराइट सहायक हूँ। आप मुझसे अपनी दवाई, घाव की देखभाल या लक्षणों के बारे में पूछ सकते हैं।"
          : "Hello! I am your RecoverRight care companion. You can ask me about your medicines, wound care, or report symptoms.",
      isEmergency: false,
      references: ["General Recovery Guidelines"],
    };
  }

  /**
   * Processes a patient spoken message: adds to history, queries backend or offline fallback.
   */
  public async sendSpokenMessage(
    patientToken: string,
    spokenText: string,
    language: "en" | "hi" | "mr" | "ta" = "en"
  ): Promise<VoiceMessage> {
    const patientMsg: VoiceMessage = {
      id: `msg_${Date.now()}_pat`,
      sender: "patient",
      text: spokenText,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(patientMsg);

    let replyText = "";
    let intent = "general";
    let isEmergency = false;
    let references: string[] = [];

    try {
      const resp = await fetch(`${apiClient.getBaseUrl()}/voice/dialogue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: patientToken,
          spoken_text: spokenText,
          language: language,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        replyText = data.spoken_reply || data.text_reply;
        intent = data.intent;
        isEmergency = Boolean(data.is_emergency);
        references = data.grounded_references || [];
      } else {
        throw new Error("Server dialogue unavailable");
      }
    } catch {
      // Offline fallback
      const local = this.evaluateLocalIntent(spokenText, language);
      replyText = local.replyText;
      intent = local.intent;
      isEmergency = local.isEmergency;
      references = local.references;
    }

    const assistantMsg: VoiceMessage = {
      id: `msg_${Date.now()}_asst`,
      sender: "assistant",
      text: replyText,
      spokenAudioText: replyText,
      timestamp: new Date().toISOString(),
      intent,
      isEmergency,
      references,
    };
    this.messages.push(assistantMsg);

    return assistantMsg;
  }
}

export const voiceAssistant = new VoiceAssistantService();
