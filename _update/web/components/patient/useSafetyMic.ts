"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceController, findRecognitionCtor, type VoiceState } from "@/lib/voice/controller";
import type { Detection } from "@/lib/voice/phrases";
import { unlockAudio } from "@/lib/voice/speak";

export type { VoiceState };
export interface Heard { text: string; final: boolean; at: number }
export interface SafetyMicHandlers {
  onDistress(d: Detection, heard: string, info: { escalation: boolean }): void;
  onTook(heard: string): void;
}

const OFF_KEY = "rr-safety-mic-off";

/** Asks for the microphone once so failures are specific (denied vs. no device). Tracks are stopped immediately. */
async function probeMic(): Promise<"denied" | "no-mic" | null> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) return null;
  try {
    const stream = await md.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const n = (e as { name?: string } | null)?.name ?? "";
    if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return "denied";
    if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") return "no-mic";
    return null;
  }
}

/**
 * Hands-free safety listening. After the person has allowed the microphone once, it starts by itself on
 * every visit and keeps itself alive (restarts, backoff, watchdog) while the page is open.
 * All the logic lives in VoiceController (unit-tested); this hook only connects it to React.
 */
export function useSafetyMic(handlers: SafetyMicHandlers) {
  const [state, setState] = useState<VoiceState>("idle");
  const [detail, setDetail] = useState("");
  const [heard, setHeard] = useState<Heard | null>(null);
  const ctl = useRef<VoiceController | null>(null);
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const secure = typeof window === "undefined" ? true : window.isSecureContext !== false;
    const c = new VoiceController(
      { ctor: findRecognitionCtor(window), secureContext: secure, probe: probeMic },
      {
        onState: (s, d) => { setState(s); setDetail(d); },
        onHeard: (text, final) => setHeard({ text, final, at: Date.now() }),
        onDistress: (d, t, i) => h.current.onDistress(d, t, i),
        onTook: (t) => h.current.onTook(t),
      },
    );
    ctl.current = c;
    setState(c.getState());

    let off = false;
    try { off = localStorage.getItem(OFF_KEY) === "1"; } catch { /* storage blocked */ }
    let cancelled = false;
    if (off) {
      c.stop();
    } else if (c.getState() === "idle") {
      // Start by itself only when the browser already allows it; otherwise ask for the one required tap.
      const perms = (navigator as unknown as { permissions?: { query(d: { name: string }): Promise<{ state: string }> } }).permissions;
      if (perms?.query) {
        perms.query({ name: "microphone" })
          .then((p) => { if (cancelled) return; if (p.state === "granted") void c.start(); else if (p.state === "denied") void c.start(); else c.markNeedsTap(); })
          .catch(() => { if (!cancelled) c.markNeedsTap(); });
      } else {
        c.markNeedsTap();
      }
    }

    const wake = () => { if (document.visibilityState === "visible") c.kick(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      c.dispose(); // invalidates this controller's sessions, so a StrictMode remount cannot leave a stale recognizer
      ctl.current = null;
    };
  }, []);

  /** Must be called from a click/tap: it is the gesture browsers require. */
  const enable = useCallback(() => {
    try { localStorage.removeItem(OFF_KEY); } catch { /* ignore */ }
    unlockAudio();
    void ctl.current?.start();
  }, []);
  const disable = useCallback(() => {
    try { localStorage.setItem(OFF_KEY, "1"); } catch { /* ignore */ }
    ctl.current?.stop();
  }, []);
  const simulate = useCallback((text: string) => ctl.current?.simulate(text), []);
  const rearm = useCallback(() => ctl.current?.rearm(), []);
  const speakStart = useCallback((text: string) => ctl.current?.speakStart(text), []);
  const speakEnd = useCallback((ms?: number) => ctl.current?.speakEnd(ms), []);

  return { state, detail, heard, enable, disable, simulate, rearm, speakStart, speakEnd };
}
