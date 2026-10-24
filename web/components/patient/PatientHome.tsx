"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Icon } from "@/components/staff/icons";
import { api } from "@/lib/api";
import { nurseName } from "@/lib/helpJourney";
import { useLanguage } from "@/lib/i18n";
import { CARE_TEAM_PHONE, DISTRESS_COOLDOWN_MS, realPhone } from "@/lib/patientConfig";
import { toMinutes, type InstructionKey, type PlanView } from "@/lib/patient";
import { detectDistress, isEcho, parseIntent, parseTaskCommands, type Severity, type TaskRef } from "@/lib/voice";
import {
  parseBilingualCommand,
  resolveTaskFromUtterance,
  speakConfirmation,
  type TaskContextItem,
} from "@/lib/voiceEngine";
import HelpJourney from "./HelpJourney";
import MilestoneCelebrationModal from "./MilestoneCelebrationModal";
import PatientCallModal from "./PatientCallModal";
import { PillScannerModal } from "./PillScannerModal";
import { useHelpJourney } from "./useHelpJourney";
import { useMicLevel } from "./useMicLevel";
import { useSafetyMic, type VoiceLang } from "./useSafetyMic";
import { getMilestoneForPercentage, MILESTONE_QUOTES, type MilestoneQuote } from "@/lib/milestoneQuotes";
import { WebRTCClient } from "@/lib/webrtcClient";
import type { CallStatus } from "@/lib/types";

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
  const { lang: globalLang, setLang: setGlobalLang, t, speechLocale } = useLanguage();
  const first = (plan.patientName ?? "").split(/\s+/)[0] || "there";
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

  // Real-Time Telehealth Audio Calling State
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [callerName, setCallerName] = useState("Hospital Care Team");
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallPeerMuted, setIsCallPeerMuted] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const callClientRef = useRef<WebRTCClient | null>(null);

  // AI Pill Scanner State
  const [isPillScannerOpen, setIsPillScannerOpen] = useState(false);

  const handleScannerDoseConfirmed = (medId: string, medName: string) => {
    const matchingDose = doses.find((d) => d.med.id === medId && !taken.has(d.key)) || doses.find((d) => d.med.id === medId);
    if (matchingDose) {
      setTaken((s) => new Set(s).add(matchingDose.key));
      setPop(matchingDose.key);
    }
    setDoneTasks((prev) => new Set([...prev, "med"]));
    if (token && token !== "demo") {
      api.reportDose(token, medId, true, "scanner").catch(() => {});
    }
    setToast(globalLang === "hi" ? `${medName} की खुराक सफलतापूर्वक सत्यापित और दर्ज की गई!` : `${medName} dose verified & recorded!`);
  };

  // Motivational Milestone Celebration State
  const [activeMilestone, setActiveMilestone] = useState<MilestoneQuote | null>(null);
  const celebratedMilestones = useRef<Set<number>>(new Set());
  const initialMilestoneScan = useRef(false);

  useEffect(() => {
    const patientClientId = `patient_${token}_${Math.random().toString(36).slice(2, 7)}`;
    const client = new WebRTCClient({
      clientId: patientClientId,
      role: "patient",
      runId: plan.runId || token,
      displayName: plan.patientName || "Patient",
      onStatusChange: (status, err) => {
        setCallStatus(status);
        if (err) setCallError(err);
      },
      onIncomingCall: (incoming) => {
        setCallerName(incoming.caller_name || "Hospital Care Team");
        setCallStatus("ringing");
      },
      onPeerMuteChange: (muted) => setIsCallPeerMuted(muted),
      onDurationTick: (sec) => setCallDuration(sec),
    });

    callClientRef.current = client;

    return () => {
      client.destroy();
      callClientRef.current = null;
    };
  }, [plan.runId, token, plan.patientName]);

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

  const handleCallCareTeam = async () => {
    setCallerName(globalLang === "hi" ? "अस्पताल केयर टीम को कॉल किया जा रहा है…" : "Calling Hospital Care Team…");
    setCallError(null);
    setCallDuration(0);
    setIsCallMuted(false);
    setIsCallPeerMuted(false);
    await callClientRef.current?.initiateCall("staff");
  };

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
      const st = JSON.parse(localStorage.getItem("rr-pt-settings") ?? "null") as { high?: boolean; sound?: boolean } | null;
      if (st) { if (typeof st.high === "boolean") setHigh(st.high); if (typeof st.sound === "boolean") setSoundOn(st.sound); }
    } catch { /* nothing saved */ }
    if (new URLSearchParams(window.location.search).has("demo")) setShowTools(true);
    return () => clearInterval(id);
  }, [store]);
  useEffect(() => { try { localStorage.setItem(store, JSON.stringify({ taken: [...taken], done: [...doneTasks] })); } catch { /* ignore */ } }, [taken, doneTasks, store]);
  useEffect(() => { try { localStorage.setItem("rr-pt-settings", JSON.stringify({ high, lang: speechLocale, sound: soundOn })); } catch { /* ignore */ } }, [high, speechLocale, soundOn]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!pop) return; const id = setTimeout(() => setPop(null), 900); return () => clearTimeout(id); }, [pop]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(id); }, [flash]);

  useEffect(() => {
    if (plan.serverTasks && plan.serverTasks.length > 0) {
      const completed = plan.serverTasks.filter((t) => t.status === "completed").map((t) => t.task_id);
      if (completed.length > 0) {
        setDoneTasks((prev) => new Set([...prev, ...completed]));
      }
    }
  }, [plan.serverTasks]);

  const nowMin = (clockMin + offset) % 1440;
  const doses = useMemo(() => plan.meds.flatMap((m) => m.times.map((t) => ({ key: `${m.id}@${t}`, med: m, time: t, at: toMinutes(t) }))).sort((a, b) => a.at - b.at), [plan.meds]);
  const pending = doses.filter((d) => !taken.has(d.key));
  const nextDose = pending.find((d) => d.at >= nowMin) ?? pending[0];
  const firstFollow = plan.followUps[0];
  const missingDate = !firstFollow?.when;
  const medDone = doses.length > 0 && taken.size > 0 && doses.every((d) => d.at > nowMin + 30 || taken.has(d.key));

  const totalDays = plan.planDurationDays || 14;
  const approvedTime = plan.approvedAt ? new Date(plan.approvedAt).getTime() : Date.now();
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.floor((Date.now() - approvedTime) / 86400000) + 1));
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  // ---- the to-do list (numbered, so it can be confirmed by voice)
  const tasks: Task[] = useMemo(() => {
    if (plan.serverTasks && plan.serverTasks.length > 0) {
      return plan.serverTasks.map((st, i) => {
        let icon: keyof typeof Icon = "list";
        let kw = /\b(task)/;
        if (st.category === "medication") {
          icon = "pill";
          kw = /\b(medicine|medication|tablet|pill|dose|capsule|दवा)/;
        } else if (st.category === "wound_care") {
          icon = "shield";
          kw = /\b(wound|dressing|bandage|stitch|clean|wash|पट्टी|घाव)/;
        } else if (st.category === "activity") {
          icon = "walk";
          kw = /\b(exercise|walk|physio|stretch|moved|चला|घूमा)/;
        } else if (st.category === "follow_up") {
          icon = "calendar";
          kw = /\b(appointment|follow ?up|clinic|doctor|डॉक्टर)/;
        } else if (st.category === "diet") {
          icon = "heart";
          kw = /\b(water|drink|drank|fluid|hydrat|diet|पानी|खाना)/;
        }
        return {
          id: st.task_id,
          icon,
          title: st.title,
          sub: st.description || (st.scheduled_time ? `Scheduled for ${st.scheduled_time}` : ""),
          kw,
          n: i + 1,
        };
      });
    }
    const names = plan.meds.map((m) => esc(m.name.toLowerCase())).filter(Boolean).join("|");
    const list: Omit<Task, "n">[] = [
      { id: "care", icon: "shield", title: "Wound care", sub: plan.instructions.wound_care[0] ?? "Check your dressing is clean and dry", kw: /\b(wound|dressing|bandage|stitch|clean|wash)/ },
      { id: "med", icon: "pill", title: "Take your medicine", sub: nextDose ? `Next: ${nextDose.med.name} at ${nextDose.time}` : plan.meds.length ? "All doses taken" : "No medicines on your plan", kw: new RegExp(`\\b(medicine|medication|tablet|pill|dose|capsule${names ? `|${names}` : ""})`) },
      { id: "move", icon: "walk", title: "Recovery exercises", sub: plan.instructions.activity[0] ?? "Move as your care team advised", kw: /\b(exercise|walk|physio|stretch|moved)/ },
      ...(plan.followUps.length ? [{ id: "fu", icon: "calendar" as const, title: "Follow-up appointment", sub: missingDate ? "Date not provided: call your care team" : `${firstFollow.when}`, kw: /\b(appointment|follow ?up|clinic)/ }] : []),
      ...(plan.instructions.diet.length ? [{ id: "drink", icon: "heart" as const, title: "Drink fluids", sub: plan.instructions.diet[0], kw: /\b(water|drink|drank|fluid|hydrat)/ }] : []),
    ];
    return list.map((tItem, i) => ({ ...tItem, n: i + 1 }));
  }, [plan, nextDose, missingDate, firstFollow]);
  const isDone = (id: string) => (id === "med" ? medDone || doneTasks.has("med") : doneTasks.has(id));
  const doneCount = tasks.filter((tItem) => isDone(tItem.id)).length;
  const pct = Math.round((doneCount / (tasks.length || 1)) * 100);
  const R = 28, CIRC = 2 * Math.PI * R;

  // Milestone Progress Recognition & Verbal Motivation
  useEffect(() => {
    if (!initialMilestoneScan.current) {
      const currentTier = Math.floor(pct / 10) * 10;
      if (currentTier >= 10) {
        for (let t = 10; t <= currentTier; t += 10) {
          celebratedMilestones.current.add(t);
        }
      }
      initialMilestoneScan.current = true;
      return;
    }

    const tier = Math.floor(pct / 10) * 10;
    if (tier >= 10 && !celebratedMilestones.current.has(tier)) {
      celebratedMilestones.current.add(tier);
      const m = MILESTONE_QUOTES.find((item) => item.pct === tier);
      if (m) {
        setActiveMilestone(m);
      }
    }
  }, [pct]);

  // ---- spoken replies
  const say = (text: string) => {
    setLog((l) => [...l.slice(-5), { who: "bot", text }]);
    lastSpoken.current = text;
    speakingUntil.current = Date.now() + text.length * 75 + 1500;
    if (!soundOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    speakConfirmation(text, globalLang);
  };

  const markSlot = (via: "app_button" | "voice" = "app_button"): { time: string; names: string[] } | null => {
    const p = doses.filter((d) => !taken.has(d.key));
    if (!p.length) return null;
    const at = (p.find((d) => d.at <= nowMin + 30) ?? p[0]).at;
    const slot = p.filter((d) => d.at === at);
    setTaken((s) => { const n = new Set(s); slot.forEach((d) => n.add(d.key)); return n; });
    setPop(slot[0].key);
    if (token && token !== "demo") {
      slot.forEach((d) => {
        api.reportDose(token, d.med.id, true, via).catch(() => {});
      });
    }
    return { time: slot[0].time, names: slot.map((d) => d.med.name) };
  };
  const unmarkLast = () => {
    const t = [...doses].reverse().find((d) => taken.has(d.key));
    if (t) {
      setTaken((s) => { const n = new Set(s); n.delete(t.key); return n; });
      if (token && token !== "demo") {
        api.reportDose(token, t.med.id, false, "app_button").catch(() => {});
      }
    }
    return t;
  };

  const applyTasks = (cmds: { id: string; done: boolean }[], said: string) => {
    const bits: string[] = [];
    let after = new Set(doneTasks);
    for (const c of cmds) {
      const tItem = tasks.find((x) => x.id === c.id);
      if (!tItem) continue;
      setFlash(tItem.id);
      if (tItem.id === "med") {
        if (c.done) {
          const r = markSlot("voice");
          bits.push(
            r
              ? (globalLang === "hi"
                  ? `मैंने आपकी ${r.time} की दवा ${r.names.join(", ")} को लिया हुआ दर्ज कर लिया है।`
                  : `I marked your ${r.time} medicine as taken: ${r.names.join(" and ")}.`)
              : (globalLang === "hi" ? "आपकी सभी दवाइयाँ पहले ही ली जा चुकी हैं।" : "All your doses are already marked.")
          );
          setDoneTasks((s) => { const n = new Set(s); n.delete("med"); return n; });
          after.delete("med");
        } else {
          const u = unmarkLast();
          bits.push(
            u
              ? (globalLang === "hi" ? `ठीक है, ${u.med.name} को लिया हुआ नहीं माना गया है।` : `Okay, ${u.med.name} is not marked as taken.`)
              : (globalLang === "hi" ? "कोई दवा दर्ज नहीं थी।" : "No dose was marked.")
          );
        }
      } else {
        if (c.done) after.add(tItem.id); else after.delete(tItem.id);
        if (token && token !== "demo") {
          api.updateTask(token, tItem.id, c.done ? "complete" : "reset", "voice").catch(() => {});
        }
        bits.push(
          globalLang === "hi"
            ? `कार्य ${tItem.n}, ${tItem.title}, ${c.done ? "पूरा हो गया" : "पूरा नहीं हुआ"} दर्ज किया गया।`
            : `Task ${tItem.n}, ${tItem.title.toLowerCase()}, ${c.done ? "is done" : "is not done"}.`
        );
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
    setLog((l) => [...l.slice(-5), { who: "you", text: said === "button" ? (globalLang === "hi" ? "(मदद बटन)" : "(help button)") : said }]);
    const alertMsg = globalLang === "hi"
      ? (severity === "critical" ? "मैंने आपकी देखभाल टीम को सूचित कर दिया है। कृपया बैठ जाएं और वहीं रहें।" : "मैंने आपकी केयर टीम को बता दिया है। कृपया बैठ जाएं।")
      : (severity === "critical" ? "I have alerted your care team. Please sit down and stay where you are." : "I have told your care team how you feel. Please sit down.");
    say(alertMsg);
  };

  // ---- what the patient said
  const handle = (said: string, isFinal: boolean, alts: string[]) => {
    if (Date.now() < speakingUntil.current + 5000 && isEcho(said, lastSpoken.current)) return; // the app hearing itself
    setLive(isFinal ? "" : said);
    const d = detectDistress([said, ...alts], { high });
    if (d) {
      mic.setStatus("command_recognized");
      return triggerDistress(said, d.severity);
    }
    if (!isFinal) return;

    mic.setStatus("processing");

    // Bilingual command evaluation
    const bcmd = parseBilingualCommand(said, globalLang);
    if (bcmd.type === "emergency") {
      mic.setStatus("command_recognized");
      return triggerDistress(said, "critical");
    }

    // Contextual task resolution for natural Hindi/Hinglish/English
    const taskContextList: TaskContextItem[] = tasks.map((tItem) => ({
      id: tItem.id,
      title: tItem.title,
      category: tItem.id === "med" ? "medication" : tItem.id === "move" ? "activity" : tItem.id === "care" ? "wound_care" : tItem.id === "drink" ? "diet" : "general",
      status: isDone(tItem.id) ? "completed" : "pending",
      n: tItem.n,
    }));

    const taskRes = resolveTaskFromUtterance(said, taskContextList, globalLang);

    if (taskRes.status === "negation") {
      mic.setStatus("completed");
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "future_intention") {
      mic.setStatus("completed");
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "question") {
      mic.setStatus("completed");
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "already_completed") {
      mic.setStatus("completed");
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "ambiguous") {
      mic.setStatus("clarification_needed");
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "all_matched" && taskRes.allTasks) {
      for (const tItem of taskRes.allTasks) {
        if (tItem.id === "med") {
          markSlot("voice");
        } else {
          setDoneTasks((s) => new Set(s).add(tItem.id));
          if (token && token !== "demo") {
            api.updateTask(token, tItem.id, "complete", "voice").catch(() => {});
          }
        }
      }
      mic.setStatus("completed");
      setReminder(null);
      return say(taskRes.speechResponse[globalLang]);
    }

    if (taskRes.status === "matched" && taskRes.matchedTask) {
      setFlash(taskRes.matchedTask.id);
      if (taskRes.matchedTask.id === "med") {
        markSlot("voice");
      } else {
        setDoneTasks((s) => new Set(s).add(taskRes.matchedTask!.id));
        if (token && token !== "demo") {
          api.updateTask(token, taskRes.matchedTask.id, "complete", "voice").catch(() => {});
        }
      }
      mic.setStatus("completed");
      setReminder(null);
      return say(taskRes.speechResponse[globalLang]);
    }

    const cmds = parseTaskCommands(said, tasks);
    if (cmds.length && applyTasks(cmds, said)) {
      mic.setStatus("completed");
      setReminder(null);
      return;
    }

    if (bcmd.type === "medication_query") {
      mic.setStatus("completed");
      const reply = nextDose
        ? (globalLang === "hi"
            ? `आपकी अगली दवा ${nextDose.med.name}${nextDose.med.dose ? ` ${nextDose.med.dose}` : ""} ${nextDose.time} बजे है।`
            : `Your next medicine is ${nextDose.med.name}${nextDose.med.dose ? ` ${nextDose.med.dose}` : ""} at ${nextDose.time}.`)
        : (globalLang === "hi" ? "आज आपकी कोई और दवा शेष नहीं है।" : "You have no more doses today.");
      return say(reply);
    }

    if (bcmd.type === "care_plan") {
      mic.setStatus("completed");
      const reply = globalLang === "hi"
        ? `आज की प्रगति: ${doneCount}/${tasks.length} कार्य पूरे हो चुके हैं। रिकवरी योजना दिन ${elapsedDays}/${totalDays} पर है।`
        : `Today's progress: ${doneCount} of ${tasks.length} tasks completed. Recovery plan day ${elapsedDays} of ${totalDays}.`;
      return say(reply);
    }

    if (bcmd.type === "appointment_query") {
      mic.setStatus("completed");
      const reply = firstFollow
        ? (globalLang === "hi"
            ? `${firstFollow.what}। ${firstFollow.when ?? "तारीख योजना में नहीं है, कृपया अस्पताल से संपर्क करें।"}`
            : `${firstFollow.what}. ${firstFollow.when ?? "The date is not on your plan. Please call your care team."}`)
        : (globalLang === "hi" ? "आपकी योजना में कोई फॉलो-अप अपॉइंटमेंट नहीं है।" : "There is no follow-up appointment on your plan.");
      return say(reply);
    }

    if (bcmd.type === "wound_care") {
      mic.setStatus("completed");
      const instr = plan.instructions.wound_care.length ? first2(plan.instructions.wound_care) : (globalLang === "hi" ? "घाव की देखभाल के लिए कोई विशेष निर्देश नहीं हैं।" : "Nothing about wound care is listed.");
      return say(instr);
    }

    if (bcmd.type === "warning_signs") {
      mic.setStatus("completed");
      const instr = plan.instructions.warning_signs.length
        ? (globalLang === "hi" ? `यदि ये लक्षण दिखें तो तुरंत अस्पताल से संपर्क करें: ${first2(plan.instructions.warning_signs)}` : `Contact your care team if you notice: ${first2(plan.instructions.warning_signs)}`)
        : (globalLang === "hi" ? "कोई खतरे के लक्षण नहीं हैं। यदि अस्वस्थ महसूस करें तो तुरंत मदद बोलें।" : "No warning signs are listed. If you feel unwell, say help.");
      return say(instr);
    }

    const intent = parseIntent(said, { reminderOpen: reminder !== null });
    if (intent === "none") {
      mic.setStatus("not_understood");
      return say(globalLang === "hi"
        ? `क्षमा करें, मैं "${said}" समझ नहीं सका। बोलें: "पहला काम हो गया", "दवा ले ली" या "मदद"।`
        : `Sorry, I did not catch "${said}". Try saying "task 1 done", "I took my medicine" or "help".`);
    }

    mic.setStatus("completed");
    setLog((l) => [...l.slice(-5), { who: "you", text: said }]);
    switch (intent) {
      case "yes": { const r = markSlot(); setReminder(null); return say(r ? `Done. I marked your ${r.time} medicine as taken.` : "All your doses are already marked."); }
      case "later": if (reminder) { snooze.current[reminder] = nowMin + 10; reminded.current.delete(reminder); setReminder(null); } return say(globalLang === "hi" ? "ठीक है, मैं आपको 10 मिनट बाद फिर याद दिलाऊंगा।" : "Okay. I will remind you again in ten minutes.");
      case "next_dose": return say(nextDose ? `Your next medicine is ${nextDose.med.name}${nextDose.med.dose ? ` ${nextDose.med.dose}` : ""} at ${nextDose.time}.` : "You have no more doses today.");
      case "list_meds": return say(plan.meds.length ? `You have ${plan.meds.length} medicine${plan.meds.length > 1 ? "s" : ""}: ${plan.meds.map((m) => m.name).join(", ")}.` : "There are no medicines on your plan.");
      case "appointment": return say(firstFollow ? `${firstFollow.what}. ${firstFollow.when ?? "The date is not on your plan. Please call your care team to ask."}` : "There is no follow-up appointment on your plan.");
      case "wound": return say(plan.instructions.wound_care.length ? first2(plan.instructions.wound_care) : "Nothing about wound care is listed.");
      case "activity": return say(plan.instructions.activity.length ? first2(plan.instructions.activity) : "Nothing about activity is listed.");
      case "diet": return say(plan.instructions.diet.length ? first2(plan.instructions.diet) : "Nothing about diet is listed.");
      case "warning": return say(plan.instructions.warning_signs.length ? `Contact your care team if you notice: ${first2(plan.instructions.warning_signs)}` : "No warning signs are listed. If you feel unwell, say help.");
      case "capabilities": return say(globalLang === "hi" ? "बोलें: पहला काम हो गया, या दवा ले ली। दवाइयों, अपॉइंटमेंट या घाव की देखभाल के बारे में पूछें। अस्वस्थ लगें तो मदद बोलें।" : "Say task one done, or I took my medicine, to tick your list. Ask about your medicines, appointment or wound care. If you feel unwell, just say help.");
      case "greet": return say(globalLang === "hi" ? `नमस्ते ${first}! आज आप कैसा महसूस कर रहे हैं?` : `Hello ${first}. How are you feeling today?`);
    }
  };
  heardRef.current = handle;
  const mic = useSafetyMic((s, f, a) => heardRef.current(s, f, a), speechLocale);
  const level = useMicLevel(mic.state === "on");

  // ---- tell the patient what the care team does, once per step
  useEffect(() => {
    if (!journey) return;
    const ph = journey.sim ?? journey.phase;
    const key = `${journey.clientId}:${ph}`;
    if (spoken.current === key) return;
    const lines: Record<string, string> = {
      seen: globalLang === "hi" ? `${journey.sim ? "एक सिमुलेटेड नर्स" : nurseName(journey.request)} ने आपका अनुरोध देख लिया है।` : `${journey.sim ? "A simulated nurse" : nurseName(journey.request)} has seen your request.`,
      calling: globalLang === "hi" ? "नर्स आपको कॉल कर रही हैं। कृपया फोन का उत्तर दें।" : "A nurse is calling you. Please answer your phone.",
      escalated: globalLang === "hi" ? "आपका अनुरोध ऑन-कॉल डॉक्टर को भेजा गया है।" : "Your request was passed to the on-call clinician.",
      resolved: globalLang === "hi" ? "आपकी केयर टीम ने इस अनुरोध को पूर्ण कर दिया है।" : "Your care team marked this as handled.",
      offline: globalLang === "hi" ? "केयर टीम से संपर्क नहीं हो पा रहा है। कॉल करने के लिए स्क्रीन के बटनों का उपयोग करें।" : "I cannot reach the care team. Use the buttons on screen to call.",
    };
    if (lines[ph]) { spoken.current = key; say(lines[ph]); }
  }, [journey?.clientId, journey?.phase, journey?.sim, globalLang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- medicine reminders follow the (possibly simulated) clock
  useEffect(() => {
    if (reminder || journey) return;
    const due = doses.find((d) => !taken.has(d.key) && d.at <= nowMin && nowMin - d.at < 90 && !reminded.current.has(d.key) && (snooze.current[d.key] ?? 0) <= nowMin);
    if (!due) return;
    reminded.current.add(due.key);
    setReminder(due.key);
    say(globalLang === "hi" ? `आपकी दवा ${due.med.name} का समय हो गया है। क्या आपने इसे ले लिया?` : `It is time for your ${due.med.name}. Did you take it?`);
  }, [nowMin, doses, taken, reminder, journey, globalLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = (tItem: Task) => {
    if (tItem.id === "med") {
      if (isDone("med")) {
        unmarkLast();
        setDoneTasks((s) => { const n = new Set(s); n.delete("med"); return n; });
      } else {
        markSlot("app_button");
      }
      return;
    }
    const nextDone = !doneTasks.has(tItem.id);
    setDoneTasks((s) => { const n = new Set(s); if (n.has(tItem.id)) n.delete(tItem.id); else n.add(tItem.id); return n; });
    if (token && token !== "demo") {
      api.updateTask(token, tItem.id, nextDone ? "complete" : "reset", "patient").catch(() => {});
    }
  };
  const simulate = (text: string) => handle(text, true, []);
  const dueNow = () => { if (nextDose) setOffset((nextDose.at - clockMin + 1440) % 1440); };
  const reminderDose = reminder ? doses.find((x) => x.key === reminder) : undefined;
  const heardNow = level > 0.08;

  const statusLabel = {
    ready: t.voiceReady,
    listening: t.voiceListening,
    processing: t.voiceProcessing,
    command_recognized: t.voiceCommandRecognized,
    completed: t.voiceCompleted,
    navigation_completed: t.voiceNavigationCompleted || "Navigation completed",
    clarification_needed: t.voiceClarificationNeeded,
    clarification_required: t.voiceClarificationRequired || t.voiceClarificationNeeded,
    patient_not_found: t.voicePatientNotFound || "Patient not found",
    not_understood: t.voiceNotUnderstood,
    mic_unavailable: t.voiceMicUnavailable,
    error: t.voiceError,
  }[mic.status] || mic.status;

  const greetingText = globalLang === "hi"
    ? (new Date().getHours() < 12 ? "शुभ प्रभात" : new Date().getHours() < 18 ? "शुभ दोपहर" : "शुभ संध्या")
    : greet;

  return (
    <div className="pt">
      {journey && (
        <HelpJourney j={journey} phone={care} onRetry={retry} onClose={close}
          onOkay={() => {
            void note("Patient says they are okay now");
            setToast(globalLang === "hi" ? "मैंने देखभाल टीम को बता दिया है कि आप ठीक हैं" : "I told your care team you are okay now");
          }} />
      )}
      {reminderDose && (
        <div className="pt-rem" role="dialog" aria-label="Medicine reminder">
          <span className="pt-ic pt-ic--green"><Icon.pill size={26} /></span>
          <div>
            <b>{t.ptTimeFor(reminderDose.med.name, reminderDose.med.dose)}</b>
            <small>{t.ptDueAt(reminderDose.time)}</small>
          </div>
          <button className="pt-btn pt-btn--solid" onClick={() => {
            markSlot("app_button");
            setReminder(null);
            if (token && token !== "demo" && reminderDose) {
              api.acknowledgeMedication(token, reminderDose.med.id, "app_button").catch(() => {});
            }
          }}>{t.ptTaken}</button>
          <button className="pt-btn pt-btn--line pt-later" onClick={() => {
            snooze.current[reminderDose.key] = nowMin + 10;
            reminded.current.delete(reminderDose.key);
            setReminder(null);
            if (token && token !== "demo" && reminderDose) {
              api.acknowledgeMedication(token, reminderDose.med.id, "app_button").catch(() => {});
            }
          }}>{t.ptLater}</button>
        </div>
      )}
      {toast && <div className="pt-toast" role="status">{toast}</div>}
      {composer !== null && (
        <div className="pt-modal" role="dialog" aria-label={t.ptMessageCareTeamTitle}>
          <div className="pt-card">
            <h2>{t.ptMessageCareTeamTitle}</h2>
            <textarea value={composer} onChange={(e) => setComposer(e.target.value)} placeholder={t.ptWriteWhatYouNeed} rows={4} autoFocus />
            <div className="pt-modal-row">
              <button className="pt-btn pt-btn--line" onClick={() => setComposer(null)}>{t.ptCancel}</button>
              <button className="pt-btn pt-btn--solid" disabled={!composer.trim()} onClick={() => { start(`Typed message: ${composer.trim()}`, "concern", "voice"); setComposer(null); }}>{t.ptSend}</button>
            </div>
          </div>
        </div>
      )}

      <aside className="pt-side">
        <div className="pt-brand"><span><Icon.heart size={22} /></span><div><b>RecoverRight</b><small>Your recovery companion</small></div></div>
        <nav>
          <a href="#home" className="is-on"><Icon.home size={18} />{globalLang === "hi" ? "मुख्य पृष्ठ" : "Home"}</a>
          <a href="#plan"><Icon.list size={18} />{t.ptRecoveryPlan}</a>
          <a href="#medications"><Icon.pill size={18} />{t.ptMedications}</a>
          <a href="#instructions"><Icon.book size={18} />{t.ptInstructions}</a>
          <a href="#appointments"><Icon.calendar size={18} />{t.ptAppointments}</a>
          <a href="#help"><Icon.chat size={18} />{t.ptNeedHelp}</a>
        </nav>
        <p className="pt-safe"><Icon.lock size={14} /> {t.ptSafePlanChecked}</p>
      </aside>

      <main className="pt-main" id="home">
        {plan.demo && <p className="pt-demo">Demo data. Open a real plan with its approved link.</p>}
        <header className="pt-top">
          <span className="pt-date"><Icon.calendar size={16} />{today}{offset ? ` · clock +${Math.floor(offset / 60)}h ${offset % 60}m` : ""}</span>
          <LanguageSwitcher />
          <span className="pt-avatar">{first[0]?.toUpperCase()}</span>
        </header>

        <div className="pt-grid">
          <section className="pt-col">
            <div className="pt-hero">
              <h1>{greetingText}, {first}!</h1>
              <p>{t.ptRecoveryPlan}</p>
              <small>{t.ptEncouragement}</small>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setIsPillScannerOpen(true)}
                  style={{
                    background: "rgba(255, 255, 255, 0.95)",
                    color: "#0f766e",
                    border: "1px solid rgba(13, 148, 136, 0.3)",
                    padding: "7px 14px",
                    borderRadius: 9999,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  <span>📷</span>
                  <span>{t.pillScanBtn}</span>
                </button>
              </div>
              <span className="pt-sun" aria-hidden="true" />
            </div>

            <div className="pt-card pt-progress" id="plan">
              <div>
                <h2>{t.ptTodayProgress}</h2>
                <p>{t.ptCompletedOf(doneCount, tasks.length)}</p>
                <div className="pt-bar"><i style={{ width: `${pct}%` }} /></div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pt-d)" }}>
                    {t.ptDayProgress(elapsedDays, totalDays, remainingDays)}
                  </span>
                  <small style={{ fontSize: 12, color: "var(--mut)", lineHeight: 1.35 }}>
                    {t.ptDurationDisclaimer}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const m = getMilestoneForPercentage(pct) || MILESTONE_QUOTES[0];
                    setActiveMilestone(m);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 99,
                    background: "linear-gradient(135deg, #f0fdfa, #ecfdf5)",
                    color: "#0d9488",
                    border: "1px solid #99f6e4",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    width: "fit-content",
                    marginTop: 10,
                    boxShadow: "0 2px 6px rgba(13,148,136,0.1)",
                  }}
                  title={globalLang === "hi" ? "प्रेरक संदेश सुनें" : "Listen to motivational milestone quote"}
                >
                  <span>{getMilestoneForPercentage(pct)?.emoji || "🌱"}</span>
                  <span>{globalLang === "hi" ? "प्रेरक संदेश देखें" : "View Milestone Quote"}</span>
                  <Icon.volume size={13} />
                </button>
              </div>
              <svg
                className="pt-ring"
                width="76"
                height="76"
                viewBox="0 0 76 76"
                role="img"
                aria-label={`${pct}% done`}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const m = getMilestoneForPercentage(pct) || MILESTONE_QUOTES[0];
                  setActiveMilestone(m);
                }}
              >
                <title>{globalLang === "hi" ? "प्रेरक संदेश सुनें" : "Click to view milestone celebration"}</title>
                <defs>
                  <linearGradient id="ptGrad" x1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0d9488" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <circle cx="38" cy="38" r={R} fill="none" stroke="#e2e8f0" strokeWidth="7" />
                <circle cx="38" cy="38" r={R} fill="none" stroke="url(#ptGrad)" strokeWidth="7" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset .6s ease" }} />
                <text x="38" y="44" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{pct}%</text>
              </svg>
            </div>

            <div className="pt-card">
              <div className="pt-head"><h2>{t.ptYourTasks}</h2><small>{t.ptVoiceHint}</small></div>
              <ul className="pt-tasks">
                {tasks.map((tItem) => {
                  const I = Icon[tItem.icon];
                  const d = isDone(tItem.id);
                  const warn = tItem.id === "fu" && missingDate && !d;
                  return (
                    <li key={tItem.id} className={`${d ? "is-done" : ""}${flash === tItem.id ? " is-flash" : ""}`}>
                      <span className="pt-num" aria-hidden="true">{tItem.n}</span>
                      <span className={`pt-ic pt-ic--${d ? "green" : warn ? "amber" : "teal"}`}>{d ? <Icon.check size={22} /> : <I size={22} />}</span>
                      <div><b>{tItem.title}</b><small>{tItem.sub}</small></div>
                      <button className={`pt-chip${d ? " is-ok" : warn ? " is-warn" : ""}`} onClick={() => toggleTask(tItem)} aria-pressed={d} aria-label={`Task ${tItem.n}: ${tItem.title}`}>
                        {d ? t.ptDone : warn ? t.ptNeedsAttention : t.ptMarkDone}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pt-two">
              <div className="pt-card" id="medications">
                <div className="pt-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2>{t.ptMedications}</h2>
                    <button
                      type="button"
                      className="pt-pill-scan-trigger-btn"
                      onClick={() => setIsPillScannerOpen(true)}
                      title={t.pillScanBtn}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
                        color: "#ffffff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "12.5px",
                        fontWeight: "700",
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(13, 148, 136, 0.25)",
                      }}
                    >
                      <span>📷</span>
                      <span>{t.pillScanBtn}</span>
                    </button>
                  </div>
                {plan.meds.length === 0 ? <small>{t.ptNoMedsFound}</small> : (
                  <ul className="pt-meds">
                    {plan.meds.map((m) => (
                      <li key={m.id}>
                        <span className="pt-ic pt-ic--green"><Icon.pill size={20} /></span>
                        <div>
                          {/* Medicine names and dosages strictly preserved in clinical English */}
                          <b>{m.name}{m.dose ? ` ${m.dose}` : ""}</b>
                          <small>{m.times.length ? "" : m.frequency ?? (globalLang === "hi" ? "निर्देशानुसार लें" : "Take as directed")}{m.duration ? `${m.times.length ? "" : " · "}${m.duration}` : ""}</small>
                          <div className="pt-doses">
                            {m.times.map((timeStr) => {
                              const k = `${m.id}@${timeStr}`;
                              const on = taken.has(k);
                              return (
                                <button key={k} className={`pt-dose${on ? " is-on" : ""}${pop === k ? " is-pop" : ""}${!on && nextDose?.key === k ? " is-next" : ""}`} aria-pressed={on}
                                  onClick={() => {
                                    if (on) {
                                      setTaken((s) => { const n = new Set(s); n.delete(k); return n; });
                                      if (token && token !== "demo") {
                                        api.reportDose(token, m.id, false, "app_button").catch(() => {});
                                      }
                                    } else {
                                      setTaken((s) => new Set(s).add(k));
                                      setPop(k);
                                      if (token && token !== "demo") {
                                        api.reportDose(token, m.id, true, "app_button").catch(() => {});
                                      }
                                    }
                                  }}>
                                  {on && <Icon.check size={12} />} {timeStr}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pt-card" id="appointments">
                <div className="pt-head"><h2>{t.ptAppointments}</h2></div>
                {plan.followUps.length === 0 ? <small>{t.ptNoApptsFound}</small> : plan.followUps.map((f) => (
                  <div key={f.id} className="pt-appt">
                    <span className="pt-ic pt-ic--purple"><Icon.calendar size={20} /></span>
                    <div><b>{f.what}</b><small>{f.when ?? (globalLang === "hi" ? "तारीख उपलब्ध नहीं" : "Date not provided")}{f.where ? ` · ${f.where}` : ""}</small></div>
                  </div>
                ))}
                {(missingDate || plan.followUps.length > 0) && care && (
                  <div className="pt-note"><b>{missingDate ? t.ptAskApptDate : t.ptRescheduleAppt}</b><a className="pt-btn pt-btn--line" href={`tel:${care}`}><Icon.phone size={15} /> {t.ptCallNow}</a></div>
                )}
              </div>
            </div>

            <div className="pt-card" id="instructions">
              <div className="pt-head"><h2>{t.ptInstructions}</h2></div>
              <div className="pt-instr">
                {SECTIONS.map((s) => {
                  const list = plan.instructions[s.key];
                  const I = Icon[s.icon];
                  const sectionTitle =
                    s.key === "wound_care" ? t.ptWoundCare :
                    s.key === "activity" ? t.ptActivity :
                    s.key === "diet" ? t.ptDiet :
                    t.ptWarningSigns;
                  return (
                    <button key={s.key} className={`pt-i pt-i--${s.tone}${open === s.key ? " is-open" : ""}`} onClick={() => setOpen(open === s.key ? null : s.key)} aria-expanded={open === s.key} disabled={list.length === 0}>
                      <span className={`pt-ic pt-ic--${s.tone}`}><I size={20} /></span>
                      <span><b>{sectionTitle}</b><small>{list.length ? list[0] : (globalLang === "hi" ? "कोई निर्देश नहीं" : "Nothing listed")}</small></span>
                    </button>
                  );
                })}
              </div>
              {open && <ul className="pt-full">{plan.instructions[open].map((itemText, i) => <li key={i}>{itemText}</li>)}</ul>}
            </div>
          </section>

          <aside className="pt-col">
            <div className="pt-card pt-voice">
              <div className={`pt-orb${mic.state === "on" ? " is-on" : ""}${heardNow ? " is-hearing" : ""}`}><Icon.mic size={26} /></div>
              <h2>{t.voiceAssistant}</h2>
              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}>
                <span className={`rr-voice-pill rr-voice-pill--${mic.status}`}>
                  <i className="rr-dot" /> {statusLabel}
                </span>
              </div>
              {mic.state === "on" && <>
                <div className="pt-wave" aria-hidden="true">{BARS.map((m, i) => <i key={i} style={{ height: `${6 + level * 30 * m}px` }} />)}</div>
                <p className="pt-mic-on">{heardNow ? (globalLang === "hi" ? "सुनाई दे रहा है…" : "I hear you…") : (globalLang === "hi" ? "सुन रहा है… सामान्य आवाज़ में बोलें।" : "Listening. Say “help” any time.")}</p>
              </>}
              {mic.state === "starting" && <p>{globalLang === "hi" ? "माइक्रोफ़ोन शुरू हो रहा है…" : "Starting the microphone…"}</p>}
              {mic.state === "blocked" && <><p>{t.ptMicTurnedOff}</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> {t.ptTurnOnVoice}</button></>}
              {mic.state === "off" && <><p>{globalLang === "hi" ? "आवाज़ बंद है।" : "Listening is off."}</p><button className="pt-btn pt-btn--solid" onClick={mic.enable}><Icon.mic size={17} /> {t.ptTurnOnVoice}</button></>}
              {mic.state === "unsupported" && <p>{globalLang === "hi" ? "यह ब्राउज़र वाक् पहचान का समर्थन नहीं करता।" : "This browser cannot listen. Use Chrome or Edge, or the buttons below."}</p>}
              
              {/* Dedicated Real-Time Live Transcript Area */}
              {(live || mic.transcript) && (
                <div className="pt-live-transcript" aria-live="polite" style={{ padding: "8px 12px", background: "var(--pt-50)", borderRadius: 10, textAlign: "left", fontSize: 13.5, color: "var(--pt-d)", border: "1px solid var(--line)" }}>
                  <small style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 10.5, letterSpacing: ".05em", color: "var(--pt)" }}>{t.voiceHeard}:</small>
                  <b style={{ display: "block", marginTop: 2 }}>“{live || mic.transcript}”</b>
                </div>
              )}

              <div className="pt-chat" aria-live="polite">
                {log.length === 0 && <small>{globalLang === "hi" ? "बोलकर देखें: “पहला काम हो गया”, “दवा ले ली”, “घाव साफ कर लिया”, “अगली दवा कौन सी है?”" : "Try: “task 1 done”, “I took my medicine”, “I washed my wound”, “What medicine is next?”"}</small>}
                {log.map((l, i) => <p key={i} className={`pt-msg pt-msg--${l.who}`}>{l.text}</p>)}
              </div>
              <div className="pt-set">
                <span>{t.ptSensitivity}</span>
                <button className={high ? "is-on" : ""} aria-pressed={high} onClick={() => setHigh(true)}>{t.ptHigh}</button>
                <button className={!high ? "is-on" : ""} aria-pressed={!high} onClick={() => setHigh(false)}>{t.ptStandard}</button>
              </div>
              <div className="pt-set">
                <span>{t.language}</span>
                <button className={globalLang === "en" ? "is-on" : ""} aria-pressed={globalLang === "en"} onClick={() => setGlobalLang("en")}>English</button>
                <button className={globalLang === "hi" ? "is-on" : ""} aria-pressed={globalLang === "hi"} onClick={() => setGlobalLang("hi")}>हिन्दी</button>
              </div>
              <label className="pt-switch"><input type="checkbox" checked={soundOn} onChange={(e) => { setSoundOn(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> {t.ptSpokenReplies}</label>
              {mic.state === "on" && <button className="pt-link" onClick={mic.disable}>{t.ptTurnOffListening}</button>}
              <small>{t.ptBrowserSpeechNotice}</small>
            </div>
            <div className="pt-card pt-helpbox" id="help">
              <div className="pt-head"><h2>{t.ptNeedHelp}</h2></div>
              <p>{t.ptHaveQuestion}</p>
              <button className="pt-btn pt-btn--red" onClick={() => triggerDistress("button", "critical")}><Icon.alert size={17} /> {t.ptHelpNow}</button>
              <button
                type="button"
                className="pt-btn pt-btn--solid"
                style={{ background: "linear-gradient(135deg, var(--pt) 0%, var(--pt-d) 100%)", color: "#fff", border: "none" }}
                onClick={handleCallCareTeam}
              >
                <Icon.phone size={17} /> {t.callCareTeam}
              </button>
              {care && <a className="pt-btn pt-btn--line" href={`tel:${care}`}><Icon.phone size={17} /> {t.ptCallCare}</a>}
              <button className="pt-btn pt-btn--line" onClick={() => setComposer("")}><Icon.chat size={17} /> {t.ptSendMessage}</button>
              <small>{t.ptEmergencyNotice}</small>
            </div>
            {plan.contacts.length > 0 && (
              <div className="pt-card">
                <div className="pt-head"><h2>{t.ptYourCareTeam}</h2></div>
                {plan.contacts.map((c, i) => <div key={i} className="pt-appt"><span className="pt-ic pt-ic--teal"><Icon.user size={20} /></span><div><b>{c.label}</b><small>{c.value}</small></div></div>)}
              </div>
            )}
          </aside>
        </div>
      </main>

      <nav className="pt-bottom" aria-label="Quick links">
        <a href="#home"><Icon.home size={20} />{globalLang === "hi" ? "होम" : "Home"}</a>
        <a href="#plan"><Icon.list size={20} />{t.ptRecoveryPlan}</a>
        <a href="#appointments"><Icon.calendar size={20} />{t.ptAppointments}</a>
        <a href="#help"><Icon.chat size={20} />{t.ptNeedHelp}</a>
      </nav>

      {showTools && <button className="pt-tools-btn" onClick={() => setTools((v) => !v)} aria-expanded={tools}>Demo tools</button>}
      {showTools && tools && (
        <div className="pt-tools" role="group" aria-label="Demo tools">
          <small>For a noisy room. These act exactly like speech.</small>
          <button onClick={() => simulate("task 1 done")}>Say: task 1 done</button>
          <button onClick={() => simulate("I took my medicine")}>Say: I took my medicine</button>
          <button onClick={() => simulate("दवा ले ली")}>Say (Hindi): दवा ले ली</button>
          <button onClick={() => simulate("पहला काम हो गया")}>Say (Hindi): पहला काम हो गया</button>
          <button onClick={() => simulate("what medicine is next")}>Say: what medicine is next</button>
          <button onClick={() => simulate("अगली दवा कौन सी है")}>Say (Hindi): अगली दवा कौन सी है</button>
          <button onClick={() => simulate("help")}>Say: help</button>
          <button onClick={() => simulate("मदद चाहिए")}>Say (Hindi): मदद चाहिए</button>
          <hr />
          <label><input type="checkbox" checked={simNurse} onChange={(e) => setSimNurse(e.target.checked)} /> Simulated nurse answers after 10 s <em>(labelled DEMO)</em></label>
          <label><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Pretend the hospital is offline</label>
          <hr />
          <button onClick={dueNow} disabled={!nextDose}>Next dose is due now</button>
          <button onClick={() => {
            if (token && token !== "demo") {
              api.listReminders(token).then((res) => {
                const p = res.reminders.find((r) => r.status === "scheduled" || r.status === "delivered");
                if (p) {
                  api.triggerReminder(token, p.job_id, "in_app").then(() => {
                    if (nextDose) setReminder(nextDose.key);
                    setToast(globalLang === "hi" ? "दवा का रिमाइंडर भेजा गया (ऐप सूचना)" : "Medication reminder dispatched (In-App)");
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
            dueNow();
          }} disabled={!nextDose}>Trigger in-app reminder</button>
          <button onClick={() => {
            if (token && token !== "demo") {
              api.listReminders(token).then((res) => {
                const p = res.reminders.find((r) => r.status === "scheduled" || r.status === "delivered");
                if (p) {
                  api.triggerReminder(token, p.job_id, "sms").then(() => {
                    setToast(globalLang === "hi" ? "एसएमएस रिमाइंडर भेजा गया" : "Simulated SMS reminder dispatched");
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }} disabled={!nextDose}>Simulate SMS reminder</button>
          <button onClick={() => setOffset((o) => o + 60)}>Skip ahead 1 hour</button>
          <hr />
          <b>Milestone Quotes Preview (Spoken Aloud):</b>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, margin: "6px 0" }}>
            {MILESTONE_QUOTES.map((mq) => (
              <button
                key={mq.pct}
                type="button"
                style={{ fontSize: 11, padding: "5px 6px", textAlign: "left", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => setActiveMilestone(mq)}
              >
                <span>{mq.emoji}</span>
                <span>{mq.pct}% {mq.title.en}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setTaken(new Set()); setDoneTasks(new Set()); reminded.current.clear(); snooze.current = {}; setOffset(0); setLog([]); close(); }}>Reset the demo</button>
        </div>
      )}
      {/* Motivational Milestone Celebration Modal */}
      <MilestoneCelebrationModal
        milestone={activeMilestone}
        onDismiss={() => setActiveMilestone(null)}
      />

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

      {/* AI Pill Camera Scanner Modal */}
      <PillScannerModal
        token={token}
        isOpen={isPillScannerOpen}
        onClose={() => setIsPillScannerOpen(false)}
        onDoseConfirmed={handleScannerDoseConfirmed}
        prescribedMeds={plan.meds}
      />
    </div>
  );
}
