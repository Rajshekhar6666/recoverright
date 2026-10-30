"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@/lib/voiceEngine";

export type MicState = "starting" | "on" | "off" | "blocked" | "unsupported";
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
 * Robust, lightweight continuous speech recognition engine.
 * Keeps the microphone open and hands every phrase (partial and final, with the browser's alternative guesses) to onHeard immediately without buffering delay.
 * Restarts within 100 ms when the browser finishes a phrase.
 */
export function useSafetyMic(onHeard: (said: string, isFinal: boolean, alts: string[]) => void, lang: VoiceLang) {
  const [state, setState] = useState<MicState>("starting");
  const [status, setStatus] = useState<VoiceStatus>("listening");
  const [lastHeardAt, setLastHeardAt] = useState(0);
  const [transcript, setTranscript] = useState("");
  const want = useRef(true);
  const rec = useRef<Rec | null>(null);
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onHeard);
  cb.current = onHeard;
  const langRef = useRef(lang);
  langRef.current = lang;

  const stopLock = () => { void lock.current?.release().catch(() => undefined); lock.current = null; };
  const grabLock = useCallback(async () => {
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      if (nav.wakeLock && !lock.current) lock.current = await nav.wakeLock.request("screen");
    } catch { /* screen wakeLock optional */ }
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
      } catch { /* ignore */ }
      rec.current = null;
    }

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 4;
    r.lang = langRef.current;

    const arm = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      // Continuous watchdog so speech service stays alive
      watchdog.current = setTimeout(() => {
        if (want.current && rec.current === r) {
          try { r.abort(); } catch { /* ignore */ }
        }
      }, 10000);
    };

    r.onstart = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      setState("on");
      setStatus("listening");
    };

    r.onresult = (e) => {
      setLastHeardAt(Date.now());
      arm();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts: string[] = [];
        for (let k = 0; k < res.length; k++) {
          if (res[k]?.transcript) alts.push(String(res[k].transcript).trim());
        }
        if (alts.length) {
          setTranscript(alts[0]);
          cb.current(alts[0], res.isFinal, alts.slice(1));
        }
      }
    };

    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        want.current = false;
        setState("blocked");
        setStatus("mic_unavailable");
      }
    };

    r.onend = () => {
      if (want.current && rec.current === r) {
        setTimeout(() => {
          if (want.current) {
            launch();
          }
        }, 80);
      } else {
        setState("off");
        setStatus("ready");
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
  }, [grabLock]);

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
      stopLock();
    };
  }, [lang, launch]);

  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible" && want.current) void grabLock(); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [grabLock]);

  return { state, status, transcript, setStatus, enable, disable, lastHeardAt };
}
