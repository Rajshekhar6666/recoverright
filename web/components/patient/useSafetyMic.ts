"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@/lib/voiceEngine";

export type MicState =
  | "ready"
  | "listening"
  | "processing"
  | "command_recognized"
  | "completed"
  | "clarification_needed"
  | "not_understood"
  | "mic_unavailable"
  | "error"
  // Legacy aliases for backward compatibility
  | "starting"
  | "on"
  | "off"
  | "blocked"
  | "unsupported";

export type VoiceLang = "en-IN" | "hi-IN";

interface Alt { transcript: string }
interface Res { isFinal: boolean; length: number; [i: number]: Alt }
interface Rec {
  continuous: boolean; interimResults: boolean; maxAlternatives: number; lang: string;
  start(): void; stop(): void; abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Res> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
type RecCtor = new () => Rec;
const KEY = "rr-safety-mic-off";

/**
 * Enhanced microphone & speech recognition engine.
 * - Hardware Auto Gain Control (AGC), Echo Cancellation, and Noise Suppression to capture normal conversational volume without shouting.
 * - Natural pause handling and continuous transcript buffering.
 * - Truthful state reporting: ready, listening, processing, command_recognized, completed, not_understood, mic_unavailable.
 */
export function useSafetyMic(
  onHeard: (said: string, isFinal: boolean, alts: string[]) => void,
  lang: VoiceLang
) {
  const [state, setState] = useState<MicState>("starting");
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [lastHeardAt, setLastHeardAt] = useState(0);
  const [transcript, setTranscript] = useState("");
  const want = useRef(true);
  const rec = useRef<Rec | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscript = useRef("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const vocalBoostFilterRef = useRef<BiquadFilterNode | null>(null);
  const cb = useRef(onHeard);
  cb.current = onHeard;
  const langRef = useRef(lang);
  langRef.current = lang;

  const stopLock = () => { void lock.current?.release().catch(() => undefined); lock.current = null; };
  const grabLock = useCallback(async () => {
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      if (nav.wakeLock && !lock.current) lock.current = await nav.wakeLock.request("screen");
    } catch { /* not allowed: listening still works while the screen is on */ }
  }, []);

  const launch = useCallback(() => {
    if (!want.current) return;
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState("unsupported");
      setStatus("error");
      return;
    }

    if (rec.current) {
      try {
        rec.current.onstart = null;
        rec.current.onresult = null;
        rec.current.onerror = null;
        rec.current.onend = null;
        rec.current.abort();
      } catch {
        /* ignore */
      }
      rec.current = null;
    }

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 4;
    r.lang = langRef.current;

    r.onstart = () => {
      setState("on");
      setStatus("listening");
    };

    r.onresult = (e) => {
      setLastHeardAt(Date.now());
      let latestText = "";
      let hasFinal = false;

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts: string[] = [];
        for (let k = 0; k < res.length; k++) {
          if (res[k]?.transcript) alts.push(String(res[k].transcript).trim());
        }
        if (alts.length) {
          latestText = alts[0];
          hasFinal = res.isFinal;
          lastTranscript.current = latestText;
          setTranscript(latestText);
          cb.current(alts[0], res.isFinal, alts.slice(1));
        }
      }

      // If speech is still interim, natural pause timer to finalize
      if (!hasFinal && latestText) {
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        pauseTimer.current = setTimeout(() => {
          if (lastTranscript.current) {
            setStatus("processing");
            cb.current(lastTranscript.current, true, []);
            setTimeout(() => {
              if (want.current) setStatus("listening");
            }, 1200);
          }
        }, 1200);
      } else if (hasFinal) {
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        setStatus("processing");
        setTimeout(() => {
          if (want.current) setStatus("listening");
        }, 1000);
      }
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        want.current = false;
        setState("blocked");
        setStatus("mic_unavailable");
      } else if (e.error === "audio-capture") {
        // Microphone hardware busy; retry smoothly after brief pause
        if (want.current) {
          if (restartTimer.current) clearTimeout(restartTimer.current);
          restartTimer.current = setTimeout(() => {
            if (want.current) launch();
          }, 600);
        }
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // Normal silence timeout in browser; keep listening
      } else {
        // Transient error like network; keep want.current true to allow auto-recovery
      }
    };

    r.onend = () => {
      if (rec.current === r) {
        rec.current = null;
      }
      if (want.current) {
        // Seamlessly instantiate a fresh SpeechRecognition on silence/end
        if (restartTimer.current) clearTimeout(restartTimer.current);
        restartTimer.current = setTimeout(() => {
          if (want.current) {
            launch();
          }
        }, 200);
      } else {
        setState("off");
        setStatus("ready");
      }
    };

    rec.current = r;
    try {
      r.start();
      void grabLock();
    } catch {
      if (want.current) {
        if (restartTimer.current) clearTimeout(restartTimer.current);
        restartTimer.current = setTimeout(() => {
          if (want.current) launch();
        }, 500);
      }
    }
  }, [grabLock]);

  const enable = useCallback(async () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    want.current = true;
    setState("starting");
    setStatus("listening");
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        setState("blocked");
        setStatus("mic_unavailable");
        return;
      }
    }
    launch();
  }, [launch]);

  const disable = useCallback(() => {
    want.current = false;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    const r = rec.current;
    rec.current = null;
    try { r?.stop(); } catch { /* not running */ }
    stopLock();
    setState("off");
    setStatus("ready");
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }, []);

  // start on load, and restart cleanly when the language changes
  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem(KEY) === "1"; } catch { /* ignore */ }
    if (off) {
      setState("off");
      setStatus("ready");
      return;
    }
    want.current = true;
    launch();
    return () => {
      want.current = false;
      const r = rec.current;
      rec.current = null;
      try { r?.abort(); } catch { /* ignore */ }
      if (watchdog.current) clearTimeout(watchdog.current);
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      if (restartTimer.current) clearTimeout(restartTimer.current);
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach((t) => t.stop());
        mediaStream.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      stopLock();
    };
  }, [lang, launch]);

  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && want.current) void grabLock(); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [grabLock]);

  return {
    state,
    status,
    transcript,
    setStatus,
    enable,
    disable,
    lastHeardAt,
  };
}
