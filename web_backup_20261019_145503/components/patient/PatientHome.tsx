"use client";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { toMinutes, type InstructionKey, type PlanView } from "@/lib/patient";
import HelpAlert from "./HelpAlert";
import { useSafetyMic } from "./useSafetyMic";

const SECTIONS: { key: InstructionKey; title: string; icon: keyof typeof Icon; tone: string }[] = [
  { key: "wound_care", title: "Wound care", icon: "shield", tone: "teal" },
  { key: "activity", title: "Activity and movement", icon: "walk", tone: "green" },
  { key: "diet", title: "Diet and hydration", icon: "heart", tone: "amber" },
  { key: "warning_signs", title: "Warning signs", icon: "alert", tone: "red" },
];

const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const phoneOf = (s: string) => (/\+?\d[\d\s()-]{6,}/.exec(s)?.[0] ?? "").replace(/[^\d+]/g, "");

export default function PatientHome({ plan }: { plan: PlanView }) {
  const first = plan.patientName.split(/\s+/)[0] || "there";
  const [greet, setGreet] = useState("Hello");
  const [today, setToday] = useState("");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [doneTasks, setDoneTasks] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<InstructionKey | null>(null);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [voiceMsg, setVoiceMsg] = useState("");
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
  const phone = plan.contacts.map((c) => phoneOf(c.value)).find(Boolean) || phoneOf(plan.phone);
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

  const markNext = () => {
    if (!nextDose) return setVoiceMsg("No dose is waiting right now.");
    setTaken((s) => new Set(s).add(nextDose.key));
    setDoneTasks((s) => new Set(s).add("med"));
    setVoiceMsg(`Marked ${nextDose.med.name} (${nextDose.time}) as taken.`);
  };

  const mic = useSafetyMic(
    (heard) => setAlertText(heard),
    () => markNext(),
  );

  return (
    <div className="pt">
      {alertText !== null && <HelpAlert heard={alertText} phone={phone} onClose={() => setAlertText(null)} />}
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
        <header className="pt-top"><span className="pt-date"><Icon.calendar size={16} />{today}</span><span className="pt-avatar">{first[0]?.toUpperCase()}</span></header>

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
                {(missingDate || plan.followUps.length > 0) && phone && (
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
            <div className="pt-card pt-voice">
              <div className={`pt-orb${mic.state === "on" ? " is-on" : ""}`}><Icon.mic size={26} /></div>
              <h2>Voice safety</h2>
              {mic.state === "on" && <p className="pt-mic-on">Listening. If you feel unwell, just say “help” or “I feel unwell”.</p>}
              {mic.state === "starting" && <p>Starting the microphone…</p>}
              {mic.state === "blocked" && <><p>The microphone is off. Tap once so I can listen for you.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Turn on voice safety</button></>}
              {mic.state === "off" && <><p>Voice safety is off.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Turn on</button></>}
              {mic.state === "unsupported" && <p>This browser cannot listen for voice. Use Chrome or Edge, or the Help button below.</p>}
              <div className="pt-try"><small>You can say</small><p>“I feel unwell”</p><p>“Help”</p><p>“I took my medicine”</p></div>
              {voiceMsg && <p className="pt-voicemsg" role="status">{voiceMsg}</p>}
              {mic.state === "on" && <button className="pt-link" onClick={mic.disable}>Turn off listening</button>}
              <small>Your browser’s speech service processes what you say. The page must stay open, and the screen on, to listen.</small>
            </div>
            <div className="pt-card pt-helpbox" id="help">
              <div className="pt-head"><h2>Need help?</h2></div>
              <p>Have a question, need assistance, or feeling unwell?</p>
              {phone ? (
                <>
                  <a className="pt-btn pt-btn--red" href={`tel:${phone}`}><Icon.phone size={17} /> Contact care team</a>
                  <a className="pt-btn pt-btn--line" href={`sms:${phone}`}><Icon.chat size={17} /> Send a message</a>
                </>
              ) : <small>No phone number is on this plan. Ask your care team for one.</small>}
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
