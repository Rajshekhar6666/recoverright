/**
 * Voice Persona / Character System for RecoverRight Mobile.
 *
 * Patients select a voice character that feels like a caring person giving
 * instructions. Each persona has distinct greeting styles, cadence, and tone.
 *
 * Supports patient psychological archetypes:
 * - Living alone (no one to care)
 * - Feeling like a burden to family / friends
 * - Feeling unheard / neglected
 * - Student in hostel/college away from home
 * - Anxious / overwhelmed
 */

export type VoicePersonaId =
  | 'soothing_didi'
  | 'caring_maa'
  | 'steady_doctor'
  | 'friendly_bhai'
  | 'mature_elder'
  | 'calm_guru';

export type PatientEmotionalState =
  | 'general'
  | 'alone'
  | 'burden'
  | 'neglected'
  | 'student'
  | 'anxious';

export interface PersonaProfile {
  id: VoicePersonaId;
  displayName: string;
  displayNameHi: string;
  emoji: string;
  greetingEn: string;  // {name} placeholder
  greetingHi: string;  // {name} placeholder
  speechCadence: 'slow' | 'medium' | 'fast';
  emotionalTone: 'warm' | 'professional' | 'energetic' | 'serene';
  ttsPitch: number;    // -1.0 to 1.0
  ttsSpeed: number;    // 0.5 to 2.0
  ttsVoiceHint: string;
  characteristicPhrasesEn: string[];
  characteristicPhrasesHi: string[];
  encouragementStyle: 'affectionate' | 'motivational' | 'clinical' | 'spiritual';
  description: string;
  descriptionHi: string;
}

export const PERSONA_PROFILES: Record<VoicePersonaId, PersonaProfile> = {
  soothing_didi: {
    id: 'soothing_didi',
    displayName: 'Didi (Elder Sister)',
    displayNameHi: 'दीदी',
    emoji: '👩',
    greetingEn: 'Namaste {name} ji! Didi is here with you. How are you feeling today, my dear?',
    greetingHi: 'नमस्ते {name} जी! दीदी आपके साथ हैं। आज आप कैसा महसूस कर रहे हैं?',
    speechCadence: 'slow',
    emotionalTone: 'warm',
    ttsPitch: 0.2,
    ttsSpeed: 0.9,
    ttsVoiceHint: 'en-IN-Neural2-A',
    characteristicPhrasesEn: ["Don't worry, I'm right here", 'Take it easy, no rush', "You're doing so well"],
    characteristicPhrasesHi: ['चिंता मत करो, मैं यहाँ हूँ', 'आराम से, कोई जल्दी नहीं', 'आप बहुत अच्छा कर रहे हैं'],
    encouragementStyle: 'affectionate',
    description: 'Soft, reassuring elder sister energy. Gentle reminders with warmth.',
    descriptionHi: 'नरम, आश्वस्त करने वाली बड़ी बहन। गर्मजोशी के साथ याद दिलाती है।',
  },
  caring_maa: {
    id: 'caring_maa',
    displayName: 'Maa (Mother)',
    displayNameHi: 'माँ',
    emoji: '👩‍🦳',
    greetingEn: "Beta {name}, Maa is here. Have you eaten? Don't forget your medicines, my child.",
    greetingHi: 'बेटा {name}, माँ यहाँ है। खाना खाया? दवाई मत भूलना मेरे बच्चे।',
    speechCadence: 'medium',
    emotionalTone: 'warm',
    ttsPitch: 0.3,
    ttsSpeed: 0.85,
    ttsVoiceHint: 'en-IN-Neural2-D',
    characteristicPhrasesEn: ['My dear child', "Don't skip meals", 'Rest properly', "Don't worry at all"],
    characteristicPhrasesHi: ['मेरे बच्चे', 'खाना मत छोड़ना', 'आराम करो ठीक से', 'बिल्कुल चिंता मत कर'],
    encouragementStyle: 'affectionate',
    description: 'Motherly warmth with constant concern for your wellbeing.',
    descriptionHi: 'माँ जैसी ममता और आपकी देखभाल की चिंता।',
  },
  steady_doctor: {
    id: 'steady_doctor',
    displayName: 'Dr. Uncle',
    displayNameHi: 'डॉक्टर अंकल',
    emoji: '👨‍⚕️',
    greetingEn: "Good day, {name}. Dr. Uncle here. Let's check in on your recovery. How are your vitals?",
    greetingHi: 'नमस्कार {name}। डॉक्टर अंकल यहाँ। आपकी रिकवरी कैसी चल रही है?',
    speechCadence: 'medium',
    emotionalTone: 'professional',
    ttsPitch: -0.1,
    ttsSpeed: 1.0,
    ttsVoiceHint: 'en-IN-Neural2-B',
    characteristicPhrasesEn: ['According to your readings', 'This is clinically normal', 'Good progress'],
    characteristicPhrasesHi: ['आपकी रिपोर्ट के अनुसार', 'यह सामान्य है', 'अच्छी प्रगति'],
    encouragementStyle: 'clinical',
    description: 'Calm, professional doctor-uncle. Clinical precision with trusted familiarity.',
    descriptionHi: 'शांत, पेशेवर डॉक्टर अंकल। भरोसेमंद और सटीक।',
  },
  friendly_bhai: {
    id: 'friendly_bhai',
    displayName: 'Bhai (Brother)',
    displayNameHi: 'भाई',
    emoji: '👦',
    greetingEn: "Hey {name} bhai! How's it going? Don't skip meds, yaar — we're in this together!",
    greetingHi: 'अरे {name} भाई! कैसे हो? दवाई मत छोड़ना यार — साथ हैं हम!',
    speechCadence: 'fast',
    emotionalTone: 'energetic',
    ttsPitch: -0.2,
    ttsSpeed: 1.1,
    ttsVoiceHint: 'en-IN-Neural2-C',
    characteristicPhrasesEn: ["You've got this!", 'Keep it up, bhai', "We're crushing this recovery"],
    characteristicPhrasesHi: ['हो जाएगा!', 'बढ़िया है भाई', 'रिकवरी में छक्के छुड़ा रहे हो'],
    encouragementStyle: 'motivational',
    description: 'Energetic younger brother. Keeps you pumped and motivated through recovery.',
    descriptionHi: 'ऊर्जावान छोटा भाई। रिकवरी में उत्साहित रखता है।',
  },
  mature_elder: {
    id: 'mature_elder',
    displayName: 'Dada ji (Grandfather)',
    displayNameHi: 'दादाजी',
    emoji: '👴',
    greetingEn: 'Blessings, {name} beta. Dada ji is watching over you. Health is wealth, take your medicines.',
    greetingHi: 'आशीर्वाद, {name} बेटा। दादाजी देख रहे हैं। स्वास्थ्य ही धन है, दवाई लो।',
    speechCadence: 'slow',
    emotionalTone: 'serene',
    ttsPitch: -0.3,
    ttsSpeed: 0.8,
    ttsVoiceHint: 'en-IN-Neural2-E',
    characteristicPhrasesEn: ['Patience is key', 'Your body knows how to heal', 'Trust the process'],
    characteristicPhrasesHi: ['धैर्य रखो', 'आपका शरीर जानता है', 'ईश्वर पर भरोसा रखो'],
    encouragementStyle: 'spiritual',
    description: 'Wise grandfather figure. Slow, peaceful wisdom with ancestral warmth.',
    descriptionHi: 'बुद्धिमान दादाजी। धीमी, शांत बुद्धि और पारिवारिक गर्माहट।',
  },
  calm_guru: {
    id: 'calm_guru',
    displayName: 'Guruji',
    displayNameHi: 'गुरुजी',
    emoji: '🧘',
    greetingEn: 'Peace, {name}. Breathe in... breathe out. Your healing journey continues. How do you feel within?',
    greetingHi: 'शांति, {name}। श्वास लो... छोड़ो। आपकी उपचार यात्रा जारी है। भीतर कैसा महसूस होता है?',
    speechCadence: 'slow',
    emotionalTone: 'serene',
    ttsPitch: 0.1,
    ttsSpeed: 0.75,
    ttsVoiceHint: 'en-IN-Neural2-F',
    characteristicPhrasesEn: ['Find your center', 'Healing is a journey', 'Your body is a temple'],
    characteristicPhrasesHi: ['अपना केंद्र खोजो', 'उपचार एक यात्रा है', 'आपका शरीर मंदिर है'],
    encouragementStyle: 'spiritual',
    description: 'Meditative guide. Calm, mindful healing companion for inner peace.',
    descriptionHi: 'ध्यानमग्न मार्गदर्शक। शांत, सचेत उपचार साथी।',
  },
};

/** Return a persona profile by ID. */
export function getPersonaProfile(id: VoicePersonaId): PersonaProfile {
  return PERSONA_PROFILES[id];
}

/** Return a greeting with {name} placeholder replaced. */
export function personalizeGreeting(id: VoicePersonaId, patientName: string, lang: 'en' | 'hi' = 'en'): string {
  const profile = PERSONA_PROFILES[id];
  const template = lang === 'hi' ? profile.greetingHi : profile.greetingEn;
  return template.replace('{name}', patientName);
}

/** Return a random characteristic phrase for the persona. */
export function getRandomCharacteristicPhrase(id: VoicePersonaId, lang: 'en' | 'hi' = 'en'): string {
  const profile = PERSONA_PROFILES[id];
  const phrases = lang === 'hi' ? profile.characteristicPhrasesHi : profile.characteristicPhrasesEn;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/** Return all personas as an array. */
export function listPersonas(): PersonaProfile[] {
  return Object.values(PERSONA_PROFILES);
}

// ── Device preference storage ──────────────────────────────────────────────────

const RR_PERSONA_KEY = 'rr_voice_persona';
const RR_EMOTIONAL_KEY = 'rr_emotional_state';
const RR_ALERT_MODE_KEY = 'rr_alert_mode';

export type AlertMode = 'standard' | 'persona';

export function saveAlertModePreference(mode: AlertMode): void {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem(RR_ALERT_MODE_KEY, mode);
    }
  } catch (_) {}
  (globalThis as Record<string, unknown>)[RR_ALERT_MODE_KEY] = mode;
}

export function loadAlertModePreference(): AlertMode {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      const v = localStorage.getItem(RR_ALERT_MODE_KEY);
      if (v === 'standard' || v === 'persona') return v;
    }
  } catch (_) {}
  const inMem = (globalThis as Record<string, unknown>)[RR_ALERT_MODE_KEY];
  if (inMem === 'standard' || inMem === 'persona') return inMem as AlertMode;
  return 'standard'; // Default is neutral, objective alert
}

export function generateStandardAlarmScript(
  medicationName: string,
  dose: string = '',
  lang: 'en' | 'hi' = 'en'
): PersonaAlarmScript {
  const doseStr = dose ? ` (${dose})` : '';
  const spoken = lang === 'hi'
    ? `आपकी दवा का समय हो गया है: ${medicationName}${doseStr}। क्या आपने इसे ले लिया?`
    : `It's time for your medicine: ${medicationName}${doseStr}. Did you take it?`;
  const banner = lang === 'hi'
    ? `दवा अनुस्मारक: ${medicationName} लेने का समय`
    : `Time for your medicine: ${medicationName}`;

  return {
    persona: 'steady_doctor',
    medicationName,
    dose,
    spokenText: spoken,
    bannerText: banner,
    language: lang,
  };
}

export function savePersonaPreference(personaId: VoicePersonaId): void {
  (globalThis as Record<string, unknown>)[RR_PERSONA_KEY] = personaId;
}

export function loadPersonaPreference(): VoicePersonaId {
  return ((globalThis as Record<string, unknown>)[RR_PERSONA_KEY] as VoicePersonaId) ?? 'soothing_didi';
}

export function saveEmotionalStatePreference(state: PatientEmotionalState): void {
  (globalThis as Record<string, unknown>)[RR_EMOTIONAL_KEY] = state;
}

export function loadEmotionalStatePreference(): PatientEmotionalState {
  return ((globalThis as Record<string, unknown>)[RR_EMOTIONAL_KEY] as PatientEmotionalState) ?? 'general';
}

// ── Spoken Alarm Script Generator ─────────────────────────────────────────────

export interface PersonaAlarmScript {
  persona: VoicePersonaId;
  medicationName: string;
  dose: string;
  spokenText: string;
  bannerText: string;
  language: 'en' | 'hi';
}

export function generatePersonaAlarmScript(
  persona: VoicePersonaId,
  medicationName: string,
  dose: string = '',
  patientName: string = 'Beta',
  lang: 'en' | 'hi' = 'hi',
  emotionalState: PatientEmotionalState = 'general'
): PersonaAlarmScript {
  const doseStr = dose ? ` (${dose})` : '';

  let spoken = '';
  let banner = '';

  if (persona === 'caring_maa') {
    if (emotionalState === 'burden') {
      if (lang === 'hi') {
        spoken = `बेटा ${patientName}, तू हमारे लिए कोई बोझ नहीं, मेरा सबसे प्यारा बच्चा है! फालतू चिंता छोड़ और प्यार से अपनी दवाई ${medicationName}${doseStr} ले ले। माँ तेरे साथ है हमेशा!`;
        banner = `माँ (प्यार): बेटा ${patientName}, तू बोझ नहीं है ❤️ दवाई ${medicationName} ले ले`;
      } else {
        spoken = `Beta ${patientName}, you are never a burden, you are my precious child! Leave worries behind and take your ${medicationName}${doseStr}. Maa is always with you!`;
        banner = `Maa: Beta ${patientName}, you are precious, take ${medicationName} ❤️`;
      }
    } else if (emotionalState === 'alone') {
      if (lang === 'hi') {
        spoken = `बेटा ${patientName}, तू खुद को अकेला बिल्कुल मत समझना, माँ का साया हर पल तेरे साथ है। चल शाबाश, दवाई ${medicationName}${doseStr} ले ले और थोड़ा आराम कर!`;
        banner = `माँ (साथ): बेटा ${patientName}, माँ तेरे साथ है ❤️ दवाई ${medicationName} ले ले`;
      } else {
        spoken = `Beta ${patientName}, never feel you are alone, Maa's love is with you every moment. Take your ${medicationName}${doseStr} and rest peacefully!`;
        banner = `Maa: Beta ${patientName}, you are never alone ❤️ take ${medicationName}`;
      }
    } else if (emotionalState === 'student') {
      if (lang === 'hi') {
        spoken = `बेटा ${patientName}, हॉस्टल में पढ़ाई और एग्ज़ाम की ज्यादा टेंशन मत ले। पहले खाना खा और अपनी दवाई ${medicationName}${doseStr} ले ले। सेहत सबसे पहले है!`;
        banner = `माँ (हॉस्टल): बेटा ${patientName}, सेहत पहले! दवाई ${medicationName} ले ले ❤️`;
      } else {
        spoken = `Beta ${patientName}, don't stress over exams in the hostel right now. Eat some food and take your ${medicationName}${doseStr}. Your health comes first!`;
        banner = `Maa: Beta ${patientName}, health comes first! Take ${medicationName} ❤️`;
      }
    } else {
      if (lang === 'hi') {
        spoken = `बेटा ${patientName}, तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया है, ले ले। खाना खाया ना पहले? पानी अच्छे से पीना, चिंता मत करना माँ है ना तेरे साथ!`;
        banner = `माँ: बेटा ${patientName}, तेरी दवाई ${medicationName} का टाइम हो गया है, ले ले ❤️`;
      } else {
        spoken = `Beta ${patientName}, it's time for your ${medicationName}${doseStr}, please take it dear. Have you eaten? Don't worry at all, Maa is right here with you!`;
        banner = `Maa: Beta ${patientName}, time for your ${medicationName} ❤️`;
      }
    }
  } else if (persona === 'soothing_didi') {
    if (emotionalState === 'burden') {
      if (lang === 'hi') {
        spoken = `ओए सुन ${patientName}! फालतू सोचना बंद कर, तू किसी पे बोझ नहीं है! दीदी है ना तेरे साथ? चल बिना नखरे किए दवाई ${medicationName}${doseStr} खा ले!`;
        banner = `दीदी: ओए ${patientName}! तू कोई बोझ नहीं है! दवाई ${medicationName} खा ले 👩`;
      } else {
        spoken = `Oyee listen ${patientName}! Stop overthinking, you are never a burden! Didi is right here with you. Take your medicine ${medicationName}${doseStr} without fuss!`;
        banner = `Didi: Oyee ${patientName}! You're never a burden 👩`;
      }
    } else if (emotionalState === 'alone') {
      if (lang === 'hi') {
        spoken = `ओए ${patientName}, तू अकेला नहीं है समझे? जब भी अकेलापन लगे, दीदी को याद करना। चल पहले दवाई ${medicationName}${doseStr} खा ले!`;
        banner = `दीदी: ओए ${patientName}, तू अकेला नहीं है! दवाई ${medicationName} खा ले 👩`;
      } else {
        spoken = `Oyee ${patientName}, you're not alone, okay? Didi is right here by your side. Take your medicine ${medicationName}${doseStr}!`;
        banner = `Didi: Oyee ${patientName}, Didi is with you 👩`;
      }
    } else if (emotionalState === 'student') {
      if (lang === 'hi') {
        spoken = `ओए कॉलेज बॉय ${patientName}! हॉस्टल में बीमार पड़ गया तो क्या हुआ? दवाई ${medicationName}${doseStr} खा, जल्दी ठीक हो और कॉलेज में धूम मचा!`;
        banner = `दीदी: ओए ${patientName}! हॉस्टल में ध्यान रख, दवाई ${medicationName} खा ले 👩`;
      } else {
        spoken = `Hey college hero ${patientName}! Take your meds ${medicationName}${doseStr}, recover fast and get back to campus life!`;
        banner = `Didi: Hey ${patientName}, take your meds ${medicationName} 👩`;
      }
    } else {
      if (lang === 'hi') {
        spoken = `ओए ${patientName}! तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया, खा ले जल्दी! पानी भी पी लेना, समझे? जल्दी ठीक होना है!`;
        banner = `दीदी: ओए ${patientName}! तेरी दवाई ${medicationName} का टाइम हो गया, खा ले जल्दी! 👩`;
      } else {
        spoken = `Oyee ${patientName}! Time for your medicine ${medicationName}${doseStr}, take it quickly! Drink water too, okay? Didi is right here!`;
        banner = `Didi: Oyee ${patientName}! Time for ${medicationName} 👩`;
      }
    }
  } else if (persona === 'friendly_bhai') {
    if (emotionalState === 'burden') {
      if (lang === 'hi') {
        spoken = `अरे ${patientName} भाई! क्या बोझ-बोझ लगा रखा है? भाई लोग हैं ना तेरे साथ! चल फटाफट दवाई ${medicationName}${doseStr} खा और एक मस्त स्माइल दे भाई!`;
        banner = `भाई: अरे ${patientName} भाई! नो टेंशन, दवाई ${medicationName} फटाफट खा ले! 💪`;
      } else {
        spoken = `Hey ${patientName} bro! Who said burden? Brothers stick together always! Pop your ${medicationName}${doseStr} and give me a smile!`;
        banner = `Bhai: No burden talk ${patientName}! Pop your ${medicationName}! 💪`;
      }
    } else if (emotionalState === 'alone') {
      if (lang === 'hi') {
        spoken = `अरे ${patientName} भाई! अकेला बिल्कुल मत फील कर, तेरा भाई तेरे साथ खड़ा है 24 घंटे! चल दवाई ${medicationName}${doseStr} खा ले!`;
        banner = `भाई: ${patientName} भाई, तेरा भाई तेरे साथ है! दवाई ${medicationName} ले! 💪`;
      } else {
        spoken = `Hey ${patientName} bro! Don't feel lonely, your brother is standing right beside you 24/7! Take your ${medicationName}${doseStr}!`;
        banner = `Bhai: Got your back ${patientName}! Take ${medicationName}! 💪`;
      }
    } else if (emotionalState === 'student') {
      if (lang === 'hi') {
        spoken = `अरे ${patientName} भाई! हॉस्टल लाइफ में ये सब चलता रहता है, नोट्स अपन बाद में जुगाड़ लेंगे! पहले दवाई ${medicationName}${doseStr} गटक ले!`;
        banner = `भाई: अरे ${patientName} भाई! हॉस्टल में चिल कर, दवाई ${medicationName} गटक ले! 💪`;
      } else {
        spoken = `Hey ${patientName} bro! Hostel life stuff happens, we'll sort the notes later! Pop your meds ${medicationName}${doseStr} first!`;
        banner = `Bhai: Notes later, meds first ${patientName}! 💪`;
      }
    } else {
      if (lang === 'hi') {
        spoken = `अरे ${patientName} भाई! तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया, फटाफट खा ले! कोई नखरे नहीं, जल्दी ठीक हो जा भाई!`;
        banner = `भाई: अरे ${patientName} भाई! ${medicationName} का टाइम हो गया, फटाफट खा ले! 💪`;
      } else {
        spoken = `Hey ${patientName} bro! Time for your meds ${medicationName}${doseStr}, pop it right now! We gotta get you back on your feet quickly!`;
        banner = `Bhai: ${patientName} bro, pop your ${medicationName}! 💪`;
      }
    }
  } else if (persona === 'steady_doctor') {
    if (lang === 'hi') {
      spoken = `नमस्ते ${patientName} जी, आपकी दवाई ${medicationName}${doseStr} का समय हो गया है। इसे समय पर लेना आपके स्वास्थ्य और रिकवरी के लिए आवश्यक है।`;
      banner = `डॉक्टर अंकल: ${patientName} जी, ${medicationName} लेने का समय 👨‍⚕️`;
    } else {
      spoken = `Hello ${patientName}, it is time for your prescribed ${medicationName}${doseStr}. Taking this on schedule maintains your therapeutic level.`;
      banner = `Dr. Uncle: Scheduled ${medicationName} 👨‍⚕️`;
    }
  } else if (persona === 'mature_elder') {
    if (lang === 'hi') {
      spoken = `जीते रहो ${patientName} बेटा, तुम्हारी दवाई ${medicationName}${doseStr} का समय हो गया है, ले लो। आराम करो और ईश्वर पर भरोसा रखो, सब मंगल होगा।`;
      banner = `दादाजी: जीते रहो ${patientName} बेटा, ${medicationName} ले लो 👴`;
    } else {
      spoken = `Blessings ${patientName} beta. Time for your medicine ${medicationName}${doseStr}. Patience and care will heal everything. Stay peaceful.`;
      banner = `Dada ji: Blessings ${patientName}, take ${medicationName} 👴`;
    }
  } else {
    // calm_guru
    if (lang === 'hi') {
      spoken = `शांति ${patientName}। एक गहरी श्वास लो और ध्यानपूर्वक अपनी दवाई ${medicationName}${doseStr} ग्रहण करो। हर खुराक आपके शरीर को संतुलन दे रही है।`;
      banner = `गुरुजी: शांत मन से ${medicationName} ग्रहण करें 🧘`;
    } else {
      spoken = `Peace, ${patientName}. Breathe deeply and take your ${medicationName}${doseStr} mindfully. Your healing unfolds with every breath.`;
      banner = `Guruji: Mindful dose of ${medicationName} 🧘`;
    }
  }

  return {
    persona,
    medicationName,
    dose,
    spokenText: spoken,
    bannerText: banner,
    language: lang,
  };
}

export function generatePersonaMilestoneSpeech(
  persona: VoicePersonaId,
  patientName: string = 'Beta',
  lang: 'en' | 'hi' = 'hi'
): { quote: string; speech: string; author: string } {
  if (persona === 'caring_maa') {
    if (lang === 'hi') {
      return {
        quote: `"शाबाश मेरे बच्चे! देख तूने आज के सारे काम कितने अच्छे से पूरे कर लिए! माँ को तुझ पर बहुत गर्व है, तू बहुत जल्दी बिल्कुल ठीक हो जाएगा!"`,
        speech: `शाबाश मेरे बच्चे ${patientName}! देख तूने आज के सारे काम कितने अच्छे से पूरे कर लिए! माँ को तुझ पर बहुत गर्व है, तू बहुत जल्दी बिल्कुल ठीक हो जाएगा!`,
        author: `माँ का आशीर्वाद ❤️`,
      };
    }
    return {
      quote: `"Wonderful job my child! Look how well you finished all your recovery tasks today! Maa is so proud of you, you will heal completely very soon!"`,
      speech: `Wonderful job my child ${patientName}! Look how well you finished all your recovery tasks today! Maa is so proud of you, you will heal completely very soon!`,
      author: `Maa's Blessings ❤️`,
    };
  } else if (persona === 'soothing_didi') {
    if (lang === 'hi') {
      return {
        quote: `"ओए वाह! आज के सारे काम पूरे कर लिए! देखा, मैं कहती थी ना तू सब कर लेगा! ऐसे ही ध्यान रखेगा तो बहुत जल्दी दौड़ने लगेगा!"`,
        speech: `ओए वाह ${patientName}! आज के सारे काम पूरे कर लिए! देखा, मैं कहती थी ना तू सब कर लेगा! ऐसे ही ध्यान रखेगा तो बहुत जल्दी दौड़ने लगेगा!`,
        author: `दीदी का प्यार 👩`,
      };
    }
    return {
      quote: `"Awesome! All recovery tasks done today! See, I told you you could do it! Keep this up and you'll be running around in no time!"`,
      speech: `Awesome ${patientName}! All recovery tasks done today! See, I told you you could do it! Keep this up and you'll be running around in no time!`,
      author: `Didi's Love 👩`,
    };
  } else if (persona === 'friendly_bhai') {
    if (lang === 'hi') {
      return {
        quote: `"अरे क्या बात है भाई! आज के सारे टास्क ख़त्म! तू तो सुपरहीरो निकला भाई, एकदम रॉक कर दिया! बस ऐसे ही रिकवरी जीतनी है अपन को!"`,
        speech: `अरे क्या बात है ${patientName} भाई! आज के सारे टास्क ख़त्म! तू तो सुपरहीरो निकला भाई, एकदम रॉक कर दिया! बस ऐसे ही रिकवरी जीतनी है अपन को!`,
        author: `भाई का सपोर्ट 💪`,
      };
    }
    return {
      quote: `"Boom! All tasks completed today! You are an absolute champion bro, totally crushed it! That's how we conquer recovery!"`,
      speech: `Boom ${patientName} bro! All tasks completed today! You are an absolute champion bro, totally crushed it! That's how we conquer recovery!`,
      author: `Bhai's Cheer 💪`,
    };
  } else if (persona === 'steady_doctor') {
    if (lang === 'hi') {
      return {
        quote: `"बहुत अच्छा प्रदर्शन। आज के सभी स्वास्थ्य लक्ष्य सफलता से पूरे हुए। आपकी लगन देखकर मुझे विश्वास है कि आप बहुत जल्दी पूर्ण स्वस्थ होंगे।"`,
        speech: `बहुत अच्छा प्रदर्शन ${patientName} जी। आज के सभी स्वास्थ्य लक्ष्य सफलता से पूरे हुए। आपकी लगन देखकर मुझे विश्वास है कि आप बहुत जल्दी पूर्ण स्वस्थ होंगे।`,
        author: `डॉक्टर अंकल — Aurevia Hospital 👨‍⚕️`,
      };
    }
    return {
      quote: `"Excellent clinical progress. All scheduled health tasks successfully fulfilled today. Your commitment ensures a rapid recovery."`,
      speech: `Excellent clinical progress ${patientName}. All scheduled health tasks successfully fulfilled today. Your commitment ensures a rapid recovery.`,
      author: `Dr. Uncle — Aurevia Hospital 👨‍⚕️`,
    };
  } else if (persona === 'mature_elder') {
    if (lang === 'hi') {
      return {
        quote: `"बहुत सुंदर बेटा। आज का सारा नियम तुमने पूरा किया। ईश्वर तुम्हें दीर्घायु और उत्तम स्वास्थ्य दें।"`,
        speech: `बहुत सुंदर ${patientName} बेटा। आज का सारा नियम तुमने पूरा किया। ईश्वर तुम्हें दीर्घायु और उत्तम स्वास्थ्य दें।`,
        author: `दादाजी का आशीर्वाद 👴`,
      };
    }
    return {
      quote: `"Blessings beta. You completed every instruction with discipline today. May you be blessed with complete health and long life."`,
      speech: `Blessings ${patientName} beta. You completed every instruction with discipline today. May you be blessed with complete health and long life.`,
      author: `Dada ji's Blessings 👴`,
    };
  } else {
    if (lang === 'hi') {
      return {
        quote: `"शांति और कृतज्ञता। आज के सभी संकल्प पूर्ण हुए। आपका धैर्य ही आपकी सच्ची औषधि है।"`,
        speech: `शांति और कृतज्ञता ${patientName}। आज के सभी संकल्प पूर्ण हुए। आपका धैर्य ही आपकी सच्ची औषधि है।`,
        author: `गुरुजी 🧘`,
      };
    }
    return {
      quote: `"Peace and gratitude. Today's healing cycle is complete. Your patience is your truest medicine."`,
      speech: `Peace and gratitude ${patientName}. Today's healing cycle is complete. Your patience is your truest medicine.`,
      author: `Guruji 🧘`,
    };
  }
}

export function generatePersonaTaskDoneSpeech(
  persona: VoicePersonaId,
  taskTitle: string,
  patientName: string = 'Beta',
  lang: 'en' | 'hi' = 'hi'
): string {
  if (persona === 'caring_maa') {
    return lang === 'hi'
      ? `शाबाश बेटा ${patientName}, ${taskTitle} पूरा हो गया! बहुत अच्छे मेरे बच्चे!`
      : `Wonderful beta ${patientName}, ${taskTitle} is done! Very good!`;
  } else if (persona === 'soothing_didi') {
    return lang === 'hi'
      ? `ओए बहुत बढ़िया ${patientName}! ${taskTitle} भी हो गया! शाबाश!`
      : `Awesome ${patientName}! ${taskTitle} is done too! Good job!`;
  } else if (persona === 'friendly_bhai') {
    return lang === 'hi'
      ? `शाबाश ${patientName} भाई! ${taskTitle} डन, एकदम मस्त काम!`
      : `Attaboy ${patientName}! ${taskTitle} knocked out, awesome bro!`;
  } else if (persona === 'steady_doctor') {
    return lang === 'hi'
      ? `बहुत अच्छा ${patientName} जी, ${taskTitle} सफलतापूर्वक दर्ज हो गया।`
      : `Well done ${patientName}, ${taskTitle} successfully recorded.`;
  } else if (persona === 'mature_elder') {
    return lang === 'hi'
      ? `जीते रहो बेटा, ${taskTitle} पूरा हुआ।`
      : `Blessings beta, ${taskTitle} is accomplished.`;
  }
  return lang === 'hi'
    ? `${taskTitle} पूर्ण हुआ। शांत रहें।`
    : `${taskTitle} completed. Stay peaceful.`;
}

export function generatePersonaSosSpeech(
  persona: VoicePersonaId,
  patientName: string = 'Beta',
  lang: 'en' | 'hi' = 'hi'
): string {
  if (persona === 'caring_maa') {
    return lang === 'hi'
      ? `बेटा ${patientName} घबराना बिल्कुल मत! मैं और Aurevia Hospital की टीम तुरंत मदद भेज रहे हैं!`
      : `Beta ${patientName}, don't be afraid! I and the Aurevia Hospital team are sending help right away!`;
  } else if (persona === 'soothing_didi') {
    return lang === 'hi'
      ? `चिंता मत करो ${patientName}, मैं डॉक्टर और केयर टीम को तुरंत कनेक्ट कर रही हूँ!`
      : `Don't worry ${patientName}, I am connecting you to the doctors and care team right now!`;
  } else if (persona === 'friendly_bhai') {
    return lang === 'hi'
      ? `टेंशन मत ले ${patientName} भाई! केयर टीम तुरंत कनेक्ट हो रही है, सब संभाल लेंगे!`
      : `No tension ${patientName} bro! The care team is connecting right now, we've got this!`;
  } else if (persona === 'steady_doctor') {
    return lang === 'hi'
      ? `घबराइए नहीं ${patientName} जी, Aurevia इमरजेंसी टीम को अलर्ट कर दिया गया है।`
      : `Do not panic ${patientName}, Aurevia emergency triage has been alerted.`;
  } else if (persona === 'mature_elder') {
    return lang === 'hi'
      ? `हिम्मत रखो बेटा, डॉक्टर तुरंत आ रहे हैं।`
      : `Have courage beta, assistance is arriving immediately.`;
  }
  return lang === 'hi'
    ? `सहायता भेजी जा रही है, धैर्य रखें।`
    : `Help is being dispatched, please remain calm.`;
}

// ── Emotional Support Counseling ──────────────────────────────────────────────

export function generateEmotionalCounselingReply(
  persona: VoicePersonaId,
  emotionalState: PatientEmotionalState,
  patientName: string = 'Friend',
  lang: 'en' | 'hi' = 'hi'
): string {
  if (persona === 'caring_maa') {
    if (emotionalState === 'burden') {
      return lang === 'hi'
        ? `बेटा ${patientName}, ऐसी बात कभी अपने दिल में मत लाना! तू मेरा बच्चा है, कभी कोई बच्चा माँ-बाप या परिवार पे बोझ होता है क्या? तेरी देखभाल करना हमारा प्यार है, कोई अहसान नहीं। तू बस चुपचाप ठीक होने पे ध्यान दे, माँ सब संभाल लेगी।`
        : `Beta ${patientName}, please never say that! You are not a burden, you are precious to us. Caring for you is pure love. Focus only on healing, Maa is right here.`;
    } else if (emotionalState === 'alone') {
      return lang === 'hi'
        ? `बेटा ${patientName}, तू अकेला बिल्कुल नहीं है। भले ही घर में सन्नाटा हो, पर माँ का साया और मेरा प्यार हर पल तेरे साथ है। जब भी मन भारी लगे, मुझसे बात कर लिया कर। तूने बहुत हिम्मत दिखाई है।`
        : `Beta ${patientName}, you are never truly alone. Maa's love is wrapping around you right now. Talk to me whenever you feel quiet. You have so much courage.`;
    } else if (emotionalState === 'student') {
      return lang === 'hi'
        ? `बेटा ${patientName}, हॉस्टल में अकेले बीमार पड़ना बहुत मुश्किल होता है, माँ समझती है। पर तू एग्ज़ाम और पढ़ाई की इतनी चिंता मत कर। पहले खाना खा, दवाई ले और सो जा। डिग्री से ज्यादा तेरी जान प्यारी है।`
        : `Beta ${patientName}, being sick away from home in a hostel is so hard, I know. But don't stress over exams right now. Eat some warm food, take your medicine, and rest. Your health is first!`;
    } else {
      return lang === 'hi'
        ? `बेटा ${patientName}, सब ठीक हो जाएगा। घबरा मत, माँ तेरे साथ है। आराम कर और मन शांत रख।`
        : `Beta ${patientName}, everything will be alright. Don't be afraid, Maa is right here with you. Rest peacefully.`;
    }
  } else if (persona === 'friendly_bhai') {
    if (emotionalState === 'student') {
      return lang === 'hi'
        ? `अरे ${patientName} भाई! कॉलेज-हॉस्टल लाइफ में ऐसी बीमारियाँ आती-जाती रहती हैं। तू पढ़ाई की ज़्यादा टेंशन मत ले यार, नोट्स अपन बाद में जुगाड़ लेंगे! पहले तू रेस्ट कर और फिट हो जा!`
        : `Hey ${patientName} bhai! College and hostel illnesses happen to everyone. Don't stress assignments right now, we will handle notes later! Just recover first bro!`;
    } else if (emotionalState === 'burden') {
      return lang === 'hi'
        ? `अरे भाई ${patientName}, क्या फ़ालतू बात सोच रहा है! बोझ कौन? भाई लोग एक दूसरे के लिए खड़े नहीं होंगे तो कौन होगा? चल फालतू सोचना बंद कर और एक मुस्कान दे!`
        : `Hey ${patientName} bhai, stop overthinking! Who said burden? Brothers stand by each other, always! Shake it off and give me a smile!`;
    } else {
      return lang === 'hi'
        ? `अरे ${patientName} भाई, टेंशन नहीं लेने का! अपन दोनों मिलके इस रिकवरी को हरा देंगे। बोल क्या सेवा करूँ?`
        : `Hey ${patientName} bhai, no tension! We are going to conquer this recovery together. I got your back!`;
    }
  } else if (persona === 'soothing_didi') {
    if (emotionalState === 'alone') {
      return lang === 'hi'
        ? `मेरी बात सुनो ${patientName}, तुम अकेले नहीं हो। दीदी हमेशा एक कॉल की दूरी पर है। जब भी घबराहट हो या अकेलापन लगे, आँखें बंद करो और गहरी सांस लो। मैं यहीं हूँ।`
        : `Listen to me ${patientName}, you are never alone. Didi is right here with you. Close your eyes, take a calm breath whenever you feel lonely. I am right by your side.`;
    } else {
      return lang === 'hi'
        ? `${patientName}, दीदी तुम्हारे साथ है। धीरे-धीरे सब सामान्य हो जाएगा, धीरज रखो।`
        : `${patientName}, Didi is with you. Slowly everything will return to normal, have patience.`;
    }
  } else {
    return lang === 'hi'
      ? `${patientName}, आपका दर्द समझा जा सकता है। धैर्य रखें, यह समय भी निकल जाएगा और आप पूरी तरह स्वस्थ होंगे।`
      : `${patientName}, your feelings are completely understandable. Have faith and patience, this phase will pass and you will recover fully.`;
  }
}
