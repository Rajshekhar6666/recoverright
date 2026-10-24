"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PatientCallModal from "@/components/patient/PatientCallModal";
import { Icon } from "@/components/staff/icons";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { WebRTCClient } from "@/lib/webrtcClient";
import type { CallStatus, PatientPlanResponse } from "@/lib/types";

function PatientCallView({ token }: { token: string }) {
  const { t, lang } = useLanguage();

  const [plan, setPlan] = useState<PatientPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Calling state
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [callerName, setCallerName] = useState("Hospital Care Team");
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallPeerMuted, setIsCallPeerMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [staffOnline, setStaffOnline] = useState(false);
  const callClientRef = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    let alive = true;
    api.getPatientPlan(token)
      .then((res) => {
        if (alive) {
          setPlan(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (alive) {
          setLoadError(err?.message || "Could not load patient plan");
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    const runId = plan?.run_id || token;
    const patientName = plan?.patient_name || "Patient";
    const clientId = `patient_callpage_${token}_${Math.random().toString(36).slice(2, 7)}`;

    const client = new WebRTCClient({
      clientId,
      role: "patient",
      runId,
      displayName: patientName,
      onStatusChange: (status, err) => {
        setCallStatus(status);
        if (err) setCallError(err);
      },
      onIncomingCall: (incoming) => {
        setCallerName(incoming.caller_name || "Hospital Care Team");
        setCallStatus("ringing");
      },
      onPeerStatus: (peer) => {
        if (peer.role === "staff") {
          setStaffOnline(peer.status === "online");
        }
      },
      onPeerMuteChange: (muted) => setIsCallPeerMuted(muted),
      onDurationTick: (sec) => setCallDuration(sec),
    });

    callClientRef.current = client;

    return () => {
      client.destroy();
      callClientRef.current = null;
    };
  }, [plan?.run_id, plan?.patient_name, token]);

  const handleAcceptCall = async () => {
    await callClientRef.current?.answerCall();
  };

  const handleRejectCall = () => {
    callClientRef.current?.rejectCall("patient_declined");
  };

  const handleToggleCallMute = () => {
    const muted = callClientRef.current?.toggleMute() ?? false;
    setIsCallMuted(muted);
  };

  const handleEndCall = () => {
    callClientRef.current?.endCall("patient_hangup");
  };

  const handleDismissCall = () => {
    setCallStatus("idle");
    setCallError(null);
  };

  const handleCallStaff = async () => {
    setCallerName(lang === "hi" ? "अस्पताल केयर टीम को कॉल किया जा रहा है…" : "Calling Hospital Care Team…");
    setCallError(null);
    setCallDuration(0);
    setIsCallMuted(false);
    setIsCallPeerMuted(false);
    await callClientRef.current?.initiateCall("staff");
  };

  const patientDisplayName = plan?.patient_name || (token === "demo" ? "Priya Sharma" : "Patient");

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ maxWidth: 640, margin: "0 auto 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", display: "grid", placeItems: "center" }}>
            <Icon.phone size={20} />
          </div>
          <div>
            <b style={{ fontSize: 16, color: "#0f172a", display: "block" }}>RecoverRight Telehealth</b>
            <small style={{ color: "#64748b" }}>{lang === "hi" ? "मरीज़ ऑडियो कॉलिंग पोर्टल" : "Patient Audio Calling Endpoint"}</small>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", background: "#ffffff", borderRadius: 20, padding: 32, boxShadow: "0 10px 25px -5px rgba(15,23,42,0.08)", border: "1px solid #e2e8f0" }}>
        {/* Patient Identity Banner */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 20, borderBottom: "1px solid #f1f5f9", marginBottom: 24 }}>
          <div>
            <small style={{ fontSize: 11, fontWeight: 700, color: "#0d9488", textTransform: "uppercase", letterSpacing: ".05em" }}>
              {lang === "hi" ? "सत्यापित मरीज़ प्रोफ़ाइल" : "Verified Patient Profile"}
            </small>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "4px 0 2px" }}>
              {patientDisplayName}
            </h1>
            <span style={{ fontSize: 13, color: "#64748b" }}>Token: {token}</span>
          </div>

          <div style={{ textAlign: "right" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 600,
              background: staffOnline ? "#ecfdf5" : "#f1f5f9",
              color: staffOnline ? "#047857" : "#64748b",
              border: staffOnline ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
            }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: staffOnline ? "#10b981" : "#94a3b8" }} />
              {staffOnline ? (lang === "hi" ? "केयर टीम ऑनलाइन" : "Care Team Online") : (lang === "hi" ? "केयर टीम ऑफ़लाइन" : "Care Team Offline")}
            </span>
          </div>
        </div>

        {/* Live Call Control Card */}
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 24, border: "1px solid #e2e8f0", textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: "#0d9488", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 16px", boxShadow: "0 8px 16px rgba(13,148,136,0.3)" }}>
            <Icon.phone size={28} />
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
            {lang === "hi" ? "अस्पताल केयर टीम से सीधे बात करें" : "Speak with Your Care Team in Real Time"}
          </h2>
          <p style={{ fontSize: 13.5, color: "#475569", maxWidth: 440, margin: "0 auto 20px" }}>
            {lang === "hi"
              ? "जब अस्पताल की नर्स या डॉक्टर कॉल करेंगे, तो आपको यहाँ घंटी सुनाई देगी और आप सीधे बात कर सकेंगे।"
              : "When hospital nurses or staff call your discharge endpoint, an incoming ring will appear here. Both sides can hear each other in live two-way audio."}
          </p>

          <button
            type="button"
            onClick={handleCallStaff}
            disabled={callStatus === "calling" || callStatus === "connected"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 28px",
              borderRadius: 99,
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(13,148,136,0.35)",
            }}
          >
            <Icon.phone size={18} />
            <span>{t.callCareTeam}</span>
          </button>
        </div>

        {/* Multi-Device Testing Explanatory Box */}
        <div style={{ background: "#eff6ff", borderRadius: 12, padding: 16, border: "1px solid #bfdbfe", fontSize: 13, color: "#1e40af", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Icon.spark size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <b>{lang === "hi" ? "मल्टी-डिवाइस टेस्टिंग गाइड:" : "Multi-Device Testing Guide:"}</b>
            <p style={{ margin: "4px 0 0" }}>
              {lang === "hi"
                ? "स्टाफ डैशबोर्ड को एक ब्राउज़र में खोलें और इस पेज को दूसरे ब्राउज़र या मोबाइल पर खोलें। स्टाफ डैशबोर्ड से 'Call Patient' दबाएँ, यहाँ तुरंत इनकमिंग कॉल प्राप्त होगी!"
                : "Open the Staff Workspace in one browser window and this page in another window or device. Click 'Call Patient' in the Staff Workspace to initiate a live WebRTC audio call!"}
            </p>
          </div>
        </div>
      </main>

      {/* Real-Time Telehealth Calling Modal */}
      <PatientCallModal
        status={callStatus}
        callerName={callerName}
        durationSeconds={callDuration}
        isMuted={isCallMuted}
        isPeerMuted={isCallPeerMuted}
        errorMessage={callError}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onToggleMute={handleToggleCallMute}
        onEndCall={handleEndCall}
        onDismiss={handleDismissCall}
      />
    </div>
  );
}

function TokenReceiver({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <PatientCallView token={token} />;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Connecting to telehealth...</div>}>
      <TokenReceiver params={params} />
    </Suspense>
  );
}
