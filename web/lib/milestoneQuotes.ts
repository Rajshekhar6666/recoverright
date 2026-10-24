/**
 * Motivational milestone quotes for patient care plan recovery progress.
 * Covers 10% to 100% completion in both English and Hindi.
 */

export interface MilestoneQuote {
  pct: number;
  emoji: string;
  title: {
    en: string;
    hi: string;
  };
  quote: {
    en: string;
    hi: string;
  };
  cheer: {
    en: string;
    hi: string;
  };
}

export const MILESTONE_QUOTES: MilestoneQuote[] = [
  {
    pct: 10,
    emoji: "🌱",
    title: {
      en: "A Fresh Start",
      hi: "एक नई शुरुआत",
    },
    quote: {
      en: "Every journey begins with one step. You've taken yours — we're proud of you!",
      hi: "हर सफर एक छोटे कदम से शुरू होता है। आपने अपना पहला कदम बढ़ा दिया है — हमें आप पर गर्व है!",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 20,
    emoji: "🌿",
    title: {
      en: "You're Getting Started!",
      hi: "आपकी शुरुआत हो चुकी है!",
    },
    quote: {
      en: "You're building good habits already. Keep going, one step at a time!",
      hi: "आप धीरे-धीरे अच्छी आदतें अपना रहे हैं। बस ऐसे ही, एक-एक कदम आगे बढ़ते रहें!",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 30,
    emoji: "🌼",
    title: {
      en: "Look at You Go!",
      hi: "देखिए आपकी प्रगति!",
    },
    quote: {
      en: "You're making progress! Every small effort you make matters.",
      hi: "देखिए, आप कितनी अच्छी प्रगति कर रहे हैं! आपकी हर छोटी कोशिश मायने रखती है।",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 40,
    emoji: "🌻",
    title: {
      en: "Keep That Spirit!",
      hi: "यह हौसला बनाए रखें!",
    },
    quote: {
      en: "You're showing patience and dedication. Give yourself credit — you're doing well!",
      hi: "आप धैर्य और लगन के साथ आगे बढ़ रहे हैं। खुद की सराहना कीजिए — आप अच्छा कर रहे हैं!",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 50,
    emoji: "🌟",
    title: {
      en: "Halfway Through Your Plan!",
      hi: "आपकी योजना आधी पूरी हुई!",
    },
    quote: {
      en: "Look how far you've come! Keep following your care plan and take it one day at a time.",
      hi: "देखिए, आप कितना आगे आ चुके हैं! अपने केयर प्लान का पालन करते रहें और हर दिन को एक नई शुरुआत मानें।",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 60,
    emoji: "💪",
    title: {
      en: "Stronger Step by Step",
      hi: "कदम दर कदम और मज़बूत",
    },
    quote: {
      en: "Your consistent efforts deserve appreciation. Keep giving yourself the care you deserve!",
      hi: "आपकी लगातार कोशिशें सराहना के काबिल हैं। खुद का ध्यान ऐसे ही रखते रहें!",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 70,
    emoji: "🌈",
    title: {
      en: "You're Doing Great!",
      hi: "आप बहुत बढ़िया कर रहे हैं!",
    },
    quote: {
      en: "You've made meaningful progress with your plan. Stay positive, stay consistent, and keep going!",
      hi: "आपने अपने प्लान के साथ अच्छी प्रगति की है। सकारात्मक रहें, नियमित रहें और आगे बढ़ते रहें!",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 80,
    emoji: "🌷",
    title: {
      en: "Keep Believing in Yourself",
      hi: "खुद पर विश्वास रखें",
    },
    quote: {
      en: "You've come a long way! Continue following your doctor's advice and celebrate every little win.",
      hi: "आपने अब तक एक लंबा सफर तय किया है! डॉक्टर की सलाह मानते रहें और अपनी हर छोटी जीत का जश्न मनाएँ।",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 90,
    emoji: "🕊️",
    title: {
      en: "So Much to Be Proud Of!",
      hi: "गर्व करने लायक सफलता!",
    },
    quote: {
      en: "You've put in so much effort. Keep following your care plan — your well-being matters every step of the way.",
      hi: "आपने बहुत मेहनत की है। अपने केयर प्लान का पालन करते रहें — आपका स्वास्थ्य हर कदम पर महत्वपूर्ण है।",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
  {
    pct: 100,
    emoji: "🎉",
    title: {
      en: "You Completed Your Plan!",
      hi: "आपने अपना प्लान पूरा कर लिया!",
    },
    quote: {
      en: "Congratulations! You've completed all the tasks in your recovery plan. Be proud of your efforts, and keep following your doctor's advice for your continued well-being.",
      hi: "बहुत-बहुत बधाई! आपने अपने रिकवरी प्लान के सभी कार्य पूरे कर लिए हैं। अपनी मेहनत पर गर्व करें और आगे भी अच्छे स्वास्थ्य के लिए डॉक्टर की सलाह मानते रहें। ❤️",
    },
    cheer: {
      en: "RecoverRight — We're cheering for you, every step of the way!",
      hi: "RecoverRight — हर कदम पर आपके साथ! ❤️",
    },
  },
];

/**
 * Gets the corresponding milestone for a given completion percentage.
 * Returns null if below 10%.
 */
export function getMilestoneForPercentage(pct: number): MilestoneQuote | null {
  if (pct < 10) return null;
  // Find highest threshold <= pct
  const matched = [...MILESTONE_QUOTES].reverse().find((m) => pct >= m.pct);
  return matched || null;
}

/**
 * Gets exact milestone if percentage lands on a multiple of 10.
 */
export function getExactMilestoneTier(pct: number): MilestoneQuote | null {
  const tier = Math.floor(pct / 10) * 10;
  if (tier < 10) return null;
  return MILESTONE_QUOTES.find((m) => m.pct === tier) || null;
}

/**
 * Speaks the motivational quote aloud using Web Speech API synthesis.
 */
export function speakMilestoneQuote(milestone: MilestoneQuote, lang: "en" | "hi"): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();

    const titleText = milestone.title[lang];
    const quoteText = milestone.quote[lang];
    const cheerText = milestone.cheer[lang];
    const fullText = `${titleText}. ${quoteText} ${cheerText}`;

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1.05;

    // Pick best natural voice if available
    const voices = window.speechSynthesis.getVoices();
    if (lang === "hi") {
      const hiVoice = voices.find((v) => v.lang.startsWith("hi") || v.name.includes("Hindi") || v.name.includes("Kavya"));
      if (hiVoice) utterance.voice = hiVoice;
    } else {
      const enVoice = voices.find((v) => v.lang === "en-IN" || v.lang === "en-GB" || v.name.includes("India"));
      if (enVoice) utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    /* fallback gracefully if speech restricted */
  }
}
