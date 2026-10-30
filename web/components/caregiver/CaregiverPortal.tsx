"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { api } from "@/lib/api";
import type { CaregiverNotification, CaregiverPatientView } from "@/lib/types";

export default function CaregiverPortal({ token }: { token: string }) {
  const [data, setData] = useState<CaregiverPatientView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [careMsgText, setCareMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getCaregiverPatientView(token);
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load caregiver portal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleConsentToggle = async (status: "consented" | "revoked") => {
    if (!data) return;
    try {
      await api.updateCaregiverConsent(token, status, data.notification_preferences || ["sms"]);
      setActionMsg(status === "consented" ? "Consent updated: Notifications active." : "Access revoked.");
      await loadData();
    } catch {
      setActionMsg("Could not update consent.");
    }
  };

  const handleChannelToggle = async (channel: "sms" | "whatsapp") => {
    if (!data) return;
    const current = new Set(data.notification_preferences || ["sms"]);
    if (current.has(channel)) {
      if (current.size > 1) current.delete(channel);
    } else {
      current.add(channel);
    }
    const updated = Array.from(current);
    try {
      await api.updateCaregiverConsent(token, data.consent_status || "consented", updated);
      setActionMsg(`Updated notification preferences: ${updated.join(", ").toUpperCase()}`);
      await loadData();
    } catch {
      setActionMsg("Could not update preferences.");
    }
  };

  const handleTaskAction = async (taskId: string, action: "complete" | "reset") => {
    try {
      await api.caregiverTaskAction(token, taskId, action);
      setActionMsg(action === "complete" ? "Task marked completed on behalf of patient." : "Task reset.");
      await loadData();
    } catch {
      setActionMsg("Failed to update task.");
    }
  };

  const handleDoseReport = async (medId: string, medName: string) => {
    try {
      await api.caregiverReportDose(token, medId, true, "Administered by family caregiver");
      setActionMsg(`Recorded dose confirmation for ${medName}.`);
      await loadData();
    } catch {
      setActionMsg("Failed to log dose.");
    }
  };

  const handleTestNotify = async (type: "emergency" | "milestone") => {
    try {
      const res = await api.notifyCaregiver(
        token,
        type,
        "sms",
        type === "emergency" ? "TEST: Patient reported severe pain" : "TEST: Day 3 recovery target reached!"
      );
      setActionMsg(`Test notification dispatched via ${(res.channel || "sms").toUpperCase()}: "${res.message.slice(0, 40)}..."`);
      await loadData();
    } catch {
      setActionMsg("Failed to dispatch test notification.");
    }
  };

  const handleSendCareMessage = async (textToSend: string, emoji: string = "❤️") => {
    if (!data?.run_id || !textToSend.trim()) return;
    setSendingMsg(true);
    try {
      await api.sendCareMessage(data.run_id, data.caregiver_name || "Family", textToSend, textToSend, emoji);
      setActionMsg(`Care message delivered to ${data.patient_name || "patient"}! It will show up on their home screen.`);
      setCareMsgText("");
    } catch {
      setActionMsg("Failed to deliver care message.");
    } finally {
      setSendingMsg(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="pt-wrap" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "#64748b" }}>Loading caregiver companion portal...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="pt-wrap" style={{ padding: 40, textAlign: "center" }}>
        <div className="pt-card" style={{ maxWidth: 500, margin: "0 auto", padding: 30 }}>
          <span className="pt-ic pt-ic--red" style={{ margin: "0 auto 12px" }}>
            <Icon.alert size={24} />
          </span>
          <h2 style={{ margin: "0 0 8px" }}>Caregiver Portal Access Restricted</h2>
          <p style={{ color: "#64748b", margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tasks = data.tasks_today || [];
  const meds = data.medications || [];
  const notifs = data.recent_notifications || [];
  const consentStatus = data.consent_status || "pending";
  const prefs = data.notification_preferences || ["sms"];

  return (
    <div className="pt-wrap" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px" }}>
      {/* Portal Header */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0f766e" }}>
              RecoverRight Family Companion
            </span>
            <h1 style={{ fontSize: 24, margin: "4px 0", color: "#0f172a" }}>
              Caring for {data.patient_name || "Patient"}
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#475569" }}>
              Logged in as <b>{data.caregiver_name || "Caregiver"}</b> ({data.relationship || "Family"}) - Phone: {data.phone || "On File"}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                display: "inline-block",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: consentStatus === "consented" ? "#dcfce7" : "#fef3c7",
                color: consentStatus === "consented" ? "#166534" : "#92400e",
              }}
            >
              Consent: {consentStatus.toUpperCase()}
            </span>
          </div>
        </div>

        {actionMsg && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, fontSize: 13, color: "#166534" }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Emergency Alert Banner (if patient triggered help) */}
      {data.active_help && (
        <div className="pt-card" style={{ marginBottom: 20, background: "#fef2f2", borderColor: "#f87171" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="pt-ic pt-ic--red" style={{ background: "#fee2e2", color: "#dc2626" }}>
              <Icon.alert size={24} />
            </span>
            <div>
              <b style={{ color: "#991b1b", fontSize: 16 }}>Patient Emergency Alert Active</b>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "#7f1d1d" }}>
                Patient signaled: "{data.active_help.heard}". Hospital care team has been alerted. Please check in with {data.patient_name || "the patient"}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Consent & Notification Preferences */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Notification Preferences & Consent</h3>
        <p style={{ fontSize: 14, color: "#475569", margin: "0 0 12px" }}>
          Authorized family caregivers receive automated notices for critical events, missed doses, and milestones.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className={`pt-btn ${consentStatus === "consented" ? "pt-btn--outline" : ""}`}
            onClick={() => handleConsentToggle(consentStatus === "consented" ? "revoked" : "consented")}
            style={{ fontSize: 13, padding: "6px 14px" }}
          >
            {consentStatus === "consented" ? "Revoke Consent" : "Grant Consent"}
          </button>

          {consentStatus === "consented" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Channels:</span>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.includes("sms")}
                  onChange={() => handleChannelToggle("sms")}
                />
                SMS
              </label>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.includes("whatsapp")}
                  onChange={() => handleChannelToggle("whatsapp")}
                />
                WhatsApp
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Recovery Adherence & Progress */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Today's Recovery Progress</h3>
            <p style={{ margin: 0, fontSize: 14, color: "#475569" }}>
              Recovery Plan: Day 1 of ~{data.plan_duration_days || 14} planned recovery days
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#0f766e" }}>{data.adherence_rate ?? 0}%</span>
            <div style={{ fontSize: 12, color: "#64748b" }}>Tasks Completed</div>
          </div>
        </div>
      </div>

      {/* Caregiver Task Assistance */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Assisting with Daily Tasks</h3>
        {tasks.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>No tasks pending today.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((task: any) => {
              const isCompleted = task.status === "completed";
              return (
                <div
                  key={task.task_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: isCompleted ? "#f0fdf4" : "#ffffff",
                    border: "1px solid",
                    borderColor: isCompleted ? "#bbf7d0" : "#e2e8f0",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, textDecoration: isCompleted ? "line-through" : "none", color: isCompleted ? "#166534" : "#0f172a" }}>
                      {task.title}
                    </div>
                    {task.description && <div style={{ fontSize: 12, color: "#64748b" }}>{task.description}</div>}
                  </div>
                  <button
                    className="pt-btn pt-btn--sm"
                    onClick={() => handleTaskAction(task.task_id, isCompleted ? "reset" : "complete")}
                    style={{ fontSize: 12, padding: "4px 10px" }}
                  >
                    {isCompleted ? "Reset Task" : "Mark Done"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Medication Verification */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Scheduled Medications</h3>
        {meds.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>No scheduled medications listed on recovery plan.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {meds.map((med: any) => (
              <div
                key={med.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
                    {med.name} {med.dose && <span style={{ fontWeight: 400, color: "#475569" }}>- {med.dose}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {med.frequency || "As directed"} {med.times?.length ? `- Times: ${med.times.join(", ")}` : ""}
                  </div>
                </div>
                <button
                  className="pt-btn pt-btn--sm pt-btn--outline"
                  onClick={() => handleDoseReport(med.id, med.name)}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                >
                  Confirm Taken
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send Love & Encouragement Care Message */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>💌 Send Love & Encouragement to {data.patient_name || "Patient"}</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px" }}>
          Your message will appear prominently on their RecoverRight mobile home screen banner to boost their spirits!
        </p>

        {/* Quick presets */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { label: "❤️ Proud of you! Keep going!", emoji: "❤️", text: "Proud of you! Keep resting and taking your medicines. Love you!" },
            { label: "💪 You're doing great!", emoji: "💪", text: "You're getting stronger every day! Keep it up!" },
            { label: "🌸 जल्दी ठीक हो जाओ", emoji: "🌸", text: "हम सब आपके साथ हैं, आराम करो और जल्दी ठीक हो जाओ!" },
            { label: "🥣 Did you eat soup?", emoji: "🥣", text: "Have some warm soup or water and rest well today!" },
          ].map((preset, idx) => (
            <button
              key={idx}
              className="pt-btn pt-btn--sm pt-btn--outline"
              onClick={() => handleSendCareMessage(preset.text, preset.emoji)}
              disabled={sendingMsg}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom message input */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={careMsgText}
            onChange={(e) => setCareMsgText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendCareMessage(careMsgText, "❤️");
            }}
            placeholder={`Write a personal message to ${data.patient_name || "the patient"}...`}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button
            className="pt-btn pt-btn--sm"
            onClick={() => handleSendCareMessage(careMsgText, "❤️")}
            disabled={sendingMsg || !careMsgText.trim()}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {sendingMsg ? "Sending..." : "Send Message"}
          </button>
        </div>
      </div>

      {/* Family Notifications History & Testing */}
      <div className="pt-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Recent Family Notifications</h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="pt-btn pt-btn--sm pt-btn--outline" onClick={() => handleTestNotify("emergency")}>
              Test Emergency SMS
            </button>
            <button className="pt-btn pt-btn--sm pt-btn--outline" onClick={() => handleTestNotify("milestone")}>
              Test Milestone
            </button>
          </div>
        </div>

        {notifs.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>No notifications dispatched yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifs.map((n: CaregiverNotification) => (
              <div
                key={n.notification_id}
                style={{
                  padding: "8px 12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: n.notification_type === "emergency" ? "#dc2626" : "#0f766e" }}>
                    [{(n.notification_type || "alert").toUpperCase()}] via {(n.channel || "sms").toUpperCase()}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>
                    {n.sent_at ? new Date(n.sent_at).toLocaleTimeString() : ""}
                  </span>
                </div>
                <div style={{ color: "#334155" }}>{n.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}