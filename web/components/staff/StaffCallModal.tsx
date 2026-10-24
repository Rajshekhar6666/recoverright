"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useLanguage } from "@/lib/i18n";
import type { CallStatus } from "@/lib/types";

interface Props {
  status: CallStatus;
  patientName: string;
  patientAge?: string | number;
  patientSex?: string;
  patientMrn?: string;
  patientPhone?: string;
  durationSeconds: number;
  isMuted: boolean;
  isPeerMuted: boolean;
  errorMessage?: string | null;
  onToggleMute: () => void;
  onEndCall: () => void;
  onDismiss: () => void;
}

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function StaffCallModal({
  status,
  patientName,
  patientAge,
  patientSex,
  patientMrn,
  patientPhone,
  durationSeconds,
  isMuted,
  isPeerMuted,
  errorMessage,
  onToggleMute,
  onEndCall,
  onDismiss,
}: Props) {
  const { t, lang } = useLanguage();
  const [isMinimized, setIsMinimized] = useState(false);

  // If in ended, rejected, or error state, auto-allow dismiss
  const isFinal = status === "ended" || status === "rejected" || status === "unavailable" || status === "error";

  if (status === "idle" || status === "ready") return null;

  const initials = patientName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Status subtitle
  const getStatusSubtitle = () => {
    switch (status) {
      case "calling":
        return t.callingPatient;
      case "ringing":
        return t.ringingStatus;
      case "connecting_audio":
        return t.connectingAudio;
      case "connected":
        return isPeerMuted ? `${t.callConnected} · ${lang === "hi" ? "मरीज़ म्यूट है" : "Patient muted"}` : t.callConnected;
      case "reconnecting":
        return lang === "hi" ? "पुनः कनेक्ट हो रहा है…" : "Reconnecting audio…";
      case "rejected":
        return t.callDeclined;
      case "unavailable":
        return t.patientOffline;
      case "ended":
        return t.callEnded;
      case "error":
        return errorMessage || t.micPermissionRequired;
      default:
        return "";
    }
  };

  // Minimized floating call pill
  if (isMinimized && (status === "calling" || status === "ringing" || status === "connected")) {
    return (
      <div className="rr-call-docked" role="region" aria-label="Active Call Docked">
        <div className="rr-call-dock-info">
          <span className={`rr-call-dock-dot ${status === "connected" ? "is-connected" : "is-ringing"}`} />
          <div className="rr-call-dock-text">
            <b>{patientName}</b>
            <small>{status === "connected" ? formatDuration(durationSeconds) : getStatusSubtitle()}</small>
          </div>
        </div>

        <div className="rr-call-dock-actions">
          {status === "connected" && (
            <button
              type="button"
              className={`rr-call-dock-btn ${isMuted ? "is-muted" : ""}`}
              onClick={onToggleMute}
              title={isMuted ? t.unmuteMic : t.muteMic}
            >
              <Icon.mic size={14} />
            </button>
          )}
          <button
            type="button"
            className="rr-call-dock-btn"
            onClick={() => setIsMinimized(false)}
            title={t.expandCall}
          >
            <Icon.spark size={14} />
          </button>
          <button
            type="button"
            className="rr-call-dock-btn is-end"
            onClick={onEndCall}
            title={t.endCall}
          >
            <Icon.phone size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rr-modal-backdrop" role="dialog" aria-modal="true">
      <motion.div
        className="rr-call-panel"
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ duration: 0.22 }}
      >
        {/* Header with Minimize & Close */}
        <div className="rr-call-header">
          <div className="rr-call-tag">
            <Icon.phone size={14} /> {lang === "hi" ? "अस्पताल टेलीहेल्थ ऑडियो कॉल" : "Hospital Telehealth Audio"}
          </div>
          <div className="rr-call-head-actions">
            {!isFinal && (
              <button
                type="button"
                className="rr-call-icon-btn"
                onClick={() => setIsMinimized(true)}
                title={t.dockCall}
              >
                <Icon.chevronDown size={17} />
              </button>
            )}
            {isFinal && (
              <button
                type="button"
                className="rr-call-icon-btn"
                onClick={onDismiss}
                title="Close"
              >
                <Icon.x size={17} />
              </button>
            )}
          </div>
        </div>

        {/* Center Patient Visual & Status */}
        <div className="rr-call-center">
          <div className={`rr-call-avatar-wrap ${status === "calling" || status === "ringing" ? "is-pulsing" : ""} ${status === "connected" ? "is-connected" : ""}`}>
            <div className="rr-call-avatar">{initials}</div>
          </div>

          <h2 className="rr-call-name">{patientName}</h2>
          <div className="rr-call-meta">
            {patientAge && <span>{patientAge} yrs</span>}
            {patientSex && <span> · {patientSex}</span>}
            {patientMrn && <span> · MRN: {patientMrn}</span>}
          </div>
          {patientPhone && (
            <div className="rr-call-phone">
              <Icon.phone size={12} /> {patientPhone}
            </div>
          )}

          {/* Status badge & Duration */}
          <div className={`rr-call-status-pill rr-call-status-pill--${status}`}>
            <span className="rr-call-dot" /> {getStatusSubtitle()}
          </div>

          {status === "connected" && (
            <div className="rr-call-duration" aria-live="polite">
              {formatDuration(durationSeconds)}
            </div>
          )}

          {/* Audio Wave Activity Animation while connected */}
          {status === "connected" && (
            <div className="rr-call-wave" aria-hidden="true">
              {[0.5, 0.9, 0.6, 1.0, 0.75, 0.95, 0.5, 0.8, 0.6].map((m, i) => (
                <i
                  key={i}
                  style={{
                    height: `${isPeerMuted ? 6 : 8 + Math.sin(Date.now() / 200 + i) * 14 * m}px`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Error notice */}
          {status === "error" && errorMessage && (
            <div className="rr-call-error-box">
              <Icon.alert size={16} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Controls footer */}
        <div className="rr-call-footer">
          {status === "connected" && (
            <button
              type="button"
              className={`rr-call-ctl-btn ${isMuted ? "is-active-mute" : ""}`}
              onClick={onToggleMute}
              aria-pressed={isMuted}
            >
              <Icon.mic size={18} />
              <span>{isMuted ? t.unmuteMic : t.muteMic}</span>
            </button>
          )}

          {!isFinal && (
            <button
              type="button"
              className="rr-call-ctl-btn rr-call-ctl-btn--end"
              onClick={onEndCall}
            >
              <Icon.phone size={18} />
              <span>{t.endCall}</span>
            </button>
          )}

          {isFinal && (
            <button
              type="button"
              className="rr-call-ctl-btn rr-call-ctl-btn--dismiss"
              onClick={onDismiss}
            >
              <span>{lang === "hi" ? "विंडो बंद करें" : "Dismiss Call"}</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
