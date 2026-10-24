"use client";

import { motion, AnimatePresence } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { useLanguage } from "@/lib/i18n";
import { MilestoneQuote, speakMilestoneQuote } from "@/lib/milestoneQuotes";

interface Props {
  milestone: MilestoneQuote | null;
  onDismiss: () => void;
  autoSpoken?: boolean;
}

export default function MilestoneCelebrationModal({
  milestone,
  onDismiss,
  autoSpoken = true,
}: Props) {
  const { lang } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!milestone) return;

    if (autoSpoken) {
      setIsSpeaking(true);
      speakMilestoneQuote(milestone, lang);
      const timer = setTimeout(() => setIsSpeaking(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [milestone, lang, autoSpoken]);

  if (!milestone) return null;

  const currentLang = lang === "hi" ? "hi" : "en";
  const title = milestone.title[currentLang];
  const quote = milestone.quote[currentLang];
  const cheer = milestone.cheer[currentLang];

  const handleReplaySpeech = () => {
    setIsSpeaking(true);
    speakMilestoneQuote(milestone, currentLang);
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
          </div>

          {/* Cheerful Tagline */}
          <p className="pt-milestone-cheer">{cheer}</p>

          {/* Voice Replay & Wave Indicator */}
          <div className="pt-milestone-voice-row">
            <button
              type="button"
              className={`pt-milestone-speak-btn ${isSpeaking ? "is-speaking" : ""}`}
              onClick={handleReplaySpeech}
              title={lang === "hi" ? "आवाज़ में फिर से सुनें" : "Listen aloud again"}
            >
              <Icon.volume size={16} />
              <span>{lang === "hi" ? "आवाज़ में सुनें" : "Speak Aloud"}</span>
            </button>

            {isSpeaking && (
              <div className="pt-milestone-wave" aria-hidden="true">
                {[0.4, 0.9, 0.6, 1.0, 0.7, 0.95, 0.5].map((m, i) => (
                  <i key={i} style={{ height: `${8 + Math.sin(Date.now() / 180 + i) * 10 * m}px` }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dismiss Button Footer */}
        <div className="pt-milestone-footer">
          <button
            type="button"
            className="pt-milestone-action-btn"
            onClick={onDismiss}
          >
            <span>{lang === "hi" ? "धन्यवाद, जारी रखें! 👏" : "Keep Going! 👏"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
