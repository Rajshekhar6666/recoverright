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
  const lastTranscript = useRef("");
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

  // Request audio hardware with Auto Gain Control, Noise Suppression & Echo Cancellation
  const initAudioStream = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      if (!mediaStream.current || !mediaStream.current.active) {
        mediaStream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            noiseSuppression: true,
            echoCancellation: true,
          },
        });
      }
    } catch (e) {
      // Permission denied or device unavailable
      setState("blocked");
      setStatus("mic_unavailable");
    }
  }, []);

  const launch = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState("unsupported");
      setStatus("error");
      return;
    }

    void initAudioStream();

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 4;
    r.lang = langRef.current;

    const arm = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      // Give a generous 15 second buffer to allow natural spoken pauses without aborting
      watchdog.current = setTimeout(() => {
        if (want.current && rec.current === r) {
          try { r.abort(); } catch { /* ignore */ }
        }
      }, 15000);
    };

    r.onstart = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      setState("on");
      setStatus("listening");
    };

    r.onresult = (e) => {
      setLastHeardAt(Date.now());
      arm();
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

      // If speech is still interim, set a natural 1100ms pause timer to finalize if no further input
      if (!hasFinal && latestText) {
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        pauseTimer.current = setTimeout(() => {
          if (lastTranscript.current) {
            setStatus("processing");
            cb.current(lastTranscript.current, true, []);
            setTimeout(() => setStatus("listening"), 1200);
          }
        }, 1200);
      } else if (hasFinal) {
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        setStatus("processing");
        setTimeout(() => setStatus("listening"), 1000);
      }
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        want.current = false;
        setState("blocked");
        setStatus("mic_unavailable");
      } else if (e.error !== "no-speech") {
        setStatus("error");
      }
    };

    r.onend = () => {
      if (want.current && rec.current === r) {
        // Safe 200ms restart buffer to prevent Chromium InvalidStateError
        setTimeout(() => {
          if (want.current && rec.current === r) {
            try {
              r.start();
              arm();
            } catch {
              /* already active or recreating */
            }
          }
        }, 200);
      }
    };

    rec.current = r;
    try {
      r.start();
      arm();
      void grabLock();
    } catch {
      setState("blocked");
      setStatus("mic_unavailable");
    }
  }, [grabLock, initAudioStream]);

  const enable = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    want.current = true;
    launch();
  }, [launch]);

  const disable = useCallback(() => {
    want.current = false;
    const r = rec.current;
    rec.current = null;
    try { r?.stop(); } catch { /* not running */ }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((t) => t.stop());
      mediaStream.current = null;
    }
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
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach((t) => t.stop());
        mediaStream.current = null;
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
