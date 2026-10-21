"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type MicState = "starting" | "on" | "off" | "blocked" | "unsupported";

interface Res { isFinal: boolean; 0: { transcript: string } }
interface Rec {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Res> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
type RecCtor = new () => Rec;

const DISTRESS = /\b(help( me)?|emergency|unwell|not (feeling|doing) (well|good)|(don'?t|do not) feel (well|good)|feel(ing)? (sick|bad|dizzy|faint|weak|worse)|chest (pain|tightness)|can'?t breathe|trouble breathing|short of breath|heavy bleeding|bleeding a lot|severe pain|call (a |the |my )?(doctor|nurse|ambulance))\b|\b(madad|bachao|tabiyat kharab)\b/i;
const NEGATED = /\b(no|not|without|stopped)\s+(\w+\s+)?(pain|bleeding|dizz\w*)/i;
const TOOK = /\b(i (have )?(took|taken)|took (it|my (medicine|tablet|pill)s?)|taken (it|my (medicine|tablet|pill)s?))\b/i;
const KEY = "rr-safety-mic-off";

/**
 * Keeps the microphone open and listens for a distress phrase, so the patient never has to press anything.
 * Browser limits: permission needs one tap the first time, and listening stops when the page is closed or the phone is locked.
 */
export function useSafetyMic(onDistress: (heard: string) => void, onTook: () => void) {
  const [state, setState] = useState<MicState>("starting");
  const want = useRef(true);
  const rec = useRef<Rec | null>(null);
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const last = useRef(0);
  const cbs = useRef({ onDistress, onTook });
  cbs.current = { onDistress, onTook };

  const stopLock = () => { void lock.current?.release().catch(() => undefined); lock.current = null; };
  const grabLock = useCallback(async () => {
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } };
      if (nav.wakeLock && !lock.current) lock.current = await nav.wakeLock.request("screen");
    } catch { /* not allowed: listening still works while the screen is on */ }
  }, []);

  const begin = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setState("unsupported"); return; }
    want.current = true;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true; // react while the sentence is still being spoken
    r.lang = "en-IN";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const said = String(e.results[i][0]?.transcript ?? "").trim();
        if (!said) continue;
        if (DISTRESS.test(said) && !NEGATED.test(said) && Date.now() - last.current > 20000) {
          last.current = Date.now();
          cbs.current.onDistress(said);
        } else if (e.results[i].isFinal && TOOK.test(said)) cbs.current.onTook();
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { want.current = false; setState("blocked"); }
    };
    r.onend = () => { // browsers end a session every so often: reopen at once
      if (want.current) setTimeout(() => { try { r.start(); } catch { /* already running */ } }, 250);
    };
    rec.current = r;
    try { r.start(); setState("on"); void grabLock(); } catch { setState("blocked"); }
  }, [grabLock]);

  const enable = useCallback(() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } begin(); }, [begin]);
  const disable = useCallback(() => {
    want.current = false; rec.current?.stop(); stopLock(); setState("off");
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let off = false;
    try { off = localStorage.getItem(KEY) === "1"; } catch { /* ignore */ }
    if (off) setState("off"); else begin(); // tries to start on its own; if the browser wants a tap it ends up "blocked"
    const vis = () => { if (document.visibilityState === "visible" && want.current) void grabLock(); };
    document.addEventListener("visibilitychange", vis);
    return () => { want.current = false; rec.current?.stop(); stopLock(); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, enable, disable };
}
