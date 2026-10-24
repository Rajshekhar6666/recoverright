"use client";

import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import StaffCallModal from "./StaffCallModal";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { initials } from "@/lib/time";
import { extractPatientOverview, type PatientParsedOverview } from "@/lib/patientOverview";
import { WebRTCClient } from "@/lib/webrtcClient";
import type { CallStatus, PatientDetail, RecoveryTask, ReviewData, RunMeta } from "@/lib/types";

interface Props {
  runId: string;
  meta: RunMeta;
  data: ReviewData;
  detail: PatientDetail | null;
  onRefreshDetail: () => Promise<void>;
  onViewSourceDoc: () => void;
  onOpenAddDoc: () => void;
}

export default function PatientOverviewPanel({
  runId,
  meta,
  data,
  detail,
  onRefreshDetail,
  onViewSourceDoc,
  onOpenAddDoc,
}: Props) {
  const { t, lang } = useLanguage();
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);

  const parsed: PatientParsedOverview = extractPatientOverview(data, meta, detail);
  const isApproved = meta.status === "approved" || meta.status === "reapproved";
  const patientToken = meta.patient_token || (meta as any).patient?.patient_token || runId;

  // Real-Time Calling State
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPeerMuted, setIsPeerMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const callClientRef = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    const staffClientId = `staff_${runId}_${Math.random().toString(36).slice(2, 7)}`;
    const client = new WebRTCClient({
      clientId: staffClientId,
      role: "staff",
      runId,
      displayName: "Registered Nurse",
      onStatusChange: (status, err) => {
        setCallStatus(status);
        if (err) setCallError(err);
      },
      onPeerStatus: (peer) => {
        if (peer.role === "patient") {
          setPeerOnline(peer.status === "online");
        }
      },
      onPeerMuteChange: (muted) => setIsPeerMuted(muted),
      onDurationTick: (sec) => setDurationSeconds(sec),
    });

    callClientRef.current = client;

    return () => {
      client.destroy();
      callClientRef.current = null;
    };
  }, [runId]);

  const handleStartCall = async () => {
    setCallError(null);
    setIsMuted(false);
    setIsPeerMuted(false);
    setDurationSeconds(0);
    await callClientRef.current?.initiateCall("patient");
  };

  const handleToggleMute = () => {
    if (callClientRef.current) {
      const muted = callClientRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleEndCall = () => {
    callClientRef.current?.endCall("nurse_hangup");
  };

  const handleDismissCall = () => {
    setCallStatus("idle");
    setCallError(null);
    void onRefreshDetail();
  };

  const toggleTask = async (task: RecoveryTask) => {
    if (!isApproved) return;
    const newAction = task.status === "completed" ? "reset" : "complete";
    setUpdatingTaskId(task.task_id);
    try {
      await api.updateTask(patientToken, task.task_id, newAction, "Registered Nurse", "Updated in Staff Patient Workspace");
      await onRefreshDetail();
      setTaskNotice(t.taskNoticeUpdated(task.title));
      setTimeout(() => setTaskNotice(null), 3000);
    } catch {
      setTaskNotice(lang === "hi" ? "कार्य स्थिति अद्यतन करने में विफल।" : "Could not update task status.");
      setTimeout(() => setTaskNotice(null), 3500);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // Helper to localize vital labels
  const getVitalLabel = (label: string) => {
    if (lang !== "hi") return label;
    if (label.includes("Blood Pressure")) return t.bloodPressure;
    if (label.includes("Heart Rate")) return t.heartRate;
    if (label.includes("Oxygen") || label.includes("SpO2")) return t.oxygenSat;
    if (label.includes("Temperature")) return t.temperature;
    if (label.includes("Pain")) return t.painScore;
    return label;
  };

  const getVitalNote = (note?: string) => {
    if (!note || lang !== "hi") return note;
    if (note.includes("normotensive")) return t.normotensive;
    if (note.includes("sinus rhythm")) return t.normalRhythm;
    if (note.includes("Room air")) return t.roomAir;
    if (note.includes("Afebrile")) return t.afebrile;
    if (note.includes("controlled")) return t.mildControlled;
    return note;
  };

  const getVitalTheme = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("blood pressure") || l.includes("bp")) {
      return { bg: "#eff6ff", border: "#dbeafe", color: "#1d4ed8", icon: Icon.heart };
    }
    if (l.includes("heart rate") || l.includes("pulse")) {
      return { bg: "#fff1f2", border: "#ffe4e6", color: "#be123c", icon: Icon.pulse };
    }
    if (l.includes("oxygen") || l.includes("spo2")) {
      return { bg: "#f0fdfa", border: "#ccfbf1", color: "#0f766e", icon: Icon.spark };
    }
    if (l.includes("temperature") || l.includes("temp")) {
      return { bg: "#fffbeb", border: "#fef3c7", color: "#b45309", icon: Icon.spark };
    }
    return { bg: "#faf5ff", border: "#f3e8ff", color: "#7e22ce", icon: Icon.shield };
  };

  const getTaskCategoryBadge = (category?: string) => {
    const c = (category || "").toLowerCase();
    if (c.includes("medication") || c.includes("dawa")) {
      return { bg: "#f5f3ff", color: "#6d28d9", label: lang === "hi" ? "दवा" : "Medication" };
    }
    if (c.includes("activity") || c.includes("exercise") || c.includes("walk")) {
      return { bg: "#f0fdfa", color: "#0f766e", label: lang === "hi" ? "गतिविधि" : "Activity" };
    }
    if (c.includes("wound") || c.includes("dressing")) {
      return { bg: "#fff1f2", color: "#be123c", label: lang === "hi" ? "ड्रेसिंग" : "Wound" };
    }
    if (c.includes("diet") || c.includes("fluid")) {
      return { bg: "#eff6ff", color: "#1d4ed8", label: lang === "hi" ? "आहार" : "Diet" };
    }
    return { bg: "#f1f5f9", color: "#475569", label: category || "General" };
  };

  const careStatusLabel = isApproved
    ? (parsed.completionPct === 100 ? t.statusComplete : t.statusRecoveryInProgress)
    : t.statusDraftReview;

  // Circular progress ring calculations
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference * (1 - (parsed.completionPct || 0) / 100);

  return (
    <div className="pt-overview-scroll">
      {/* 1. Visually Impressive Patient Header Card */}
      <section className="rr-card pt-card pt-profile-card">
        <div className="pt-profile-header">
          {/* Avatar with gradient border */}
          <div className="pt-avatar-wrap">
            <div className="pt-avatar-ring">
              <span className="pt-avatar-initials">{initials(parsed.name)}</span>
            </div>
            <span className={`pt-avatar-status pt-avatar-status--${parsed.statusTone}`} />
          </div>

          <div className="pt-profile-info">
            <div className="pt-name-row">
              <h2 className="pt-patient-name">{parsed.name}</h2>
              <span className={`rr-pill rr-pill--${parsed.statusTone}`}>
                <i className="rr-dot" /> {careStatusLabel}
              </span>
            </div>

            <div className="pt-meta-row">
              <span className="pt-badge pt-badge--teal">{parsed.age}</span>
              <span className="pt-badge pt-badge--blue">{parsed.sex}</span>
              <span className="pt-badge pt-badge--mrn">{parsed.mrn}</span>
              <span className="pt-badge pt-badge--lang">{(meta.patient?.language || "EN").toUpperCase()}</span>
            </div>
          </div>

          {/* Compact prominent progress ring */}
          <div className="pt-header-ring" title={`${parsed.completionPct}% completed`}>
            <svg width={64} height={64} viewBox="0 0 64 64">
              <circle
                cx={32}
                cy={32}
                r={radius}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={5.5}
              />
              <circle
                cx={32}
                cy={32}
                r={radius}
                fill="none"
                stroke={parsed.completionPct === 100 ? "#10b981" : "#0d9488"}
                strokeWidth={5.5}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progressOffset}
                transform="rotate(-90 32 32)"
                style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
              <text
                x={32}
                y={37}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill="#0f172a"
              >
                {parsed.completionPct}%
              </text>
            </svg>
          </div>
        </div>

        {/* Primary Health Condition Banner */}
        <div className="pt-condition-box">
          <div className="pt-cond-header">
            <span className="pt-cond-tag">
              <Icon.pulse size={13} /> {t.primaryConcern}
            </span>
            <span className="pt-cond-update">
              <Icon.clock size={12} /> {parsed.latestUpdate}
            </span>
          </div>
          <div className="pt-cond-val">{parsed.condition}</div>
          <div className="pt-cond-sub">
            <span>{t.intakeRecord}: </span>
            <b style={{ color: "var(--ink)" }}>{meta.filename}</b>
            {meta.created_at && (
              <span> · {new Date(meta.created_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        {/* Contact info grid & Live Calling Action */}
        <div className="pt-contact-grid" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div className="pt-contact-col">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <small>{t.patientContact}</small>
              <span className={`rr-peer-badge ${peerOnline ? "is-online" : "is-offline"}`}>
                <i className="rr-peer-dot" /> {peerOnline ? t.patientOnlineStatus : t.patientOfflineStatus}
              </span>
            </div>
            <b>{parsed.phone}</b>
          </div>
          {parsed.guardianName && (
            <div className="pt-contact-col">
              <small>{t.caregiverContact}</small>
              <b>{parsed.guardianName} ({parsed.guardianPhone || "–"})</b>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="rr-call-btn"
              onClick={handleStartCall}
              disabled={callStatus === "calling" || callStatus === "connected"}
              title={t.callPatient}
            >
              <Icon.phone size={15} />
              <span>{t.callPatient}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Clinical Observations & Vital Signs with Color Tints */}
      <section className="rr-card pt-card">
        <div className="cc-panel-head">
          <h3 className="pt-sec-title">
            <Icon.pulse size={16} /> {t.clinicalObservations}
          </h3>
          <small className="rr-mute">{t.vitalsLatestAssessment}</small>
        </div>

        <div className="pt-vitals-grid">
          {parsed.vitals.map((v) => {
            const theme = getVitalTheme(v.label);
            const VIcon = theme.icon;

            return (
              <div
                key={v.id}
                className="pt-vital-box"
                style={{
                  background: theme.bg,
                  borderColor: theme.border,
                }}
              >
                <div className="pt-vital-header">
                  <span className="pt-vital-label" style={{ color: theme.color }}>
                    {getVitalLabel(v.label)}
                  </span>
                  <span style={{ color: theme.color }}>
                    <VIcon size={14} />
                  </span>
                </div>
                <div className="pt-vital-reading">
                  <b style={{ color: "#0f172a" }}>{v.value}</b>
                  {v.unit && <span style={{ color: "#64748b" }}>{v.unit}</span>}
                </div>
                {v.note && (
                  <div className="pt-vital-note" style={{ color: theme.color }}>
                    {getVitalNote(v.note)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Care Plan Progress & Recovery Tasks */}
      <section className="rr-card pt-card">
        <div className="cc-panel-head">
          <h3 className="pt-sec-title">
            <Icon.check size={16} /> {t.carePlanProgress}
          </h3>
          <span className="rr-chip rr-chip--ok" style={{ fontWeight: 700 }}>
            {t.percentCompleted(parsed.completionPct)}
          </span>
        </div>

        <div className="pt-progress-summary">
          {/* Animated gradient progress track */}
          <div
            className="pt-bar-track"
            style={{
              width: "100%",
              height: 9,
              borderRadius: 6,
              background: "#e2e8f0",
              overflow: "hidden",
              margin: "6px 0 14px",
            }}
          >
            <motion.div
              style={{
                height: "100%",
                borderRadius: 6,
                background: parsed.completionPct === 100
                  ? "linear-gradient(90deg, #10b981, #059669)"
                  : "linear-gradient(90deg, #0d9488, #14b8a6)",
              }}
              animate={{ width: `${Math.max(parsed.completionPct, 4)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          <div className="pt-task-counts">
            <div className="pt-stat-pill pt-stat--ok">
              <Icon.check size={14} />
              <span><b>{parsed.taskCounts.completed}</b> {t.tasksCompleted}</span>
            </div>
            <div className="pt-stat-pill pt-stat--warn">
              <Icon.clock size={14} />
              <span><b>{parsed.taskCounts.pending}</b> {t.tasksPending}</span>
            </div>
            {parsed.taskCounts.overdue > 0 && (
              <div className="pt-stat-pill pt-stat--bad">
                <Icon.alert size={14} />
                <span><b>{parsed.taskCounts.overdue}</b> {t.tasksOverdue}</span>
              </div>
            )}
          </div>
        </div>

        {/* Task List or Draft Items */}
        {isApproved && parsed.tasks.length > 0 ? (
          <div className="pt-tasks-list">
            <div className="pt-task-header">
              <span>{t.patientRecoveryTasks}</span>
              <small>{t.taskToggleHint}</small>
            </div>
            {parsed.tasks.slice(0, 6).map((tItem) => {
              const done = tItem.status === "completed";
              const isOverdue = (tItem as any).status === "overdue";
              const busy = updatingTaskId === tItem.task_id;
              const catBadge = getTaskCategoryBadge(tItem.category);

              return (
                <div
                  key={tItem.task_id}
                  className={`pt-task-row ${done ? "is-done" : ""} ${isOverdue ? "is-overdue" : ""}`}
                  onClick={() => !busy && toggleTask(tItem)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && !busy && toggleTask(tItem)}
                  style={{
                    borderLeft: isOverdue ? "3px solid #ef4444" : done ? "3px solid #10b981" : "3px solid #0d9488",
                  }}
                >
                  <button
                    type="button"
                    className={`pt-checkbox ${done ? "is-checked" : ""}`}
                    disabled={busy}
                    aria-label={`Mark ${tItem.title} as ${done ? "pending" : "completed"}`}
                  >
                    {done ? <Icon.check size={13} /> : null}
                  </button>
                  <div className="pt-task-text">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <b className="pt-task-title" style={{ textDecoration: done ? "line-through" : "none" }}>
                        {tItem.title}
                      </b>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: catBadge.bg,
                          color: catBadge.color,
                        }}
                      >
                        {catBadge.label}
                      </span>
                    </div>
                    {tItem.description && <p className="pt-task-desc">{tItem.description}</p>}
                    <div className="pt-task-meta">
                      {tItem.scheduled_time && (
                        <span><Icon.clock size={12} /> {tItem.scheduled_time}</span>
                      )}
                    </div>
                  </div>
                  <span className={`rr-chip rr-chip--${done ? "ok" : isOverdue ? "bad" : "warn"} pt-task-chip`}>
                    {busy ? t.updating : done ? t.tasksCompleted : isOverdue ? t.tasksOverdue : t.tasksPending}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pt-draft-summary">
            <div className="pt-draft-banner">
              <Icon.alert size={16} />
              <div>
                <b>{t.draftCarePlanAwaiting}</b>
                <p>{t.draftCarePlanNotice(data.fields.length)}</p>
              </div>
            </div>
            <div className="pt-rec-preview-list">
              {data.fields.slice(0, 4).map((f) => {
                const label = f.field.category.replace(/_/g, " ").toUpperCase();
                const text = f.field.proposed?.value || f.field.proposed?.name || f.field.quote || "Item";
                return (
                  <div key={f.field.field_id} className="pt-rec-preview-item">
                    <span className="pt-rec-cat">{label}</span>
                    <span className="pt-rec-val">{String(text).slice(0, 65)}</span>
                    <span className={`rr-chip rr-chip--${f.decision ? "ok" : "warn"}`}>
                      {f.decision ? t.statusApproved : t.statusNeedsReview}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {taskNotice && <div className="pt-task-notice">{taskNotice}</div>}
      </section>

      {/* 4. Alerts, Red Flags & Follow-up */}
      <section className="rr-card pt-card">
        <div className="cc-panel-head">
          <h3 className="pt-sec-title">
            <Icon.bell size={16} /> {t.alertsAndFollowUp}
          </h3>
        </div>

        <div className="pt-alerts-stack">
          {parsed.alerts.map((a) => (
            <div key={a.id} className={`pt-alert-item ${a.urgent ? "is-urgent" : ""}`}>
              <div className="pt-alert-ic">
                {a.urgent ? <Icon.siren size={18} /> : <Icon.alert size={18} />}
              </div>
              <div className="pt-alert-body">
                <b>{a.title}</b>
                <p>{a.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {parsed.followUp && (
          <div className="pt-followup-box">
            <div className="pt-followup-head">
              <Icon.calendar size={15} /> {t.scheduledFollowUp}
            </div>
            <div className="pt-followup-body">{parsed.followUp}</div>
          </div>
        )}
      </section>

      {/* 5. Recent Activity & Audit Timeline */}
      <section className="rr-card pt-card">
        <div className="cc-panel-head">
          <h3 className="pt-sec-title">
            <Icon.clock size={16} /> {t.recentActivity}
          </h3>
          <span className="pt-badge pt-badge--mrn" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {parsed.latestUpdate}
          </span>
        </div>

        <div className="pt-activity-timeline">
          {parsed.recentActivity.map((act, i) => (
            <div key={i} className="pt-activity-row">
              <span className={`pt-activity-dot pt-activity-dot--${act.tone}`} />
              <div className="pt-activity-info">
                <div className="pt-activity-header">
                  <b>{act.action}</b>
                  <small>{new Date(act.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </div>
                <p>{act.text}</p>
                <span className="pt-activity-actor"><Icon.user size={11} /> {act.actor}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Document Tools & Quick Action Bar */}
      <div className="pt-footer-actions">
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          onClick={onViewSourceDoc}
          title={t.viewOriginalDocument}
        >
          <Icon.file size={15} /> {t.viewOriginalDocument}
        </button>

        <button
          type="button"
          className="rr-btn rr-btn--primary rr-btn--sm"
          onClick={onOpenAddDoc}
          title={t.addDocument}
        >
          <Icon.upload size={15} /> {t.addDocument}
        </button>
      </div>
      {/* Staff Telehealth Calling Overlay */}
      <StaffCallModal
        status={callStatus}
        patientName={parsed.name}
        patientAge={parsed.age}
        patientSex={parsed.sex}
        patientMrn={parsed.mrn}
        patientPhone={parsed.phone}
        durationSeconds={durationSeconds}
        isMuted={isMuted}
        isPeerMuted={isPeerMuted}
        errorMessage={callError}
        onToggleMute={handleToggleMute}
        onEndCall={handleEndCall}
        onDismiss={handleDismissCall}
      />
    </div>
  );
}
