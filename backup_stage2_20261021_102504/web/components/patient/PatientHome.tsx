"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { API } from "@/lib/api";
import { toMinutes, type InstructionKey, type PlanView } from "@/lib/patient";
import { dialable, sendHelpRequest, type HelpSource, type HelpStatus } from "@/lib/voice/help";
import type { Detection, Severity } from "@/lib/voice/phrases";
import { cancelSpeech, playAlarm, speak } from "@/lib/voice/speak";
import HelpAlert from "./HelpAlert";
import { useSafetyMic, type VoiceState } from "./useSafetyMic";

interface AlertState {
  id: number; heard: string; label: string; severity: Severity; source: HelpSource; openedAt: number;
  status: HelpStatus; confirmClose: boolean; soundBlocked: boolean;
}
interface Toast { id: number; text: string; tone: "ok" | "info" | "warn" }

const HELP_PATH = process.env.NEXT_PUBLIC_HELP_PATH || "/help";
const EMERGENCY_NUMBER = process.env.NEXT_PUBLIC_EMERGENCY_NUMBER || "";
const RETRY_DELAYS = [0, 2500, 6000]; // automatic attempts while the emergency screen is open
const TEST_PHRASES = ["I feel unwell", "I need help", "chest pain", "I feel dizzy", "I can't breathe"];
const todayKey = (token: string) => `rr-pt:${token}:${new Date().toISOString().slice(0, 10)}`;

const MIC_COPY: Record<VoiceState, { tone: "ok" | "wait" | "bad" | "off"; title: string }> = {
  idle: { tone: "wait", title: "Getting ready" },
  starting: { tone: "wait", title: "Opening the microphone…" },
  listening: { tone: "ok", title: "Listening" },
  reconnecting: { tone: "wait", title: "Reconnecting…" },
  "needs-tap": { tone: "off", title: "One tap needed" },
  blocked: { tone: "bad", title: "Microphone blocked" },
  "no-mic": { tone: "bad", title: "No microphone found" },
  insecure: { tone: "bad", title: "Needs a secure page" },
  unsupported: { tone: "bad", title: "Voice not supported" },
  error: { tone: "bad", title: "Listening stopped" },
  off: { tone: "off", title: "Voice safety is off" },
};

const SECTIONS: { key: InstructionKey; title: string; icon: keyof typeof Icon; tone: string }[] = [
  { key: "wound_care", title: "Wound care", icon: "shield", tone: "teal" },
  { key: "activity", title: "Activity and movement", icon: "walk", tone: "green" },
  { key: "diet", title: "Diet and hydration", icon: "heart", tone: "amber" },
  { key: "warning_signs", title: "Warning signs", icon: "alert", tone: "red" },
];

const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const phoneOf = (s: string) => (/\+?\d[\d\s()-]{6,}/.exec(s)?.[0] ?? "").replace(/[^\d+]/g, "");

export default function PatientHome({ plan, token = "demo" }: { plan: PlanView; token?: string }) {
  const first = plan.patientName.split(/\s+/)[0] || "there";
  const [greet, setGreet] = useState("Hello");
  const [today, setToday] = useState("");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [doneTasks, setDoneTasks] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<InstructionKey | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [testText, setTestText] = useState("");
  const [localSaved, setLocalSaved] = useState(false);
  const alertRef = useRef<AlertState | null>(null);
  const simSource = useRef(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const d = new Date();
    setGreet(d.getHours() < 12 ? "Good morning" : d.getHours() < 18 ? "Good afternoon" : "Good evening");
    setToday(d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    setNow(minutesNow());
    const id = setInterval(() => setNow(minutesNow()), 60000);
    return () => clearInterval(id);
  }, []);

  const doses = useMemo(
    () => plan.meds.flatMap((m) => m.times.map((t) => ({ key: `${m.id}@${t}`, med: m, time: t, at: toMinutes(t) }))).sort((a, b) => a.at - b.at),
    [plan.meds],
  );
  const nextDose = doses.find((d) => !taken.has(d.key) && d.at >= now) ?? doses.find((d) => !taken.has(d.key));
  const phone = plan.contacts.map((c) => phoneOf(c.value)).find((p) => p && dialable(p)) || plan.contacts.map((c) => phoneOf(c.value)).find(Boolean) || phoneOf(plan.phone);
  const canCall = dialable(phone);
  const firstFollow = plan.followUps[0];
  const missingDate = !firstFollow?.when;

  const tasks = [
    { id: "care", icon: "shield" as const, title: "Morning care", sub: plan.instructions.wound_care[0] ?? "Check your dressing is clean and dry" },
    { id: "med", icon: "pill" as const, title: "Take your medicine", sub: nextDose ? `Next: ${nextDose.med.name} at ${nextDose.time}` : plan.meds.length ? "Take as written on your plan" : "No medicines on your plan" },
    { id: "move", icon: "walk" as const, title: "Recovery exercises", sub: plan.instructions.activity[0] ?? "Move as your care team advised" },
    ...(plan.followUps.length ? [{ id: "fu", icon: "calendar" as const, title: "Follow-up appointment", sub: missingDate ? "Date not provided: call your care team" : `${firstFollow.when}` }] : []),
  ];
  const done = tasks.filter((t) => doneTasks.has(t.id)).length;
  const pct = Math.round((done / tasks.length) * 100);
  const toggle = (id: string) => setDoneTasks((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const showToast = useCallback((text: string, tone: Toast["tone"] = "ok") => setToast({ id: Date.now(), text, tone }), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5200); return () => clearTimeout(t); }, [toast]);

  // ---- tasks and doses: saved on THIS DEVICE only (the backend has no endpoint for them), per day, and labelled as such.
  const storeKey = useMemo(() => todayKey(token), [token]);
  // Hydration flag is STATE, not a ref: saving must wait for the render in which the loaded values are applied.
  // (A ref flipped inside the load effect let the save effect overwrite stored ticks with the empty initial state.)
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) { const j = JSON.parse(raw) as { taken?: string[]; tasks?: string[] }; setTaken(new Set(j.taken ?? [])); setDoneTasks(new Set(j.tasks ?? [])); setLocalSaved(true); }
    } catch { /* storage blocked or corrupt: start fresh */ }
    setHydrated(true);
  }, [storeKey]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storeKey, JSON.stringify({ taken: [...taken], tasks: [...doneTasks] })); setLocalSaved(true); } catch { /* storage blocked */ }
  }, [hydrated, taken, doneTasks, storeKey]);

  const mic = useSafetyMic({
    onDistress: (d, heard, info) => triggerAlertRef.current(d, heard, simSource.current ? "test" : "voice", info.escalation),
    onTook: () => markNextRef.current(true),
  });

  /** Speak without the microphone hearing the app's own voice. */
  const say = useCallback(async (text: string) => {
    mic.speakStart(text);
    try { return await speak(text); } finally { mic.speakEnd(); }
  }, [mic]);

  const markDose = (key: string, via: "voice" | "tap") => {
    const dose = doses.find((d) => d.key === key);
    if (!dose) return;
    const wasTaken = taken.has(key);
    setTaken((s) => { const n = new Set(s); if (wasTaken) n.delete(key); else n.add(key); return n; });
    if (!wasTaken) setDoneTasks((s) => new Set(s).add("med"));
    const msg = wasTaken ? `Unmarked ${dose.med.name} (${dose.time}).` : `Marked ${dose.med.name} (${dose.time}) as taken.`;
    showToast(msg, wasTaken ? "info" : "ok");
    if (via === "voice" && !wasTaken) void say(`Okay, I marked ${dose.med.name} as taken.`);
  };
  const markNext = (viaVoice: boolean) => {
    if (!nextDose) { showToast("No dose is waiting right now.", "info"); if (viaVoice) void say("There is no dose waiting right now."); return; }
    markDose(nextDose.key, viaVoice ? "voice" : "tap");
  };
  const markNextRef = useRef(markNext);
  markNextRef.current = markNext;

  // ---- emergency flow
  const patch = useCallback((id: number, p: Partial<AlertState>) => {
    const cur = alertRef.current;
    if (!cur || cur.id !== id) return;
    const next = { ...cur, ...p };
    alertRef.current = next;
    setAlert(next);
  }, []);

  const deliver = useCallback(async (a: AlertState, attempts: number[]) => {
    for (let i = 0; i < attempts.length; i++) {
      if (attempts[i]) await new Promise((r) => setTimeout(r, attempts[i]));
      if (alertRef.current?.id !== a.id) return; // closed meanwhile
      patch(a.id, { status: { kind: "sending", attempt: i + 1 } });
      const res = await sendHelpRequest(
        { token, patient_name: plan.patientName, heard: a.heard, severity: a.severity, label: a.label, source: a.source, demo: plan.demo, client_time: new Date().toISOString() },
        { base: API, path: HELP_PATH, isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false) },
      );
      if (alertRef.current?.id !== a.id) return;
      if (res.ok) { patch(a.id, { status: { kind: "sent", at: res.at } }); void say("Your care team has been alerted. Stay where you are."); return; }
      if (i === attempts.length - 1) {
        patch(a.id, { status: { kind: "failed", reason: res.reason, attempts: attempts.length } });
        void say("I could not reach your care team. Please call them now with the red button.");
      }
    }
  }, [token, plan.patientName, plan.demo, patch, say]);

  const triggerAlert = (d: Detection, heard: string, source: HelpSource, escalation: boolean) => {
    const cur = alertRef.current;
    if (cur) { // an emergency screen is already open: only upgrade it, never stack or re-send
      if (escalation && d.severity === "critical" && cur.severity !== "critical") {
        patch(cur.id, { severity: "critical", label: d.label, heard });
        void playAlarm("critical");
        void say("This sounds serious. Please call now.");
      }
      return;
    }
    const a: AlertState = { id: Date.now(), heard, label: d.label, severity: d.severity, source, openedAt: Date.now(), status: { kind: "sending", attempt: 1 }, confirmClose: false, soundBlocked: false };
    alertRef.current = a;
    setAlert(a);
    void playAlarm(d.severity).then((ok) => { if (!ok) patch(a.id, { soundBlocked: true }); });
    void say(`I heard you. It sounds like you may be ${d.label}. I am trying to alert your care team. If this is an emergency, call now.`);
    void deliver(a, RETRY_DELAYS);
  };
  const triggerAlertRef = useRef(triggerAlert);
  triggerAlertRef.current = triggerAlert;

  const retryAlert = () => { const a = alertRef.current; if (a) { patch(a.id, { confirmClose: false }); void deliver(a, [0]); } };
  const closeAlert = () => {
    const a = alertRef.current;
    if (!a) return;
    if (a.status.kind !== "sent" && !a.confirmClose) { patch(a.id, { confirmClose: true }); return; } // never let a failed alert vanish silently
    cancelSpeech();
    alertRef.current = null;
    setAlert(null);
    mic.rearm(); // listen for a new emergency straight away
    showToast(a.status.kind === "sent" ? "Alert closed. Your care team had been alerted." : "Alert closed. Your care team was NOT notified.", a.status.kind === "sent" ? "ok" : "warn");
  };
  const manualHelp = () => {
    simSource.current = false;
    triggerAlert({ severity: "concern", kind: "help", label: "needing help", phrase: "button" }, "I pressed the help button", "button", false);
  };
  const runTest = (text: string) => {
    if (!text.trim()) return;
    simSource.current = true;
    try { mic.simulate(text); } finally { simSource.current = false; }
    setTestText("");
  };

  return (
    <div className="pt">
      {alert && <HelpAlert heard={alert.heard} label={alert.label} severity={alert.severity} source={alert.source} phone={phone} phoneDialable={canCall} demo={plan.demo}
        status={alert.status} openedAt={alert.openedAt} confirmClose={alert.confirmClose} soundBlocked={alert.soundBlocked} emergencyNumber={EMERGENCY_NUMBER || undefined}
        onRetry={retryAlert} onClose={closeAlert} />}
      {toast && <div className={`pt-toast is-${toast.tone}`} role="status" aria-live="polite" key={toast.id}>{toast.text}</div>}
      <aside className="pt-side">
        <div className="pt-brand"><span><Icon.heart size={22} /></span><div><b>RecoverRight</b><small>Your recovery companion</small></div></div>
        <nav>
          <a href="#home" className="is-on"><Icon.home size={18} />Home</a>
          <a href="#plan"><Icon.list size={18} />My plan</a>
          <a href="#medications"><Icon.pill size={18} />Medications</a>
          <a href="#instructions"><Icon.book size={18} />Instructions</a>
          <a href="#appointments"><Icon.calendar size={18} />Appointments</a>
          <a href="#help"><Icon.chat size={18} />Help</a>
        </nav>
        <p className="pt-safe"><Icon.lock size={14} /> Your plan was checked and approved by your care team.</p>
      </aside>

      <main className="pt-main" id="home">
        {plan.demo && <p className="pt-demo">Demo data. Open a real plan with its approved link.</p>}
        <header className="pt-top"><span className="pt-date"><Icon.calendar size={16} />{today}</span><a href="#voice" className={`pt-micpill is-${MIC_COPY[mic.state].tone}`} aria-label={`Voice safety: ${MIC_COPY[mic.state].title}`}><Icon.mic size={14} /> {MIC_COPY[mic.state].title}</a><span className="pt-avatar">{first[0]?.toUpperCase()}</span></header>

        <div className="pt-grid">
          <section className="pt-col">
            <div className="pt-hero">
              <h1>{greet}, {first}!</h1>
              <p>Your recovery plan</p>
              <small>Small steps every day lead to big progress.</small>
            </div>

            <div className="pt-card pt-progress" id="plan">
              <div>
                <h2>Today’s progress</h2>
                <p>{done} of {tasks.length} tasks completed</p>
                <div className="pt-bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
              <div className="pt-ring" style={{ background: `conic-gradient(var(--pt) ${pct * 3.6}deg, #d8ece9 0)` }}><span>{pct}%</span></div>
            </div>

            <div className="pt-card">
              <div className="pt-head"><h2>Your tasks</h2></div>
              <ul className="pt-tasks">
                {tasks.map((t) => {
                  const I = Icon[t.icon];
                  const isDone = doneTasks.has(t.id);
                  const warn = t.id === "fu" && missingDate;
                  return (
                    <li key={t.id} className={isDone ? "is-done" : ""}>
                      <span className={`pt-ic pt-ic--${isDone ? "green" : warn ? "amber" : "teal"}`}>{isDone ? <Icon.check size={22} /> : <I size={22} />}</span>
                      <div><b>{t.title}</b><small>{t.sub}</small></div>
                      <button className={`pt-chip${isDone ? " is-ok" : warn ? " is-warn" : ""}`} onClick={() => toggle(t.id)} aria-pressed={isDone}>
                        {isDone ? "Done" : warn ? "Needs attention" : "Mark done"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pt-two">
              <div className="pt-card" id="medications">
                <div className="pt-head"><h2>My medications</h2></div>
                {plan.meds.length > 0 && <small className="pt-local">{localSaved ? "Ticks are saved on this device only. They are not sent to your care team." : "Tap a time when you take a dose. Ticks stay on this device only."}</small>}
                {plan.meds.length === 0 ? <small>No medicines were found on your plan.</small> : (
                  <ul className="pt-meds">
                    {plan.meds.map((m) => {
                      const nd = nextDose?.med.id === m.id ? nextDose : undefined;
                      return (
                        <li key={m.id}>
                          <span className="pt-ic pt-ic--green"><Icon.pill size={20} /></span>
                          <div>
                            <b>{m.name}{m.dose ? ` ${m.dose}` : ""}</b>
                            <small>{m.times.length ? m.times.join(", ") : m.frequency ?? "Take as directed"}{m.duration ? ` · ${m.duration}` : ""}</small>
                          </div>
                          {nd && <span className="pt-chip is-ok">Next: {nd.time}</span>}
                          {m.times.length > 0 && (
                            <div className="pt-doses" role="group" aria-label={`${m.name} doses today`}>
                              {m.times.map((t) => {
                                const k = `${m.id}@${t}`; const on = taken.has(k);
                                return <button key={k} className={`pt-dose${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => markDose(k, "tap")}>{on ? <Icon.check size={14} /> : <Icon.clock size={14} />} {t}</button>;
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="pt-card" id="appointments">
                <div className="pt-head"><h2>Upcoming appointments</h2></div>
                {plan.followUps.length === 0 ? <small>No follow-up appointments on your plan.</small> : plan.followUps.map((f) => (
                  <div key={f.id} className="pt-appt">
                    <span className="pt-ic pt-ic--purple"><Icon.calendar size={20} /></span>
                    <div><b>{f.what}</b><small>{f.when ?? "Date not provided"}{f.where ? ` · ${f.where}` : ""}</small></div>
                  </div>
                ))}
                {(missingDate || plan.followUps.length > 0) && canCall && (
                  <div className="pt-note"><b>{missingDate ? "Ask for your appointment date" : "Need to change or reschedule?"}</b><a className="pt-btn pt-btn--line" href={`tel:${phone}`}><Icon.phone size={15} /> Call now</a></div>
                )}
              </div>
            </div>

            <div className="pt-card" id="instructions">
              <div className="pt-head"><h2>Important care instructions</h2></div>
              <div className="pt-instr">
                {SECTIONS.map((s) => {
                  const list = plan.instructions[s.key];
                  const I = Icon[s.icon];
                  return (
                    <button key={s.key} className={`pt-i pt-i--${s.tone}${open === s.key ? " is-open" : ""}`} onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key} disabled={list.length === 0}>
                      <span className={`pt-ic pt-ic--${s.tone}`}><I size={20} /></span>
                      <span><b>{s.title}</b><small>{list.length ? list[0] : "Nothing listed"}</small></span>
                    </button>
                  );
                })}
              </div>
              {open && <ul className="pt-full">{plan.instructions[open].map((t, i) => <li key={i}>{t}</li>)}</ul>}
            </div>
          </section>

          <aside className="pt-col">
            <div className="pt-card pt-voice" id="voice">
              <div className={`pt-orb${mic.state === "listening" ? " is-on" : ""}${MIC_COPY[mic.state].tone === "bad" ? " is-bad" : ""}`}><Icon.mic size={26} /></div>
              <h2>Voice safety</h2>
              <p className={`pt-mic-state is-${MIC_COPY[mic.state].tone}`} role="status" aria-live="polite"><i /> {MIC_COPY[mic.state].title}</p>
              {mic.state === "listening" && <p className="pt-mic-on">If you feel unwell, just say “help” or “I feel unwell”.</p>}
              {mic.state === "reconnecting" && <small>{mic.detail || "Trying to reconnect. Use the red help button if you need help now."}</small>}
              {(mic.state === "needs-tap" || mic.state === "off" || mic.state === "idle") && <><p>{mic.state === "off" ? "Voice safety is off." : "Tap once so I can listen for you. After that it stays on while this page is open."}</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Turn on voice safety</button></>}
              {mic.state === "blocked" && <><p>The browser is blocking the microphone. Tap the lock icon next to the address, allow the microphone, then try again.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Try again</button></>}
              {mic.state === "no-mic" && <><p>No microphone was found. Connect one, then try again.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Try again</button></>}
              {mic.state === "error" && <><p>{mic.detail}</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Try again</button></>}
              {mic.state === "insecure" && <p>Browsers only allow the microphone on https:// pages or on localhost. Open this page that way. The help button below always works.</p>}
              {mic.state === "unsupported" && <p>This browser cannot listen for voice. Use Chrome or Edge, or the red help button below.</p>}
              {mic.heard && mic.state === "listening" && <p className="pt-heard" aria-live="off">I heard: <em>“{mic.heard.text}”</em></p>}
              <div className="pt-try"><small>You can say</small><p>“I feel unwell”</p><p>“Help”</p><p>“I took my medicine”</p></div>
              {mic.state === "listening" && <button className="pt-link" onClick={mic.disable}>Turn off listening</button>}
              <details className="pt-test">
                <summary>Test without a microphone</summary>
                <div className="pt-test-row">
                  <input value={testText} onChange={(e) => setTestText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runTest(testText); }} placeholder="Type what you would say" aria-label="Test phrase" />
                  <button className="pt-btn pt-btn--solid" onClick={() => runTest(testText)}>Test</button>
                </div>
                <div className="pt-test-chips">{TEST_PHRASES.map((t) => <button key={t} className="pt-chip" onClick={() => runTest(t)}>{t}</button>)}<button className="pt-chip" onClick={() => runTest("I took my medicine")}>I took my medicine</button></div>
                <small>Test phrases use the same detection as the microphone and send a real alert marked “test”.</small>
              </details>
              <small>Your browser’s speech service processes what you say. The page must stay open, with the screen on, to listen.</small>
            </div>
            <div className="pt-card pt-helpbox" id="help">
              <div className="pt-head"><h2>Need help?</h2></div>
              <p>Have a question, need assistance, or feeling unwell?</p>
              <button className="pt-btn pt-btn--red" onClick={manualHelp}><Icon.alert size={17} /> I need help now</button>
              {phone && canCall ? (
                <>
                  <a className="pt-btn pt-btn--red" href={`tel:${phone}`}><Icon.phone size={17} /> Contact care team</a>
                  <a className="pt-btn pt-btn--line" href={`sms:${phone}`}><Icon.chat size={17} /> Send a message</a>
                </>
              ) : <small>{plan.demo ? "Demo plan: no real phone number." : "No phone number is on this plan. Ask your care team for one."}</small>}
              <small>In an emergency, call your local emergency number.</small>
            </div>
            {plan.contacts.length > 0 && (
              <div className="pt-card">
                <div className="pt-head"><h2>Your care team</h2></div>
                {plan.contacts.map((c, i) => <div key={i} className="pt-appt"><span className="pt-ic pt-ic--teal"><Icon.user size={20} /></span><div><b>{c.label}</b><small>{c.value}</small></div></div>)}
              </div>
            )}
          </aside>
        </div>
      </main>

      <nav className="pt-bottom" aria-label="Quick links">
        <a href="#home"><Icon.home size={20} />Home</a><a href="#plan"><Icon.list size={20} />My plan</a>
        <a href="#appointments"><Icon.calendar size={20} />Appointments</a><a href="#help"><Icon.chat size={20} />Help</a>
      </nav>
    </div>
  );
}
