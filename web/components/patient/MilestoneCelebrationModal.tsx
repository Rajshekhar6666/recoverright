"use client";

import { motion, AnimatePresence } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { useLanguage } from "@/lib/i18n";
import { MilestoneQuote, speakMilestoneQuote } from "@/lib/milestoneQuotes";
import {
  generatePersonaMilestoneSpeech,
  speakPersonaWeb,
  VoicePersonaId,
} from "@/lib/voicePersona";

interface Props {
  milestone: MilestoneQuote | null;
  onDismiss: () => void;
  autoSpoken?: boolean;
  persona?: VoicePersonaId;
  patientName?: string;
}

export default function MilestoneCelebrationModal({
  milestone,
  onDismiss,
  autoSpoken = true,
  persona = "caring_maa",
  patientName = "Beta",
}: Props) {
  const { lang } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const currentLang = lang === "hi" ? "hi" : "en";

  const personaSpeech = milestone
    ? generatePersonaMilestoneSpeech(persona, patientName, currentLang)
    : null;

  useEffect(() => {
    if (!milestone || !personaSpeech) return;

    if (autoSpoken) {
      setIsSpeaking(true);
      speakPersonaWeb(personaSpeech.speech, persona, currentLang);
      const timer = setTimeout(() => setIsSpeaking(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [milestone, currentLang, autoSpoken, persona, patientName]);

  if (!milestone || !personaSpeech) return null;

  const title = milestone.title[currentLang];
  const quote = personaSpeech.quote;
  const author = personaSpeech.author;
  const cheer = milestone.cheer[currentLang];

  const handleReplaySpeech = () => {
    setIsSpeaking(true);
    speakPersonaWeb(personaSpeech.speech, persona, currentLang);
    setTimeout(() => setIsSpeaking(false), 7000);
  };

  return (
    <div className="pt-milestone-backdrop" role="dialog" aria-modal="true" aria-labelledby="milestone-title">
      <motion.div
        className="pt-milestone-card"
        initial={{ opacity: 0, scale: 0.88, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 20 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
      >
        {/* Confetti / Sparkle Floating Embellishments */}
        <div className="pt-milestone-confetti" aria-hidden="true">
          <span>✨</span>
          <span>🎉</span>
          <span>⭐</span>
          <span>🌸</span>
          <span>💖</span>
        </div>

        {/* Top Header Badge */}
        <div className="pt-milestone-head">
          <span className="pt-milestone-pct-badge">
            {milestone.pct}% {lang === "hi" ? "पूरा हुआ!" : "Milestone Achieved!"}
          </span>
          <button
            type="button"
            className="pt-milestone-close-btn"
            onClick={onDismiss}
            aria-label="Close celebration"
          >
            <Icon.x size={18} />
          </button>
        </div>

        {/* Center Animated Emoji Ring */}
        <div className="pt-milestone-body">
          <div className="pt-milestone-emoji-wrap">
            <span className="pt-milestone-emoji">{milestone.emoji}</span>
          </div>

          <h2 id="milestone-title" className="pt-milestone-title">
            {title}
          </h2>

          {/* Spoken Quote Text */}
          <div className="pt-milestone-quote-box">
            <p className="pt-milestone-quote-text">“{quote}”</p>
            <small style={{ color: "#0d9488", fontWeight: 700, marginTop: 4, display: "block" }}>
              {author}
            </small>
          </div>

          {/* Cheerful Tagline */}
          <p className="pt-milestone-cheer">{cheer}</p>

          {/* Voice Replay & Wave Indicator */}
          <div className="pt-milestone-voice-row">
            <button
              type="button"
              className={`pt-milestone-audio-btn ${isSpeaking ? "is-speaking" : ""}`}
              onClick={handleReplaySpeech}
              title="Hear celebration in chosen persona voice"
            >
              <Icon.volume size={16} />
              <span>{isSpeaking ? (lang === "hi" ? "बोल रहा हूँ..." : "Speaking...") : (lang === "hi" ? "आवाज़ दोबारा सुनें" : "Listen in Persona Voice")}</span>
            </button>
          </div>

          {/* Close Button */}
          <button
            type="button"
            className="pt-btn pt-btn--solid pt-milestone-continue"
            onClick={onDismiss}
          >
            {lang === "hi" ? "रिकवरी जारी रखें" : "Continue Recovery"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
