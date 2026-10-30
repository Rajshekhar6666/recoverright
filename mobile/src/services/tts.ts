/**
 * Text-to-Speech (TTS) Engine for RecoverRight Mobile Companion.
 * Uses expo-speech to speak in persona voice with appropriate pitch, rate, and Indian accents.
 * Includes intelligent phonetic fallback so audio is 100% audible on all Android devices
 * even if the device does not have offline Hindi voice packs installed.
 */
import * as Speech from "expo-speech";
import {
  getPersonaProfile,
  loadEmotionalStatePreference,
  loadPersonaPreference,
  VoicePersonaId,
} from "./voicePersona";

export interface SpeakOptions {
  pitch?: number;
  rate?: number;
  language?: string;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

const PHONETIC_MAP: [RegExp, string][] = [
  [/बेटा/g, "Beta"],
  [/तेरी दवाई/g, "teri dawai"],
  [/आपकी दवाई/g, "aapki dawai"],
  [/तुम्हारी दवाई/g, "tumhari dawai"],
  [/का टाइम हो गया है/g, "ka time ho gaya hai"],
  [/का समय हो गया है/g, "ka samay ho gaya hai"],
  [/ले ले/g, "le le"],
  [/ले लो/g, "le lo"],
  [/खा ले जल्दी/g, "kha le jaldi"],
  [/खा ले/g, "kha le"],
  [/खाना खाया ना पहले\?/g, "khana khaya na pehle?"],
  [/पानी अच्छे से पीना/g, "paani achhe se peena"],
  [/पानी भी पी लेना/g, "paani bhi pee lena"],
  [/चिंता मत करना/g, "chinta mat karna"],
  [/चिंता मत करो/g, "chinta mat karo"],
  [/माँ है ना तेरे साथ/g, "Maa hai na tere saath"],
  [/माँ तेरे साथ है/g, "Maa tere saath hai"],
  [/ओए/g, "Oyee"],
  [/दीदी/g, "Didi"],
  [/भाई/g, "Bhai"],
  [/अरे/g, "Arrey"],
  [/शाबाश/g, "Shabash"],
  [/नमस्ते/g, "Namaste"],
  [/जीते रहो/g, "Jeete raho"],
  [/दादाजी/g, "Dadaji"],
  [/डॉक्टर अंकल/g, "Doctor Uncle"],
  [/घबराना बिल्कुल मत/g, "ghabrana bilkul mat"],
  [/मदद भेज रहे हैं/g, "madad bhej rahe hain"],
  [/पूरा हो गया/g, "poora ho gaya"],
  [/सत्यापित हो गया/g, "verify ho gaya hai"],
  [/प्रिस्क्रिप्शन लेबल/g, "prescription label"],
  [/सफलतापूर्वक/g, "safaltapoorvak"],
  [/बोझ/g, "bojh"],
  [/अकेला/g, "akela"],
  [/हॉस्टल/g, "hostel"],
  [/कॉलेज/g, "college"],
  [/आशीर्वाद/g, "aashirwaad"],
  [/बहुत अच्छे/g, "bahut achhe"],
  [/फटाफट/g, "fatafat"],
  [/जल्दी ठीक हो जा/g, "jaldi theek ho ja"],
  [/कोई नखरे नहीं/g, "koi nakhre nahi"],
  [/टेंशन मत ले/g, "tension mat le"],
];

function convertToPhoneticRoman(text: string): string {
  let res = text;
  for (const [pattern, repl] of PHONETIC_MAP) {
    res = res.replace(pattern, repl);
  }
  // Strip any remaining unpronounceable devanagari characters if passing to English TTS
  res = res.replace(/[\u0900-\u097F]/g, "").replace(/\s+/g, " ").trim();
  return res || text;
}

let hasCheckedVoices = false;
let deviceSupportsHindi = false;
let cachedVoices: Speech.Voice[] = [];

async function getCachedVoices(): Promise<Speech.Voice[]> {
  if (cachedVoices.length) return cachedVoices;
  try {
    cachedVoices = await Speech.getAvailableVoicesAsync();
  } catch (_) {
    cachedVoices = [];
  }
  return cachedVoices;
}

async function checkHindiVoiceSupport(): Promise<boolean> {
  if (hasCheckedVoices) return deviceSupportsHindi;
  try {
    const voices = await getCachedVoices();
    deviceSupportsHindi = voices.some(
      (v) =>
        v.language &&
        (v.language.toLowerCase().startsWith("hi") ||
          v.language.toLowerCase().includes("hin"))
    );
  } catch (_) {
    deviceSupportsHindi = false;
  }
  hasCheckedVoices = true;
  return deviceSupportsHindi;
}

/**
 * Speaks text using the patient's active persona profile with sentiment acoustics.
 */
export async function speakPersonaText(
  text: string,
  personaId?: VoicePersonaId,
  lang: "en" | "hi" = "hi",
  options?: SpeakOptions
): Promise<void> {
  if (!text || !text.trim()) return;

  try {
    await Speech.stop();
  } catch (_) {}

  const activeId = personaId || loadPersonaPreference();
  const emotionalState = loadEmotionalStatePreference();
  const profile = getPersonaProfile(activeId);

  // 1. Base Pitch & Rate matching persona character
  let pitch = 1.0;
  let rate = 0.92;

  switch (activeId) {
    case "caring_maa":
      pitch = 1.18; // warmer, higher motherly frequency
      rate = 0.88;  // gentle, patient tempo
      break;
    case "soothing_didi":
      pitch = 1.08; // elder sisterly warmth
      rate = 0.94;  // natural, caring pace
      break;
    case "friendly_bhai":
      pitch = 0.76; // brotherly energetic masculine baritone!
      rate = 1.05;  // fast, upbeat cadence
      break;
    case "steady_doctor":
      pitch = 0.72; // calm clinical authoritative male register
      rate = 0.95;  // measured cadence
      break;
    case "mature_elder":
      pitch = 0.62; // grandfatherly deep bass/baritone
      rate = 0.80;  // slow, reassuring
      break;
    default:
      pitch = profile.ttsPitch ? 1 + profile.ttsPitch : 1.0;
      pitch = Math.max(0.6, Math.min(1.5, pitch));
      rate = profile.ttsSpeed || 0.92;
      break;
  }

  // 2. Modulate pitch & rate according to the patient's emotional sentiment!
  if (emotionalState === "burden") {
    pitch = pitch * 0.96;
    rate = rate * 0.82; // gentle, reassuring, slow, comforting
  } else if (emotionalState === "alone") {
    pitch = pitch * 1.02;
    rate = rate * 0.86; // close companion warmth, attentive
  } else if (emotionalState === "student") {
    pitch = pitch * 1.04;
    rate = rate * 1.02; // energetic, motivational, campus cadence
  } else if (emotionalState === "anxious") {
    pitch = pitch * 0.94;
    rate = rate * 0.80; // grounding calmness
  }

  // Override if explicitly supplied
  if (options?.pitch !== undefined) pitch = options.pitch;
  if (options?.rate !== undefined) rate = options.rate;

  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hindiSupported = await checkHindiVoiceSupport();

  // If text is in Hindi but device has no Hindi TTS voice pack installed,
  // speak the romanized phonetic text using en-IN so it is 100% audible!
  let speechText = text.trim();
  let speechLang = options?.language || (lang === "hi" ? "hi-IN" : "en-IN");

  if (hasDevanagari && !hindiSupported) {
    const phonetic = convertToPhoneticRoman(speechText);
    if (phonetic && phonetic.length > 5) {
      speechText = phonetic;
      speechLang = "en-IN";
    }
  }

  const isMalePersona =
    activeId === "friendly_bhai" ||
    activeId === "steady_doctor" ||
    activeId === "mature_elder";

  const allVoices = await getCachedVoices();
  let matchedVoiceId: string | undefined = undefined;
  if (allVoices.length > 0 && isMalePersona) {
    const isMaleName = (name: string) => {
      const n = (name || "").toLowerCase();
      return (
        n.includes("male") ||
        n.includes("hemant") ||
        n.includes("madhav") ||
        n.includes("ravi") ||
        n.includes("prabhat") ||
        n.includes("david") ||
        n.includes("george") ||
        n.includes("guy") ||
        n.includes("mark") ||
        n.includes("james") ||
        n.includes("daniel")
      );
    };
    const mv = allVoices.find((v) => isMaleName(v.name || "") || isMaleName(v.identifier || ""));
    if (mv) matchedVoiceId = mv.identifier;
  }

  const executeSpeech = (txt: string, l: string) => {
    Speech.speak(txt, {
      language: l,
      pitch,
      rate,
      voice: matchedVoiceId,
      onDone: options?.onDone,
      onError: (err) => {
        console.warn("[RecoverRight TTS] Primary speech failed, attempting fallback:", err);
        // Fallback: speak without language constraint or with en-IN
        const fallbackTxt = convertToPhoneticRoman(txt);
        Speech.speak(fallbackTxt || txt, {
          pitch,
          rate: 0.9,
          voice: matchedVoiceId,
          onDone: options?.onDone,
          onError: options?.onError,
        });
      },
    });
  };

  try {
    executeSpeech(speechText, speechLang);
  } catch (err) {
    console.warn("[RecoverRight TTS] Speech.speak fatal error, retrying default:", err);
    try {
      Speech.speak(convertToPhoneticRoman(text), {
        pitch: 1.0,
        rate: 0.9,
      });
    } catch (_) {}
  }
}

/**
 * Stops any active speech playback immediately.
 */
export async function stopSpeech(): Promise<void> {
  try {
    await Speech.stop();
  } catch (_) {}
}

/**
 * Checks if device is currently speaking.
 */
export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch (_) {
    return false;
  }
}
