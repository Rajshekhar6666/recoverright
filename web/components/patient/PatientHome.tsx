"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { nurseName } from "@/lib/helpJourney";
import { CARE_TEAM_PHONE, DISTRESS_COOLDOWN_MS, realPhone } from "@/lib/patientConfig";
import { toMinutes, type InstructionKey, type PlanView } from "@/lib/patient";
import { detectDistress, isEcho, parseIntent, parseTaskCommands, type Severity, type TaskRef } from "@/lib/voice";
import HelpJourney from "./HelpJourney";
import { useHelpJourney } from "./useHelpJourney";
import { useMicLevel } from "./useMicLevel";
import { useSafetyMic, type VoiceLang } from "./useSafetyMic";

const SECTIONS: { key: InstructionKey; title: string; icon: keyof typeof Icon; tone: string }[] = [
  { key: "wound_care", title: "Wound care", icon: "shield", tone: "teal" },
  { key: "activity", title: "Activity and movement", icon: "walk", tone: "green" },
  { key: "diet", title: "Diet and hydration", icon: "heart", tone: "amber" },
  { key: "warning_signs", title: "Warning signs", icon: "alert", tone: "red" },
];
type Line = { who: "you" | "bot"; text: string };
type Task = TaskRef & { icon: keyof typeof Icon; title: string; sub: string };
const BARS = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.55, 0.85, 0.5];
const realMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const first2 = (l: string[]) => l.slice(0, 2).join(" ");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function PatientHome({ plan, token }: { plan: PlanView; token: string }) {
  const first = plan.patientName.split(/\s+/)[0] || "there";
  const store = `rr-pt-${token}`;
  const [greet, setGreet] = useState("Hello");
  const [today, setToday] = useState("");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [doneTasks, setDoneTasks] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<InstructionKey | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [live, setLive] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [high, setHigh] = useState(true);
  const [lang, setLang] = useState<VoiceLang>("en-IN");
  const [clockMin, setClockMin] = useState(0);
  const [offset, setOffset] = useState(0);
  const [reminder, setReminder] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [composer, setComposer] = useState<string | null>(null);
  const [tools, setTools] = useState(false);
  const [showTools, setShowTools] = useState(plan.demo);
  const [pop, setPop] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [simNurse, setSimNurse] = useState(false);
  const snooze = useRef<Record<string, number>>({});
  const reminded = useRef<Set<string>>(new Set());
  const lastDistress = useRef(0);
  const lastSpoken = useRef("");
  const speakingUntil = useRef(0);
  const spoken = useRef("");
  const heardRef = useRef<(s: string, f: boolean, a: string[]) => void>(() => undefined);

  const care = realPhone(plan.contacts.map((c) => c.value).find((v) => realPhone(v)) ?? "") || realPhone(CARE_TEAM_PHONE);
  const { journey, start, retry, note, close } = useHelpJourney({ token, patientName: plan.patientName, demo: plan.demo || token === "demo", pretendOffline: offline, simulateNurse: simNurse });

  // ---- clock, saved state, settings
  useEffect(() => {
    const d = new Date();
    setGreet(d.getHours() < 12 ? "Good morning" : d.getHours() < 18 ? "Good afternoon" : "Good evening");
    setToday(d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    setClockMin(realMinutes());
    const id = setInterval(() => setClockMin(realMinutes()), 10000);
    try {
      const s = JSON.parse(localStorage.getItem(store) ?? "null") as { taken: string[]; done: string[] } | null;
      if (s) { setTaken(new Set(s.taken)); setDoneTasks(new Set(s.done)); }
      const st = JSON.parse(localStorage.getItem("rr-pt-settings") ?? "null") as { high?: boolean; lang?: VoiceLang; sound?: boolean } | null;
      if (st) { if (typeof st.high === "boolean") setHigh(st.high); if (st.lang) setLang(st.lang); if (typeof st.sound === "boolean") setSoundOn(st.sound); }
    } catch { /* nothing saved */ }
    if (new URLSearchParams(window.location.search).has("demo")) setShowTools(true);
    return () => clearInterval(id);
  }, [store]);
  useEffect(() => { try { localStorage.setItem(store, JSON.stringify({ taken: [...taken], done: [...doneTasks] })); } catch { /* ignore */ } }, [taken, doneTasks, store]);
  useEffect(() => { try { localStorage.setItem("rr-pt-settings", JSON.stringify({ high, lang, sound: soundOn })); } catch { /* ignore */ } }, [high, lang, soundOn]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!pop) return; const id = setTimeout(() => setPop(null), 900); return () => clearTimeout(id); }, [pop]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(id); }, [flash]);

  const nowMin = (clockMin + offset) % 1440;
  const doses = useMemo(() => plan.meds.flatMap((m) => m.times.map((t) => ({ key: `${m.id}@${t}`, med: m, time: t, at: toMinutes(t) }))).sort((a, b) => a.at - b.at), [plan.meds]);
  const pending = doses.filter((d) => !taken.has(d.key));
  const nextDose = pending.find((d) => d.at >= nowMin) ?? pending[0];
  const firstFollow = plan.followUps[0];
  const missingDate = !firstFollow?.when;
  const medDone = doses.length > 0 && taken.size > 0 && doses.every((d) => d.at > nowMin + 30 || taken.has(d.key));

  // ---- the to-do list (numbered, so it can be confirmed by voice)
  const tasks: Task[] = useMemo(() => {
    const names = plan.meds.map((m) => esc(m.name.toLowerCase())).filter(Boolean).join("|");
    const list: Omit<Task, "n">[] = [
      { id: "care", icon: "shield", title: "Wound care", sub: plan.instructions.wound_care[0] ?? "Check your dressing is clean and dry", kw: /\b(wound|dressing|bandage|stitch|clean|wash)/ },
      { id: "med", icon: "pill", title: "Take your medicine", sub: nextDose ? `Next: ${nextDose.med.name} at ${nextDose.time}` : plan.meds.length ? "All doses taken" : "No medicines on your plan", kw: new RegExp(`\\b(medicine|medication|tablet|pill|dose|capsule${names ? `|${names}` : ""})`) },
      { id: "move", icon: "walk", title: "Recovery exercises", sub: plan.instructions.activity[0] ?? "Move as your care team advised", kw: /\b(exercise|walk|physio|stretch|moved)/ },
      ...(plan.followUps.length ? [{ id: "fu", icon: "calendar" as const, title: "Follow-up appointment", sub: missingDate ? "Date not provided: call your care team" : `${firstFollow.when}`, kw: /\b(appointment|follow ?up|clinic)/ }] : []),
      ...(plan.instructions.diet.length ? [{ id: "drink", icon: "heart" as const, title: "Drink fluids", sub: plan.instructions.diet[0], kw: /\b(water|drink|drank|fluid|hydrat)/ }] : []),
    ];
    return list.map((t, i) => ({ ...t, n: i + 1 }));
  }, [plan, nextDose, missingDate, firstFollow]);
  const isDone = (id: string) => (id === "med" ? medDone || doneTasks.has("med") : doneTasks.has(id));
  const doneCount = tasks.filter((t) => isDone(t.id)).length;
  const pct = Math.round((doneCount / tasks.length) * 100);
  const R = 28, CIRC = 2 * Math.PI * R;

  // ---- spoken replies
  const say = (text: string) => {
    setLog((l) => [...l.slice(-5), { who: "bot", text }]);
    lastSpoken.current = text;
    speakingUntil.current = Date.now() + text.length * 75 + 1500;
    if (!soundOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.lang = "en-IN";
    const v = window.speechSynthesis.getVoices().find((x) => /en[-_](IN|GB)/i.test(x.lang));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  const markSlot = (): { time: string; names: string[] } | null => {
    const p = doses.filter((d) => !taken.has(d.key));
    if (!p.length) return null;
    const at = (p.find((d) => d.at <= nowMin + 30) ?? p[0]).at;
    const slot = p.filter((d) => d.at === at);
    setTaken((s) => { const n = new Set(s); slot.forEach((d) => n.add(d.key)); return n; });
    setPop(slot[0].key);
    return { time: slot[0].time, names: slot.map((d) => d.med.name) };
  };
  const unmarkLast = () => {
    const t = [...doses].reverse().find((d) => taken.has(d.key));
    if (t) setTaken((s) => { const n = new Set(s); n.delete(t.key); return n; });
    return t;
  };

  const applyTasks = (cmds: { id: string; done: boolean }[], said: string) => {
    const bits: string[] = [];
    let after = new Set(doneTasks);
    for (const c of cmds) {
      const t = tasks.find((x) => x.id === c.id);
      if (!t) continue;
      setFlash(t.id);
      if (t.id === "med") {
        if (c.done) {
          const r = markSlot();
          bits.push(r ? `I marked your ${r.time} medicine as taken: ${r.names.join(" and ")}.` : "All your doses are already marked.");
          setDoneTasks((s) => { const n = new Set(s); n.delete("med"); return n; });
          after.delete("med");
        } else { const u = unmarkLast(); bits.push(u ? `Okay, ${u.med.name} is not marked as taken.` : "No dose was marked."); }
      } else {
        if (c.done) after.add(t.id); else after.delete(t.id);
        bits.push(`Task ${t.n}, ${t.title.toLowerCase()}, ${c.done ? "is done" : "is not done"}.`);
      }
    }
    if (!bits.length) return false;
    setDoneTasks(after);
    setLog((l) => [...l.slice(-5), { who: "you", text: said }]);
    say(bits.join(" "));
    return true;
  };

  // ---- distress: the hospital is alerted at once, with the patient's own words
  const triggerDistress = (said: string, severity: Severity) => {
    if (Date.now() - lastDistress.current < DISTRESS_COOLDOWN_MS) return;
    if (!start(said, severity, said === "button" ? "button" : "voice")) return;
    lastDistress.current = Date.now();
    setLog((l) => [...l.slice(-5), { who: "you", text: said === "button" ? "(help button)" : said }]);
    say(severity === "critical" ? "I have alerted your care team. Please sit down and stay where you are." : "I have told your care team how you feel. Please sit down.");
  };

  // ---- what the patient said
  const handle = (said: string, isFinal: boolean, alts: string[]) => {
    if (Date.now() < speakingUntil.current + 5000 && isEcho(said, lastSpoken.current)) return; // the app hearing itself
    setLive(isFinal ? "" : said);
    const d = detectDistress([said, ...alts], { high });
    if (d) return triggerDistress(said, d.severity);
    if (!isFinal) return;
    const cmds = parseTaskCommands(said, tasks);
    if (cmds.length && applyTasks(cmds, said)) { setReminder(null); return; }
    const intent = parseIntent(said, { reminderOpen: reminder !== null });
    if (intent === "none") return;
    setLog((l) => [...l.slice(-5), { who: "you", text: said }]);
    switch (intent) {
      case "yes": { const r = markSlot(); setReminder(null); return say(r ? `Done. I marked your ${r.time} medicine as taken.` : "All your doses are already marked."); }
      case "later": if (reminder) { snooze.current[reminder] = nowMin + 10; reminded.current.delete(reminder); setReminder(null); } return say("Okay. I will remind you again in ten minutes.");
      case "next_dose": return say(nextDose ? `Your next medicine is ${nextDose.med.name}${nextDose.med.dose ? ` ${nextDose.med.dose}` : ""} at ${nextDose.time}.` : "You have no more doses today.");
      case "list_meds": return say(plan.meds.length ? `You have ${plan.meds.length} medicine${plan.meds.length > 1 ? "s" : ""}: ${plan.meds.map((m) => m.name).join(", ")}.` : "There are no medicines on your plan.");
      case "appointment": return say(firstFollow ? `${firstFollow.what}. ${firstFollow.when ?? "The date is not on your plan. Please call your care team to ask."}` : "There is no follow-up appointment on your plan.");
      case "wound": return say(plan.instructions.wound_care.length ? first2(plan.instructions.wound_care) : "Nothing about wound care is listed.");
      case "activity": return say(plan.instructions.activity.length ? first2(plan.instructions.activity) : "Nothing about activity is listed.");
      case "diet": return say(plan.instructions.diet.length ? first2(plan.instructions.diet) : "Nothing about diet is listed.");
      case "warning": return say(plan.instructions.warning_signs.length ? `Contact your care team if you notice: ${first2(plan.instructions.warning_signs)}` : "No warning signs are listed. If you feel unwell, say help.");
      case "capabilities": return say("Say task one done, or I took my medicine, to tick your list. Ask about your medicines, appointment or wound care. If you feel unwell, just say help.");
      case "greet": return say(`Hello ${first}. How are you feeling today?`);
    }
  };
  heardRef.current = handle;
  const mic = useSafetyMic((s, f, a) => heardRef.current(s, f, a), lang);
  const level = useMicLevel(mic.state === "on");

  // ---- tell the patient what the care team does, once per step
  useEffect(() => {
    if (!journey) return;
    const ph = journey.sim ?? journey.phase;
    const key = `${journey.clientId}:${ph}`;
    if (spoken.current === key) return;
    const lines: Record<string, string> = {
      seen: `${journey.sim ? "A simulated nurse" : nurseName(journey.request)} has seen your request.`,
      calling: "A nurse is calling you. Please answer your phone.",
      escalated: "Your request was passed to the on-call clinician.",
      resolved: "Your care team marked this as handled.",
      offline: "I cannot reach the care team. Use the buttons on screen to call.",
    };
    if (lines[ph]) { spoken.current = key; say(lines[ph]); }
  }, [journey?.clientId, journey?.phase, journey?.sim]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- medicine reminders follow the (possibly simulated) clock
  useEffect(() => {
    if (reminder || journey) return;
    const due = doses.find((d) => !taken.has(d.key) && d.at <= nowMin && nowMin - d.at < 90 && !reminded.current.has(d.key) && (snooze.current[d.key] ?? 0) <= nowMin);
    if (!due) return;
    reminded.current.add(due.key);
    setReminder(due.key);
    say(`It is time for your ${due.med.name}. Did you take it?`);
  }, [nowMin, doses, taken, reminder, journey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = (t: Task) => {
    if (t.id === "med") { if (isDone("med")) { unmarkLast(); setDoneTasks((s) => { const n = new Set(s); n.delete("med"); return n; }); } else markSlot(); return; }
    setDoneTasks((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; });
  };
  const simulate = (text: string) => handle(text, true, []);
  const dueNow = () => { if (nextDose) setOffset((nextDose.at - clockMin + 1440) % 1440); };
  const reminderDose = reminder ? doses.find((x) => x.key === reminder) : undefined;
  const heardNow = level > 0.08;

  return (
    <div className="pt">
      {journey && (
        <HelpJourney j={journey} phone={care} onRetry={retry} onClose={close}
          onOkay={() => { void note("Patient says they are okay now"); setToast("I told your care team you are okay now"); }} />
      )}
      {reminderDose && (
        <div className="pt-rem" role="dialog" aria-label="Medicine reminder">
          <span className="pt-ic pt-ic--green"><Icon.pill size={26} /></span>
          <div><b>Time for {reminderDose.med.name}{reminderDose.med.dose ? ` ${reminderDose.med.dose}` : ""}</b><small>Due {reminderDose.time}. Say “I took it” or “not yet”.</small></div>
          <button className="pt-btn pt-btn--solid" onClick={() => { markSlot(); setReminder(null); }}>Taken</button>
          <button className="pt-btn pt-btn--line pt-later" onClick={() => { snooze.current[reminderDose.key] = nowMin + 10; reminded.current.delete(reminderDose.key); setReminder(null); }}>Later</button>
        </div>
      )}
      {toast && <div className="pt-toast" role="status">{toast}</div>}
      {composer !== null && (
        <div className="pt-modal" role="dialog" aria-label="Message your care team">
          <div className="pt-card">
            <h2>Message your care team</h2>
            <textarea value={composer} onChange={(e) => setComposer(e.target.value)} placeholder="Write what you need" rows={4} autoFocus />
            <div className="pt-modal-row">
              <button className="pt-btn pt-btn--line" onClick={() => setComposer(null)}>Cancel</button>
              <button className="pt-btn pt-btn--solid" disabled={!composer.trim()} onClick={() => { start(`Typed message: ${composer.trim()}`, "concern", "voice"); setComposer(null); }}>Send</button>
            </div>
          </div>
        </div>
      )}

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
        <header className="pt-top"><span className="pt-date"><Icon.calendar size={16} />{today}{offset ? ` · clock +${Math.floor(offset / 60)}h ${offset % 60}m` : ""}</span><span className="pt-avatar">{first[0]?.toUpperCase()}</span></header>

        <div className="pt-grid">
          <section className="pt-col">
            <div className="pt-hero">
              <h1>{greet}, {first}!</h1>
              <p>Your recovery plan</p>
              <small>Small steps every day lead to big progress.</small>
              <span className="pt-sun" aria-hidden="true" />
            </div>

            <div className="pt-card pt-progress" id="plan">
              <div>
                <h2>Today’s progress</h2>
                <p>{doneCount} of {tasks.length} tasks completed</p>
                <div className="pt-bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
              <svg className="pt-ring" width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`${pct}% done`}>
                <circle cx="38" cy="38" r={R} fill="none" stroke="#d8ece9" strokeWidth="8" />
                <circle cx="38" cy="38" r={R} fill="none" stroke="var(--pt)" strokeWidth="8" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset .6s ease" }} />
                <text x="38" y="43" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pt-d)">{pct}%</text>
              </svg>
            </div>

            <div className="pt-card">
              <div className="pt-head"><h2>Your tasks</h2><small>Say “task 1 done” or “I took my medicine”</small></div>
              <ul className="pt-tasks">
                {tasks.map((t) => {
                  const I = Icon[t.icon];
                  const d = isDone(t.id);
                  const warn = t.id === "fu" && missingDate && !d;
                  return (
                    <li key={t.id} className={`${d ? "is-done" : ""}${flash === t.id ? " is-flash" : ""}`}>
                      <span className="pt-num" aria-hidden="true">{t.n}</span>
                      <span className={`pt-ic pt-ic--${d ? "green" : warn ? "amber" : "teal"}`}>{d ? <Icon.check size={22} /> : <I size={22} />}</span>
                      <div><b>{t.title}</b><small>{t.sub}</small></div>
                      <button className={`pt-chip${d ? " is-ok" : warn ? " is-warn" : ""}`} onClick={() => toggleTask(t)} aria-pressed={d} aria-label={`Task ${t.n}: ${t.title}`}>
                        {d ? "Done" : warn ? "Needs attention" : "Mark done"}
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
                    {plan.meds.map((m) => (
                      <li key={m.id}>
                        <span className="pt-ic pt-ic--green"><Icon.pill size={20} /></span>
                        <div>
                          <b>{m.name}{m.dose ? ` ${m.dose}` : ""}</b>
                          <small>{m.times.length ? "" : m.frequency ?? "Take as directed"}{m.duration ? `${m.times.length ? "" : " · "}${m.duration}` : ""}</small>
                          <div className="pt-doses">
                            {m.times.map((t) => { const k = `${m.id}@${t}`; const on = taken.has(k); return (
                              <button key={k} className={`pt-dose${on ? " is-on" : ""}${pop === k ? " is-pop" : ""}${!on && nextDose?.key === k ? " is-next" : ""}`} aria-pressed={on}
                                onClick={() => (on ? setTaken((s) => { const n = new Set(s); n.delete(k); return n; }) : (setTaken((s) => new Set(s).add(k)), setPop(k)))}>
                                {on && <Icon.check size={12} />} {t}
                              </button>); })}
                          </div>
                        </div>
                      </li>
                    ))}
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
                {(missingDate || plan.followUps.length > 0) && care && (
                  <div className="pt-note"><b>{missingDate ? "Ask for your appointment date" : "Need to change or reschedule?"}</b><a className="pt-btn pt-btn--line" href={`tel:${care}`}><Icon.phone size={15} /> Call now</a></div>
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
              <div className={`pt-orb${mic.state === "on" ? " is-on" : ""}${heardNow ? " is-hearing" : ""}`}><Icon.mic size={26} /></div>
              <h2>Voice companion</h2>
              {mic.state === "on" && <>
                <div className="pt-wave" aria-hidden="true">{BARS.map((m, i) => <i key={i} style={{ height: `${6 + level * 30 * m}px` }} />)}</div>
                <p className="pt-mic-on">{heardNow ? "I hear you…" : "Listening. Say “help” any time."}</p>
              </>}
              {mic.state === "starting" && <p>Starting the microphone…</p>}
              {mic.state === "blocked" && <><p>The microphone is off. Tap once so I can listen for you.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Turn on voice</button></>}
              {mic.state === "off" && <><p>Listening is off.</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> Turn on</button></>}
              {mic.state === "unsupported" && <p>This browser cannot listen. Use Chrome or Edge, or the buttons below.</p>}
              {live && <p className="pt-live" aria-live="polite">“{live}”</p>}
              <div className="pt-chat" aria-live="polite">
                {log.length === 0 && <small>Try: “task 1 done”, “I took my medicine”, “I washed my wound”, “What medicine is next?”</small>}
                {log.map((l, i) => <p key={i} className={`pt-msg pt-msg--${l.who}`}>{l.text}</p>)}
              </div>
              <div className="pt-set">
                <span>Sensitivity</span>
                <button className={high ? "is-on" : ""} aria-pressed={high} onClick={() => setHigh(true)}>High</button>
                <button className={!high ? "is-on" : ""} aria-pressed={!high} onClick={() => setHigh(false)}>Standard</button>
              </div>
              <div className="pt-set">
                <span>Language</span>
                <button className={lang === "en-IN" ? "is-on" : ""} aria-pressed={lang === "en-IN"} onClick={() => setLang("en-IN")}>English</button>
                <button className={lang === "hi-IN" ? "is-on" : ""} aria-pressed={lang === "hi-IN"} onClick={() => setLang("hi-IN")}>हिन्दी</button>
              </div>
              <label className="pt-switch"><input type="checkbox" checked={soundOn} onChange={(e) => { setSoundOn(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Spoken replies</label>
              {mic.state === "on" && <button className="pt-link" onClick={mic.disable}>Turn off listening</button>}
              <small>{lang === "hi-IN" ? "हिन्दी में सिर्फ़ मदद और तकलीफ़ के शब्द समझे जाते हैं। " : ""}Your browser’s speech service processes what you say. Keep this page open with the screen on.</small>
            </div>
            <div className="pt-card pt-helpbox" id="help">
              <div className="pt-head"><h2>Need help?</h2></div>
              <p>Have a question, need assistance, or feeling unwell?</p>
              <button className="pt-btn pt-btn--red" onClick={() => triggerDistress("button", "critical")}><Icon.alert size={17} /> I need help now</button>
              {care && <a className="pt-btn pt-btn--line" href={`tel:${care}`}><Icon.phone size={17} /> Call care team</a>}
              <button className="pt-btn pt-btn--line" onClick={() => setComposer("")}><Icon.chat size={17} /> Send a message</button>
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

      {showTools && <button className="pt-tools-btn" onClick={() => setTools((v) => !v)} aria-expanded={tools}>Demo tools</button>}
      {showTools && tools && (
        <div className="pt-tools" role="group" aria-label="Demo tools">
          <small>For a noisy room. These act exactly like speech.</small>
          <button onClick={() => simulate("task 1 done")}>Say: task 1 done</button>
          <button onClick={() => simulate("I took my medicine")}>Say: I took my medicine</button>
          <button onClick={() => simulate("I washed my wound and I walked")}>Say: I washed my wound and walked</button>
          <button onClick={() => simulate("what medicine is next")}>Say: what medicine is next</button>
          <button onClick={() => simulate("I feel dizzy")}>Say: I feel dizzy</button>
          <button onClick={() => simulate("help")}>Say: help</button>
          <hr />
          <label><input type="checkbox" checked={simNurse} onChange={(e) => setSimNurse(e.target.checked)} /> Simulated nurse answers after 10 s <em>(labelled DEMO)</em></label>
          <label><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Pretend the hospital is offline</label>
          <hr />
          <button onClick={dueNow} disabled={!nextDose}>Next dose is due now</button>
          <button onClick={() => setOffset((o) => o + 60)}>Skip ahead 1 hour</button>
          <button onClick={() => { setTaken(new Set()); setDoneTasks(new Set()); reminded.current.clear(); snooze.current = {}; setOffset(0); setLog([]); close(); }}>Reset the demo</button>
        </div>
      )}
    </div>
  );
}
