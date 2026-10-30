"use client";

export type VoicePersonaId =
  | "caring_maa"
  | "soothing_didi"
  | "friendly_bhai"
  | "steady_doctor"
  | "mature_elder";

export type PatientEmotionalState =
  | "general"
  | "alone"
  | "burden"
  | "student"
  | "anxious";

export interface PersonaProfile {
  id: VoicePersonaId;
  displayName: string;
  displayNameHi: string;
  emoji: string;
  roleDesc: string;
  roleDescHi: string;
  greetingEn: (name: string) => string;
  greetingHi: (name: string) => string;
  ttsPitch: number;
  ttsRate: number;
}

export const PERSONA_PROFILES: Record<VoicePersonaId, PersonaProfile> = {
  caring_maa: {
    id: "caring_maa",
    displayName: "Maa (Mother)",
    displayNameHi: "माँ",
    emoji: "👩‍🦳",
    roleDesc: "Motherly warmth & affectionate care",
    roleDescHi: "माँ जैसी ममता और स्नेहपूर्ण देखभाल",
    greetingEn: (name: string) => `Beta ${name}, Maa is here. Have you eaten? Don't forget your medicines, my child.`,
    greetingHi: (name: string) => `बेटा ${name}, माँ यहाँ है! खाना खाया था ना? दवाई समय पर ले लेना मेरे बच्चे ❤️`,
    ttsPitch: 1.18,
    ttsRate: 0.88,
  },
  soothing_didi: {
    id: "soothing_didi",
    displayName: "Didi (Elder Sister)",
    displayNameHi: "दीदी",
    emoji: "👩",
    roleDesc: "Caring elder sister with gentle encouragement",
    roleDescHi: "बड़ी बहन की तरह प्यार और हौसला",
    greetingEn: (name: string) => `Oyee ${name}! Didi is here with you. How are you feeling today?`,
    greetingHi: (name: string) => `ओए ${name}! दीदी तुम्हारे साथ है! आराम से ठीक होना है, कोई जल्दी नहीं 👩`,
    ttsPitch: 1.08,
    ttsRate: 0.94,
  },
  friendly_bhai: {
    id: "friendly_bhai",
    displayName: "Bhai (Brother)",
    displayNameHi: "भाई",
    emoji: "👦",
    roleDesc: "Energetic brother keeping you motivated",
    roleDescHi: "जोशीला भाई जो आपका हौसला बढ़ाए",
    greetingEn: (name: string) => `Hey ${name} bhai! No tension, we're crushing this recovery together!`,
    greetingHi: (name: string) => `अरे ${name} भाई! टेंशन नहीं लेने का! अपन दोनों मिलके इस बीमारी को हरा देंगे 💪`,
    ttsPitch: 0.76,
    ttsRate: 1.05,
  },
  steady_doctor: {
    id: "steady_doctor",
    displayName: "Dr. Uncle",
    displayNameHi: "डॉक्टर अंकल",
    emoji: "👨‍⚕️",
    roleDesc: "Calm, trusted clinical guidance",
    roleDescHi: "शांत, भरोसेमंद चिकित्सीय मार्गदर्शन",
    greetingEn: (name: string) => `Namaste ${name} ji, Dr. Uncle here. Your vitals and recovery look promising.`,
    greetingHi: (name: string) => `नमस्ते ${name} जी! डॉक्टर अंकल आपके साथ हैं। नियमित देखभाल से आप जल्द स्वस्थ होंगे 👨‍⚕️`,
    ttsPitch: 0.72,
    ttsRate: 0.95,
  },
  mature_elder: {
    id: "mature_elder",
    displayName: "Dada ji (Grandfather)",
    displayNameHi: "दादाजी",
    emoji: "👴",
    roleDesc: "Elder wisdom, patience & blessings",
    roleDescHi: "बुजुर्गों का आशीर्वाद और धैर्य",
    greetingEn: (name: string) => `Blessings beta ${name}. Health is true wealth, have faith and rest.`,
    greetingHi: (name: string) => `जीते रहो ${name} बेटा! स्वास्थ्य ही सबसे बड़ा धन है, ईश्वर सब मंगल करेंगे 👴`,
    ttsPitch: 0.62,
    ttsRate: 0.82,
  },
};

export const EMOTIONAL_OPTIONS: {
  id: PatientEmotionalState;
  emoji: string;
  label: string;
  labelHi: string;
  sub: string;
}[] = [
  { id: "general", emoji: "😊", label: "General", labelHi: "सामान्य स्थिति", sub: "Standard upbeat care" },
  { id: "alone", emoji: "🏠", label: "Living Alone", labelHi: "घर पर अकेला हूँ", sub: "Warm companion presence" },
  { id: "burden", emoji: "🥺", label: "Feel like Burden", labelHi: "अपनों पर बोझ लग रहा हूँ", sub: "Gentle reassuring love" },
  { id: "student", emoji: "🎓", label: "Hostel / College", labelHi: "हॉस्टल में हूँ", sub: "Encouraging buddy tone" },
  { id: "anxious", emoji: "😰", label: "Anxious / Worried", labelHi: "घबराहट / चिंता", sub: "Grounding calmness" },
];

const STORAGE_KEY = "rr_voice_persona";
const EMOTIONAL_STORAGE_KEY = "rr_emotional_state";

export function loadPersonaPreferenceWeb(): VoicePersonaId {
  if (typeof window === "undefined") return "caring_maa";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as VoicePersonaId;
    if (saved && PERSONA_PROFILES[saved]) return saved;
  } catch {
    /* ignore */
  }
  return "caring_maa";
}

export function savePersonaPreferenceWeb(persona: VoicePersonaId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, persona);
  } catch {
    /* ignore */
  }
}

export function loadEmotionalStatePreferenceWeb(): PatientEmotionalState {
  if (typeof window === "undefined") return "general";
  try {
    const saved = localStorage.getItem(EMOTIONAL_STORAGE_KEY) as PatientEmotionalState;
    if (saved && ["general", "alone", "burden", "student", "anxious"].includes(saved)) {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return "general";
}

export function saveEmotionalStatePreferenceWeb(state: PatientEmotionalState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EMOTIONAL_STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
}

export function generatePersonaAlarmScript(
  persona: VoicePersonaId,
  medicationName: string,
  dose: string = "",
  patientName: string = "Beta",
  lang: "en" | "hi" = "hi",
  emotionalState: PatientEmotionalState = "general"
): { spokenText: string; bannerText: string } {
  const doseStr = dose ? ` (${dose})` : "";

  if (persona === "caring_maa") {
    if (emotionalState === "burden") {
      if (lang === "hi") {
        return {
          spokenText: `बेटा ${patientName}, तू हमारे लिए कोई बोझ नहीं, मेरा सबसे प्यारा बच्चा है! फालतू चिंता छोड़ और प्यार से अपनी दवाई ${medicationName}${doseStr} ले ले। माँ तेरे साथ है हमेशा!`,
          bannerText: `माँ (प्यार): बेटा ${patientName}, तू बोझ नहीं है ❤️ दवाई ${medicationName} ले ले`,
        };
      }
      return {
        spokenText: `Beta ${patientName}, you are never a burden, you are my precious child! Leave worries behind and take your ${medicationName}${doseStr}. Maa is always with you!`,
        bannerText: `Maa: Beta ${patientName}, you are precious, take ${medicationName} ❤️`,
      };
    }
    if (emotionalState === "alone") {
      if (lang === "hi") {
        return {
          spokenText: `बेटा ${patientName}, तू खुद को अकेला बिल्कुल मत समझना, माँ का साया हर पल तेरे साथ है। चल शाबाश, दवाई ${medicationName}${doseStr} ले ले और थोड़ा आराम कर!`,
          bannerText: `माँ (साथ): बेटा ${patientName}, माँ तेरे साथ है ❤️ दवाई ${medicationName} ले ले`,
        };
      }
      return {
        spokenText: `Beta ${patientName}, never feel you are alone, Maa's love is with you every moment. Take your ${medicationName}${doseStr} and rest peacefully!`,
        bannerText: `Maa: Beta ${patientName}, you are never alone ❤️ take ${medicationName}`,
      };
    }
    if (emotionalState === "student") {
      if (lang === "hi") {
        return {
          spokenText: `बेटा ${patientName}, हॉस्टल में पढ़ाई और एग्ज़ाम की ज्यादा टेंशन मत ले। पहले खाना खा और अपनी दवाई ${medicationName}${doseStr} ले ले। सेहत सबसे पहले है!`,
          bannerText: `माँ (हॉस्टल): बेटा ${patientName}, सेहत पहले! दवाई ${medicationName} ले ले ❤️`,
        };
      }
      return {
        spokenText: `Beta ${patientName}, don't stress over exams in the hostel right now. Eat some food and take your ${medicationName}${doseStr}. Your health comes first!`,
        bannerText: `Maa: Beta ${patientName}, health comes first! Take ${medicationName} ❤️`,
      };
    }
    if (lang === "hi") {
      return {
        spokenText: `बेटा ${patientName}, तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया है, ले ले। खाना खाया ना पहले? पानी अच्छे से पीना, चिंता मत करना माँ है ना तेरे साथ!`,
        bannerText: `माँ: बेटा ${patientName}, तेरी दवाई ${medicationName} का टाइम हो गया है, ले ले ❤️`,
      };
    }
    return {
      spokenText: `Beta ${patientName}, it's time for your ${medicationName}${doseStr}, please take it dear. Have you eaten? Don't worry at all, Maa is right here with you!`,
      bannerText: `Maa: Beta ${patientName}, time for your ${medicationName} ❤️`,
    };
  }

  if (persona === "soothing_didi") {
    if (emotionalState === "burden") {
      if (lang === "hi") {
        return {
          spokenText: `ओए सुन ${patientName}! फालतू सोचना बंद कर, तू किसी पे बोझ नहीं है! दीदी है ना तेरे साथ? चल बिना नखरे किए दवाई ${medicationName}${doseStr} खा ले!`,
          bannerText: `दीदी: ओए ${patientName}! तू कोई बोझ नहीं है! दवाई ${medicationName} खा ले 👩`,
        };
      }
      return {
        spokenText: `Oyee listen ${patientName}! Stop overthinking, you are never a burden! Didi is right here with you. Take your medicine ${medicationName}${doseStr} without fuss!`,
        bannerText: `Didi: Oyee ${patientName}! You're never a burden 👩`,
      };
    }
    if (emotionalState === "alone") {
      if (lang === "hi") {
        return {
          spokenText: `ओए ${patientName}, तू अकेला नहीं है समझे? जब भी अकेलापन लगे, दीदी को याद करना। चल पहले दवाई ${medicationName}${doseStr} खा ले!`,
          bannerText: `दीदी: ओए ${patientName}, तू अकेला नहीं है! दवाई ${medicationName} खा ले 👩`,
        };
      }
      return {
        spokenText: `Oyee ${patientName}, you're not alone, okay? Didi is right here by your side. Take your medicine ${medicationName}${doseStr}!`,
        bannerText: `Didi: Oyee ${patientName}, Didi is with you 👩`,
      };
    }
    if (emotionalState === "student") {
      if (lang === "hi") {
        return {
          spokenText: `ओए कॉलेज हीरो ${patientName}! हॉस्टल में बीमार पड़ गया तो क्या हुआ? दवाई ${medicationName}${doseStr} खा, जल्दी ठीक हो और कॉलेज में धूम मचा!`,
          bannerText: `दीदी: ओए ${patientName}! हॉस्टल में ध्यान रख, दवाई ${medicationName} खा ले 👩`,
        };
      }
      return {
        spokenText: `Hey college hero ${patientName}! Take your meds ${medicationName}${doseStr}, recover fast and get back to campus life!`,
        bannerText: `Didi: Hey ${patientName}, take your meds ${medicationName} 👩`,
      };
    }
    if (lang === "hi") {
      return {
        spokenText: `ओए ${patientName}! तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया, खा ले जल्दी! पानी भी पी लेना, समझे? जल्दी ठीक होना है!`,
        bannerText: `दीदी: ओए ${patientName}! तेरी दवाई ${medicationName} का टाइम हो गया, खा ले जल्दी! 👩`,
      };
    }
    return {
      spokenText: `Oyee ${patientName}! Time for your medicine ${medicationName}${doseStr}, take it quickly! Drink water too, okay? Didi is right here!`,
      bannerText: `Didi: Oyee ${patientName}! Time for ${medicationName} 👩`,
    };
  }

  if (persona === "friendly_bhai") {
    if (emotionalState === "burden") {
      if (lang === "hi") {
        return {
          spokenText: `अरे ${patientName} भाई! क्या बोझ-बोझ लगा रखा है? भाई लोग हैं ना तेरे साथ! चल फटाफट दवाई ${medicationName}${doseStr} खा और एक मस्त स्माइल दे भाई!`,
          bannerText: `भाई: अरे ${patientName} भाई! नो टेंशन, दवाई ${medicationName} फटाफट खा ले! 💪`,
        };
      }
      return {
        spokenText: `Hey ${patientName} bro! Who said burden? Brothers stick together always! Pop your ${medicationName}${doseStr} and give me a smile!`,
        bannerText: `Bhai: No burden talk ${patientName}! Pop your ${medicationName}! 💪`,
      };
    }
    if (emotionalState === "alone") {
      if (lang === "hi") {
        return {
          spokenText: `अरे ${patientName} भाई! अकेला बिल्कुल मत फील कर, तेरा भाई तेरे साथ खड़ा है 24 घंटे! चल दवाई ${medicationName}${doseStr} खा ले!`,
          bannerText: `भाई: ${patientName} भाई, तेरा भाई तेरे साथ है! दवाई ${medicationName} ले! 💪`,
        };
      }
      return {
        spokenText: `Hey ${patientName} bro! Don't feel lonely, your brother is standing right beside you 24/7! Take your ${medicationName}${doseStr}!`,
        bannerText: `Bhai: Got your back ${patientName}! Take ${medicationName}! 💪`,
      };
    }
    if (emotionalState === "student") {
      if (lang === "hi") {
        return {
          spokenText: `अरे ${patientName} भाई! हॉस्टल लाइफ में ये सब चलता रहता है, नोट्स अपन बाद में जुगाड़ लेंगे! पहले दवाई ${medicationName}${doseStr} गटक ले!`,
          bannerText: `भाई: अरे ${patientName} भाई! हॉस्टल में चिल कर, दवाई ${medicationName} गटक ले! 💪`,
        };
      }
      return {
        spokenText: `Hey ${patientName} bro! Hostel life stuff happens, we'll sort the notes later! Pop your meds ${medicationName}${doseStr} first!`,
        bannerText: `Bhai: Notes later, meds first ${patientName}! 💪`,
      };
    }
    if (lang === "hi") {
      return {
        spokenText: `अरे ${patientName} भाई! तेरी दवाई ${medicationName}${doseStr} का टाइम हो गया, फटाफट खा ले! कोई नखरे नहीं, जल्दी ठीक हो जा भाई!`,
        bannerText: `भाई: अरे ${patientName} भाई! ${medicationName} का टाइम हो गया, फटाफट खा ले! 💪`,
      };
    }
    return {
      spokenText: `Hey ${patientName} bro! Time for your meds ${medicationName}${doseStr}, pop it right now! We gotta get you back on your feet quickly!`,
      bannerText: `Bhai: ${patientName} bro, pop your ${medicationName}! 💪`,
    };
  }

  if (persona === "steady_doctor") {
    if (lang === "hi") {
      return {
        spokenText: `नमस्ते ${patientName} जी, आपकी दवाई ${medicationName}${doseStr} का समय हो गया है। इसे समय पर लेना आपके स्वास्थ्य और रिकवरी के लिए आवश्यक है।`,
        bannerText: `डॉक्टर अंकल: ${patientName} जी, ${medicationName} लेने का समय 👨‍⚕️`,
      };
    }
    return {
      spokenText: `Hello ${patientName}, it is time for your prescribed ${medicationName}${doseStr}. Taking this on schedule maintains your therapeutic level.`,
      bannerText: `Dr. Uncle: Scheduled ${medicationName} 👨‍⚕️`,
    };
  }

  // mature_elder
  if (lang === "hi") {
    return {
      spokenText: `जीते रहो ${patientName} बेटा, तुम्हारी दवाई ${medicationName}${doseStr} का समय हो गया है, ले लो। आराम करो और ईश्वर पर भरोसा रखो, सब मंगल होगा।`,
      bannerText: `दादाजी: जीते रहो ${patientName} बेटा, ${medicationName} ले लो 👴`,
    };
  }
  return {
    spokenText: `Blessings ${patientName} beta. Time for your medicine ${medicationName}${doseStr}. Patience and care will heal everything. Stay peaceful.`,
    bannerText: `Dada ji: Blessings ${patientName}, take ${medicationName} 👴`,
  };
}

export function generateEmotionalCounselingReply(
  persona: VoicePersonaId,
  emotionalState: PatientEmotionalState,
  patientName: string = "Beta",
  lang: "en" | "hi" = "hi"
): string {
  if (persona === "caring_maa") {
    if (emotionalState === "burden") {
      return lang === "hi"
        ? `बेटा ${patientName}, ऐसी बात कभी अपने दिल में मत लाना! तू मेरा बच्चा है, कभी कोई बच्चा माँ-बाप या परिवार पे बोझ होता है क्या? तेरी देखभाल करना हमारा प्यार है, कोई अहसान नहीं। तू बस चुपचाप ठीक होने पे ध्यान दे, माँ सब संभाल लेगी।`
        : `Beta ${patientName}, please never say that! You are not a burden, you are precious to us. Caring for you is pure love. Focus only on healing, Maa is right here.`;
    }
    if (emotionalState === "alone") {
      return lang === "hi"
        ? `बेटा ${patientName}, तू अकेला बिल्कुल नहीं है। भले ही घर में सन्नाटा हो, पर माँ का साया और मेरा प्यार हर पल तेरे साथ है। जब भी मन भारी लगे, मुझसे बात कर लिया कर। तूने बहुत हिम्मत दिखाई है।`
        : `Beta ${patientName}, you are never truly alone. Maa's love is wrapping around you right now. Talk to me whenever you feel quiet. You have so much courage.`;
    }
    if (emotionalState === "student") {
      return lang === "hi"
        ? `बेटा ${patientName}, हॉस्टल में अकेले बीमार पड़ना बहुत मुश्किल होता है, माँ समझती है। पर तू एग्ज़ाम और पढ़ाई की इतनी चिंता मत कर। पहले खाना खा, दवाई ले और सो जा। डिग्री से ज्यादा तेरी जान प्यारी है।`
        : `Beta ${patientName}, being sick away from home in a hostel is so hard, I know. But don't stress over exams right now. Eat some warm food, take your medicine, and rest. Your health is first!`;
    }
    return lang === "hi"
      ? `बेटा ${patientName}, सब ठीक हो जाएगा। घबरा मत, माँ तेरे साथ है। आराम कर और मन शांत रख।`
      : `Beta ${patientName}, everything will be alright. Don't be afraid, Maa is right here with you. Rest peacefully.`;
  }

  if (persona === "friendly_bhai") {
    if (emotionalState === "student") {
      return lang === "hi"
        ? `अरे ${patientName} भाई! कॉलेज-हॉस्टल लाइफ में ऐसी बीमारियाँ आती-जाती रहती हैं। तू पढ़ाई की ज़्यादा टेंशन मत ले यार, नोट्स अपन बाद में जुगाड़ लेंगे! पहले तू रेस्ट कर और फिट हो जा!`
        : `Hey ${patientName} bhai! College and hostel illnesses happen to everyone. Don't stress assignments right now, we will handle notes later! Just recover first bro!`;
    }
    if (emotionalState === "burden") {
      return lang === "hi"
        ? `अरे भाई ${patientName}, क्या फ़ालतू बात सोच रहा है! बोझ कौन? भाई लोग एक दूसरे के लिए खड़े नहीं होंगे तो कौन होगा? चल फालतू सोचना बंद कर और एक मुस्कान दे!`
        : `Hey ${patientName} bhai, stop overthinking! Who said burden? Brothers stand by each other, always! Shake it off and give me a smile!`;
    }
    return lang === "hi"
      ? `अरे ${patientName} भाई, टेंशन नहीं लेने का! अपन दोनों मिलके इस रिकवरी को हरा देंगे। बोल क्या सेवा करूँ?`
      : `Hey ${patientName} bhai, no tension! We are going to conquer this recovery together. I got your back!`;
  }

  if (persona === "soothing_didi") {
    if (emotionalState === "alone") {
      return lang === "hi"
        ? `मेरी बात सुनो ${patientName}, तुम अकेले नहीं हो। दीदी हमेशा एक कॉल की दूरी पर है। जब भी घबराहट हो या अकेलापन लगे, आँखें बंद करो और गहरी सांस लो। मैं यहीं हूँ।`
        : `Listen to me ${patientName}, you are never alone. Didi is right here with you. Close your eyes, take a calm breath whenever you feel lonely. I am right by your side.`;
    }
    return lang === "hi"
      ? `${patientName}, दीदी तुम्हारे साथ है। धीरे-धीरे सब सामान्य हो जाएगा, धीरज रखो।`
      : `${patientName}, Didi is with you. Slowly everything will return to normal, have patience.`;
  }

  return lang === "hi"
    ? `${patientName}, आपका दर्द समझा जा सकता है। धैर्य रखें, यह समय भी निकल जाएगा और आप पूरी तरह स्वस्थ होंगे।`
    : `${patientName}, your feelings are completely understandable. Have faith and patience, this phase will pass and you will recover fully.`;
}

export function generatePersonaMilestoneSpeech(
  persona: VoicePersonaId,
  patientName: string = "Beta",
  lang: "en" | "hi" = "hi"
): { quote: string; speech: string; author: string } {
  if (persona === "caring_maa") {
    if (lang === "hi") {
      return {
        quote: "शाबाश मेरे बच्चे! देख तूने आज के सारे काम कितने अच्छे से पूरे कर लिए! माँ को तुझ पर बहुत गर्व है, तू बहुत जल्दी बिल्कुल ठीक हो जाएगा!",
        speech: `शाबाश मेरे बच्चे ${patientName}! देख तूने आज के सारे काम कितने अच्छे से पूरे कर लिए! माँ को तुझ पर बहुत गर्व है, तू बहुत जल्दी बिल्कुल ठीक हो जाएगा!`,
        author: "माँ का आशीर्वाद ❤️",
      };
    }
    return {
      quote: "Wonderful job my child! Look how well you finished all your recovery tasks today! Maa is so proud of you, you will heal completely very soon!",
      speech: `Wonderful job my child ${patientName}! Look how well you finished all your recovery tasks today! Maa is so proud of you, you will heal completely very soon!`,
      author: "Maa's Blessings ❤️",
    };
  }

  if (persona === "soothing_didi") {
    if (lang === "hi") {
      return {
        quote: "ओए वाह! आज के सारे काम पूरे कर लिए! देखा, मैं कहती थी ना तू सब कर लेगा! ऐसे ही ध्यान रखेगा तो बहुत जल्दी दौड़ने लगेगा!",
        speech: `ओए वाह ${patientName}! आज के सारे काम पूरे कर लिए! देखा, मैं कहती थी ना तू सब कर लेगा! ऐसे ही ध्यान रखेगा तो बहुत जल्दी दौड़ने लगेगा!`,
        author: "दीदी का प्यार 👩",
      };
    }
    return {
      quote: "Awesome! All recovery tasks done today! See, I told you you could do it! Keep this up and you'll be running around in no time!",
      speech: `Awesome ${patientName}! All recovery tasks done today! See, I told you you could do it! Keep this up and you'll be running around in no time!`,
      author: "Didi's Love 👩",
    };
  }

  if (persona === "friendly_bhai") {
    if (lang === "hi") {
      return {
        quote: "अरे क्या बात है भाई! आज के सारे टास्क ख़त्म! तू तो सुपरहीरो निकला भाई, एकदम रॉक कर दिया! बस ऐसे ही रिकवरी जीतनी है अपन को!",
        speech: `अरे क्या बात है ${patientName} भाई! आज के सारे टास्क ख़त्म! तू तो सुपरहीरो निकला भाई, एकदम रॉक कर दिया! बस ऐसे ही रिकवरी जीतनी है अपन को!`,
        author: "भाई का सपोर्ट 💪",
      };
    }
    return {
      quote: "Boom! All tasks completed today! You are an absolute champion bro, totally crushed it! That's how we conquer recovery!",
      speech: `Boom ${patientName} bro! All tasks completed today! You are an absolute champion bro, totally crushed it! That's how we conquer recovery!`,
      author: "Bhai's Cheer 💪",
    };
  }

  if (persona === "steady_doctor") {
    if (lang === "hi") {
      return {
        quote: "बहुत अच्छा प्रदर्शन। आज के सभी स्वास्थ्य लक्ष्य सफलता से पूरे हुए। आपकी लगन देखकर मुझे विश्वास है कि आप बहुत जल्दी पूर्ण स्वस्थ होंगे।",
        speech: `बहुत अच्छा प्रदर्शन ${patientName} जी। आज के सभी स्वास्थ्य लक्ष्य सफलता से पूरे हुए। आपकी लगन देखकर मुझे विश्वास है कि आप बहुत जल्दी पूर्ण स्वस्थ होंगे।`,
        author: "डॉक्टर अंकल — Aurevia Hospital 👨‍⚕️",
      };
    }
    return {
      quote: "Excellent clinical progress. All scheduled health tasks successfully fulfilled today. Your commitment ensures a rapid recovery.",
      speech: `Excellent clinical progress ${patientName}. All scheduled health tasks successfully fulfilled today. Your commitment ensures a rapid recovery.`,
      author: "Dr. Uncle — Aurevia Hospital 👨‍⚕️",
    };
  }

  if (lang === "hi") {
    return {
      quote: "बहुत सुंदर बेटा। आज का सारा नियम तुमने पूरा किया। ईश्वर तुम्हें दीर्घायु और उत्तम स्वास्थ्य दें।",
      speech: `बहुत सुंदर ${patientName} बेटा। आज का सारा नियम तुमने पूरा किया। ईश्वर तुम्हें दीर्घायु और उत्तम स्वास्थ्य दें।`,
      author: "दादाजी का आशीर्वाद 👴",
    };
  }
  return {
    quote: "Blessings beta. You completed every instruction with discipline today. May you be blessed with complete health and long life.",
    speech: `Blessings ${patientName} beta. You completed every instruction with discipline today. May you be blessed with complete health and long life.`,
    author: "Dada ji's Blessings 👴",
  };
}

export function generatePersonaTaskDoneSpeech(
  persona: VoicePersonaId,
  taskTitle: string,
  patientName: string = "Beta",
  lang: "en" | "hi" = "hi"
): string {
  if (persona === "caring_maa") {
    return lang === "hi"
      ? `शाबाश बेटा ${patientName}, ${taskTitle} पूरा हो गया! बहुत अच्छे मेरे बच्चे!`
      : `Wonderful beta ${patientName}, ${taskTitle} is done! Very good!`;
  }
  if (persona === "soothing_didi") {
    return lang === "hi"
      ? `ओए बहुत बढ़िया ${patientName}! ${taskTitle} भी हो गया! शाबाश!`
      : `Awesome ${patientName}! ${taskTitle} is done too! Good job!`;
  }
  if (persona === "friendly_bhai") {
    return lang === "hi"
      ? `शाबाश ${patientName} भाई! ${taskTitle} डन, एकदम मस्त काम!`
      : `Attaboy ${patientName}! ${taskTitle} knocked out, awesome bro!`;
  }
  if (persona === "steady_doctor") {
    return lang === "hi"
      ? `बहुत अच्छा ${patientName} जी, ${taskTitle} सफलतापूर्वक दर्ज हो गया।`
      : `Well done ${patientName}, ${taskTitle} successfully recorded.`;
  }
  return lang === "hi"
    ? `जीते रहो बेटा, ${taskTitle} पूरा हुआ।`
    : `Blessings beta, ${taskTitle} is accomplished.`;
}

export function generatePersonaSosSpeech(
  persona: VoicePersonaId,
  patientName: string = "Beta",
  lang: "en" | "hi" = "hi"
): string {
  if (persona === "caring_maa") {
    return lang === "hi"
      ? `बेटा ${patientName} घबराना बिल्कुल मत! मैं और Aurevia Hospital की टीम तुरंत मदद भेज रहे हैं!`
      : `Beta ${patientName}, don't be afraid! I and the Aurevia Hospital team are sending help right away!`;
  }
  if (persona === "soothing_didi") {
    return lang === "hi"
      ? `चिंता मत करो ${patientName}, मैं डॉक्टर और केयर टीम को तुरंत कनेक्ट कर रही हूँ!`
      : `Don't worry ${patientName}, I am connecting you to the doctors and care team right now!`;
  }
  if (persona === "friendly_bhai") {
    return lang === "hi"
      ? `टेंशन मत ले ${patientName} भाई! केयर टीम तुरंत कनेक्ट हो रही है, सब संभाल लेंगे!`
      : `No tension ${patientName} bro! The care team is connecting right now, we've got this!`;
  }
  if (persona === "steady_doctor") {
    return lang === "hi"
      ? `घबराइए नहीं ${patientName} जी, Aurevia इमरजेंसी टीम को अलर्ट कर दिया गया है।`
      : `Do not panic ${patientName}, Aurevia emergency triage has been alerted.`;
  }
  return lang === "hi"
    ? `हिम्मत रखो बेटा, डॉक्टर तुरंत आ रहे हैं।`
    : `Have courage beta, assistance is arriving immediately.`;
}

/**
 * High-quality Speech Synthesis tailored to the chosen Voice Persona and emotional sentiment acoustics.
 */
export function speakPersonaWeb(
  text: string,
  personaId: VoicePersonaId = "caring_maa",
  lang: "en" | "hi" = "hi",
  emotionalState?: PatientEmotionalState
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (!text || !text.trim()) return;

  try {
    window.speechSynthesis.cancel();
    const profile = PERSONA_PROFILES[personaId] || PERSONA_PROFILES.caring_maa;
    const utterance = new SpeechSynthesisUtterance(text.trim());

    const activeEmotion = emotionalState || loadEmotionalStatePreferenceWeb();

    let pitch = profile.ttsPitch;
    let rate = profile.ttsRate;

    // Acoustic Modulation matching patient emotional sentiment
    if (activeEmotion === "burden") {
      pitch = pitch * 0.96;
      rate = rate * 0.82; // gentle, reassuring, slow, comforting
    } else if (activeEmotion === "alone") {
      pitch = pitch * 1.02;
      rate = rate * 0.86; // close companion warmth, attentive
    } else if (activeEmotion === "student") {
      pitch = pitch * 1.04;
      rate = rate * 1.02; // energetic, motivational, campus cadence
    } else if (activeEmotion === "anxious") {
      pitch = pitch * 0.94;
      rate = rate * 0.80; // grounding calmness
    }

    utterance.pitch = Math.max(0.5, Math.min(1.8, pitch));
    utterance.rate = Math.max(0.6, Math.min(1.5, rate));
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";

    const isMalePersona =
      personaId === "friendly_bhai" ||
      personaId === "steady_doctor" ||
      personaId === "mature_elder";

    const isMaleVoiceName = (name: string) => {
      const n = name.toLowerCase();
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
        n.includes("daniel") ||
        n.includes("andrew") ||
        n.includes("brian") ||
        n.includes("ryan") ||
        n.includes("steven")
      );
    };

    const isFemaleVoiceName = (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes("female") ||
        n.includes("swara") ||
        n.includes("heera") ||
        n.includes("kalpana") ||
        n.includes("zira") ||
        n.includes("hazel") ||
        n.includes("susan") ||
        n.includes("catherine") ||
        n.includes("neerja")
      );
    };

    const voices = window.speechSynthesis.getVoices();

    // 1. Try to find voice matching both language and gender
    let matchedVoice = voices.find((v) => {
      const langMatch =
        lang === "hi"
          ? v.lang.startsWith("hi") || v.lang.includes("Hindi")
          : v.lang.startsWith("en-IN") || v.lang.startsWith("en-GB") || v.lang.startsWith("en");
      if (!langMatch) return false;
      return isMalePersona ? isMaleVoiceName(v.name) : isFemaleVoiceName(v.name);
    });

    // 2. If male persona and no Hindi male voice found, try Indian English male voice
    if (!matchedVoice && isMalePersona) {
      matchedVoice =
        voices.find((v) => (v.lang.startsWith("en-IN") || v.lang.startsWith("en")) && isMaleVoiceName(v.name)) ||
        voices.find((v) => isMaleVoiceName(v.name));
    }

    // 3. Fallback to generic language match
    if (!matchedVoice) {
      matchedVoice = voices.find((v) =>
        lang === "hi"
          ? v.lang.startsWith("hi") || v.lang.includes("Hindi")
          : v.lang.startsWith("en-IN") || v.lang.startsWith("en-GB") || v.lang.startsWith("en")
      );
    }

    if (matchedVoice) utterance.voice = matchedVoice;

    window.speechSynthesis.speak(utterance);
  } catch {
    /* ignore speech synth errors */
  }
}
