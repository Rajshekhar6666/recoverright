"use client";

import { motion } from "framer-motion";
import React, { useEffect, useRef } from "react";
import { Icon } from "@/components/staff/icons";
import { useLanguage } from "@/lib/i18n";
import type { CallStatus } from "@/lib/types";

interface Props {
  status: CallStatus;
  callerName: string;
  callerRole?: string;
  durationSeconds: number;
  isMuted: boolean;
  isPeerMuted: boolean;
  errorMessage?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onToggleMute: () => void;
  onEndCall: () => void;
  onDismiss: () => void;
}

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function PatientCallModal({
  status,
  callerName,
  callerRole = "Nurse",
  durationSeconds,
  isMuted,
  isPeerMuted,
  errorMessage,
  onAccept,
  onReject,
  onToggleMute,
  onEndCall,
  onDismiss,
}: Props) {
  const { t, lang } = useLanguage();
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Synthesize an audible pleasant chime when ringing
  useEffect(() => {
    if (status !== "ringing") {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const playChime = () => {
          try {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const now = ctx.currentTime;

            // Two pleasant chime tones (E5, G#5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(659.25, now);
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.4);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(830.61, now + 0.15);
            gain2.gain.setValueAtTime(0.12, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.55);
          } catch {
            /* ignore autoplay restriction */
          }
        };

        playChime();
        intervalId = setInterval(playChime, 2500);
      }
    } catch {
      /* ignore */
    }

    return () => {
      clearInterval(intervalId);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [status]);

  if (status === "idle" || status === "ready") return null;

  const isIncoming = status === "ringing" && !callerName.startsWith("Calling");
  const isOutgoing = status === "calling" || (status === "ringing" && callerName.startsWith("Calling"));
  const isConnected = status === "connected" || status === "reconnecting";
  const isFinal = status === "ended" || status === "rejected" || status === "unavailable" || status === "error";

  return (
    <div className="pt-call-backdrop" role="dialog" aria-modal="true">
      <motion.div
        className="pt-call-card"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.22 }}
      >
        {/* Header Tag */}
        <div className="pt-call-top">
          <span className="pt-call-tag">
            <Icon.phone size={14} /> {lang === "hi" ? "अस्पताल ऑडियो कॉल" : "Hospital Care Team Call"}
          </span>
          {isFinal && (
            <button type="button" className="pt-call-close" onClick={onDismiss} aria-label="Close">
              <Icon.x size={17} />
            </button>
          )}
        </div>

        {/* Center Visuals */}
        <div className="pt-call-body">
          <div className={`pt-call-avatar-ring ${isIncoming || isOutgoing ? "is-ringing" : ""} ${isConnected ? "is-connected" : ""}`}>
            <div className="pt-call-avatar-inner">
              <Icon.phone size={32} />
            </div>
          </div>

          <h3 className="pt-call-title">
            {isIncoming ? (t.incomingCallFrom ? t.incomingCallFrom(callerName) : `Incoming Call: ${callerName}`) : callerName}
          </h3>
          <p className="pt-call-sub">
            {callerRole || (lang === "hi" ? "पंजीकृत नर्स · अस्पताल देखभाल टीम" : "Registered Nurse · Hospital Care Team")}
          </p>

          {/* Status badge */}
          <div className={`pt-call-badge pt-call-badge--${status}`}>
            <span className="pt-call-dot" />
            {isIncoming && status === "ringing" && (lang === "hi" ? "इनकमिंग ऑडियो कॉल…" : "Incoming audio call…")}
            {isOutgoing && status === "calling" && t.callingCareTeam}
            {isOutgoing && status === "ringing" && t.ringingStatus}
            {status === "connecting_audio" && t.connectingAudio}
            {status === "connected" && (isPeerMuted ? `${t.callConnected} · ${lang === "hi" ? "केयर टीम म्यूट है" : "Care team muted"}` : t.callConnected)}
            {status === "reconnecting" && (lang === "hi" ? "पुनः कनेक्ट हो रहा है…" : "Reconnecting…")}
            {status === "ended" && t.callEnded}
            {status === "rejected" && t.callDeclined}
            {status === "unavailable" && t.staffOffline}
            {status === "error" && (errorMessage || t.micPermissionRequired)}
          </div>

          {/* Connected Timer */}
          {isConnected && (
            <div className="pt-call-timer" aria-live="polite">
              {formatDuration(durationSeconds)}
            </div>
          )}

          {/* Wave animation */}
          {isConnected && (
            <div className="pt-call-wave" aria-hidden="true">
              {[0.4, 0.8, 0.6, 1.0, 0.7, 0.9, 0.5, 0.85, 0.6].map((m, i) => (
                <i key={i} style={{ height: `${isPeerMuted ? 5 : 8 + Math.sin(Date.now() / 200 + i) * 12 * m}px` }} />
              ))}
            </div>
          )}

          {/* Error notice */}
          {status === "error" && errorMessage && (
            <div className="pt-call-error-msg">
              <Icon.alert size={15} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="pt-call-actions">
          {isIncoming && (
            <>
              <button type="button" className="pt-call-btn pt-call-btn--reject" onClick={onReject}>
                <Icon.phone size={18} />
                <span>{t.declineCall}</span>
              </button>
              <button type="button" className="pt-call-btn pt-call-btn--accept" onClick={onAccept}>
                <Icon.phone size={18} />
                <span>{t.acceptCall}</span>
              </button>
            </>
          )}

          {(isOutgoing || isConnected) && (
            <>
              {isConnected && (
                <button
                  type="button"
                  className={`pt-call-btn pt-call-btn--mute ${isMuted ? "is-muted" : ""}`}
                  onClick={onToggleMute}
                  aria-pressed={isMuted}
                >
                  <Icon.mic size={18} />
                  <span>{isMuted ? t.unmuteMic : t.muteMic}</span>
                </button>
              )}
              <button type="button" className="pt-call-btn pt-call-btn--end" onClick={onEndCall}>
                <Icon.phone size={18} />
                <span>{t.endCall}</span>
              </button>
            </>
          )}

          {isFinal && (
            <button type="button" className="pt-call-btn pt-call-btn--dismiss" onClick={onDismiss}>
              <span>{lang === "hi" ? "बंद करें" : "Dismiss"}</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
