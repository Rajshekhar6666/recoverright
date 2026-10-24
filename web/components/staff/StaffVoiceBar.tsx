"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import {
  parseBilingualCommand,
  resolveStaffNavigation,
  resolveTaskFromUtterance,
  speakConfirmation,
  type StaffPatientRef,
  type TaskContextItem,
  type VoiceStatus,
} from "@/lib/voiceEngine";

interface Props {
  tasks?: TaskContextItem[];
  activePatient?: StaffPatientRef | null;
  patients?: StaffPatientRef[];
  runs?: any[];
  onNavigatePatient?: (target: string) => void;
  onNavigateUrl?: (url: string) => void;
  onOpenAddDoc?: () => void;
  onApprovePlan?: () => void;
  onCompleteTask?: (target: string) => void;
  onResolveTask?: (task: TaskContextItem, action: "complete" | "reset") => Promise<void>;
  onResolveAllTasks?: (tasks: TaskContextItem[]) => Promise<void>;
  onQueryCarePlan?: () => void;
}

export default function StaffVoiceBar({
  tasks,
  activePatient,
  patients: initialPatients,
  runs: initialRuns,
  onNavigatePatient,
  onNavigateUrl,
  onOpenAddDoc,
  onApprovePlan,
  onCompleteTask,
  onResolveTask,
  onResolveAllTasks,
  onQueryCarePlan,
}: Props) {
  const router = useRouter();
  const { lang, setLang, t, speechLocale } = useLanguage();
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [patients, setPatients] = useState<StaffPatientRef[]>(initialPatients || []);
  const [runs, setRuns] = useState<any[]>(initialRuns || []);

  const recRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef("");

  // Fetch patient directory and runs if not provided
  useEffect(() => {
    let alive = true;
    if (!initialPatients || initialPatients.length === 0) {
      api.listPatients()
        .then((res) => {
          if (alive && res?.items) setPatients(res.items);
        })
        .catch(() => {});
    } else {
      setPatients(initialPatients);
    }

    if (!initialRuns || initialRuns.length === 0) {
      api.listRuns()
        .then((res) => {
          if (alive && res) setRuns(res);
        })
        .catch(() => {});
    } else {
      setRuns(initialRuns);
    }

    return () => {
      alive = false;
    };
  }, [initialPatients, initialRuns]);

  const stopListening = useCallback(() => {
    setActive(false);
    setStatus("ready");
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      recRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const handleCommand = useCallback(
    async (text: string) => {
      setStatus("processing");
      const cmd = parseBilingualCommand(text, lang);

      // Check task resolution if tasks are present and command relates to tasks
      if (
        tasks &&
        tasks.length > 0 &&
        (cmd.type === "task_complete" ||
          cmd.type === "task_negation" ||
          cmd.type === "task_future" ||
          cmd.type === "task_question")
      ) {
        setStatus("command_recognized");
        const res = resolveTaskFromUtterance(text, tasks, lang);

        if (res.status === "matched" && res.matchedTask && onResolveTask) {
          await onResolveTask(res.matchedTask, "complete");
          setStatus("completed");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        } else if (res.status === "all_matched" && res.allTasks && onResolveAllTasks) {
          await onResolveAllTasks(res.allTasks);
          setStatus("completed");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        } else if (res.status === "already_completed") {
          setStatus("completed");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        } else if (res.status === "ambiguous") {
          setStatus("clarification_required");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        } else if (res.status === "negation" || res.status === "future_intention" || res.status === "question") {
          setStatus("completed");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        } else {
          setStatus("not_understood");
          setFeedback(res.uiFeedback[lang]);
          speakConfirmation(res.speechResponse[lang], lang);
        }

        setTimeout(() => {
          setStatus("listening");
          setFeedback(null);
        }, 3500);
        return;
      }

      // Check staff specific direct actions (e.g. Add Document, Approve Plan)
      if (cmd.type === "staff_add_doc" && onOpenAddDoc) {
        setStatus("command_recognized");
        onOpenAddDoc();
        const msg = lang === "hi" ? "दस्तावेज़ अपलोड डायलॉग खोला गया।" : "Opened document upload dialog.";
        setFeedback(msg);
        speakConfirmation(msg, lang);
        setTimeout(() => setStatus("listening"), 3000);
        return;
      }

      if (cmd.type === "staff_approve" && onApprovePlan) {
        setStatus("command_recognized");
        onApprovePlan();
        const msg = lang === "hi" ? "देखभाल योजना स्वीकृति विंडो खोली गई।" : "Opened plan approval window.";
        setFeedback(msg);
        speakConfirmation(msg, lang);
        setTimeout(() => setStatus("listening"), 3000);
        return;
      }

      // Staff Voice Navigation & Resource Resolver
      const navRes = resolveStaffNavigation(text, {
        patients,
        activePatient,
        runs,
        lang,
      });

      if (navRes.status === "navigated") {
        setStatus("navigation_completed");
        setFeedback(navRes.uiFeedback[lang]);
        speakConfirmation(navRes.speechResponse[lang], lang);

        if (navRes.targetUrl) {
          if (onNavigateUrl) {
            onNavigateUrl(navRes.targetUrl);
          } else {
            router.push(navRes.targetUrl);
          }
        }

        setTimeout(() => {
          setStatus("listening");
          setFeedback(null);
        }, 3800);
        return;
      }

      if (navRes.status === "query_answered") {
        setStatus("completed");
        setFeedback(navRes.uiFeedback[lang]);
        speakConfirmation(navRes.speechResponse[lang], lang);

        if (navRes.targetUrl) {
          if (onNavigateUrl) {
            onNavigateUrl(navRes.targetUrl);
          } else {
            router.push(navRes.targetUrl);
          }
        }

        setTimeout(() => {
          setStatus("listening");
          setFeedback(null);
        }, 3800);
        return;
      }

      if (navRes.status === "ambiguous" || navRes.status === "clarification_needed") {
        setStatus("clarification_required");
        setFeedback(navRes.uiFeedback[lang]);
        speakConfirmation(navRes.speechResponse[lang], lang);
        setTimeout(() => setStatus("listening"), 4500);
        return;
      }

      if (navRes.status === "not_found") {
        setStatus("patient_not_found");
        setFeedback(navRes.uiFeedback[lang]);
        speakConfirmation(navRes.speechResponse[lang], lang);
        setTimeout(() => setStatus("listening"), 3500);
        return;
      }

      // Fallback
      setStatus("not_understood");
      const notUnderstoodMsg = navRes.speechResponse[lang];
      setFeedback(navRes.uiFeedback[lang]);
      speakConfirmation(notUnderstoodMsg, lang);
      setTimeout(() => setStatus("listening"), 3000);
    },
    [
      lang,
      tasks,
      patients,
      activePatient,
      runs,
      onResolveTask,
      onResolveAllTasks,
      onOpenAddDoc,
      onApprovePlan,
      onNavigateUrl,
      router,
    ]
  );

  const startListening = useCallback(async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatus("mic_unavailable");
      setFeedback(t.voiceMicUnavailable);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
    } catch {
      setStatus("mic_unavailable");
      setFeedback(t.voiceMicUnavailable);
      return;
    }

    setActive(true);
    setStatus("listening");
    setTranscript("");
    setFeedback(null);

    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = speechLocale;

    r.onresult = (e: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript;
        } else {
          interimTranscript += e.results[i][0].transcript;
        }
      }

      const spoken = (finalTranscript || interimTranscript).trim();
      if (spoken) {
        setTranscript(spoken);
        lastTranscriptRef.current = spoken;

        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        if (finalTranscript.trim()) {
          pauseTimerRef.current = setTimeout(() => {
            void handleCommand(finalTranscript.trim());
          }, 600);
        } else {
          pauseTimerRef.current = setTimeout(() => {
            if (lastTranscriptRef.current) {
              void handleCommand(lastTranscriptRef.current);
            }
          }, 1400);
        }
      }
    };

    r.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        setStatus("mic_unavailable");
        setActive(false);
      } else if (e.error !== "no-speech") {
        setStatus("error");
      }
    };

    r.onend = () => {
      if (active && recRef.current === r) {
        setTimeout(() => {
          if (active && recRef.current === r) {
            try { r.start(); } catch { /* ignore */ }
          }
        }, 200);
      }
    };

    recRef.current = r;
    try {
      r.start();
    } catch {
      setStatus("error");
    }
  }, [speechLocale, lang, t.voiceMicUnavailable, handleCommand, active]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const statusLabel = {
    ready: t.voiceReady,
    listening: t.voiceListening,
    processing: t.voiceProcessing,
    command_recognized: t.voiceCommandRecognized,
    navigation_completed: t.voiceNavigationCompleted || "Navigation completed",
    completed: t.voiceCompleted,
    clarification_needed: t.voiceClarificationNeeded,
    clarification_required: t.voiceClarificationRequired || t.voiceClarificationNeeded,
    patient_not_found: t.voicePatientNotFound || "Patient not found",
    not_understood: t.voiceNotUnderstood,
    mic_unavailable: t.voiceMicUnavailable,
    error: t.voiceError,
  }[status] || status;

  return (
    <div className="rr-voice-bar" role="region" aria-label="Staff Voice Assistant">
      <div className="rr-voice-main">
        <button
          type="button"
          className={`rr-voice-toggle ${active ? "is-active" : ""}`}
          onClick={active ? stopListening : startListening}
          aria-label={active ? t.voiceStopListening : t.voiceStartListening}
          title={active ? t.voiceStopListening : t.voiceStartListening}
        >
          <span className="rr-voice-icon">
            <Icon.mic size={18} />
          </span>
          <span className="rr-voice-title">{t.voiceAssistant}</span>
        </button>

        <span className={`rr-voice-pill rr-voice-pill--${status}`}>
          <i className="rr-dot" /> {statusLabel}
        </span>

        {active && transcript && (
          <div className="rr-voice-transcript">
            <small>{t.voiceHeard}:</small>
            <b>“{transcript}”</b>
          </div>
        )}

        <div className="rr-voice-right">
          <span style={{ fontSize: "0.74rem", color: "#64748b", marginRight: 8 }}>
            {t.voiceStaffNavHint}
          </span>
          <div className="rr-lang-toggle-small">
            <button
              type="button"
              className={lang === "en" ? "is-active" : ""}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={lang === "hi" ? "is-active" : ""}
              onClick={() => setLang("hi")}
            >
              हिन्दी
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div
            className="rr-voice-feedback"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Icon.spark size={14} />
            <span>{feedback}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
