/**
 * Audible feedback for the patient app: spoken replies (speechSynthesis) and an alarm tone (WebAudio).
 * Both are best-effort: browsers may block sound until the person has tapped something once.
 * Every function reports honestly whether sound could actually be produced, so the UI can fall back to
 * a visible message instead of silently pretending.
 */
export type SpeakResult = "spoken" | "unsupported" | "blocked" | "error";

interface SynthLike { speak(u: unknown): void; cancel(): void; getVoices(): { lang: string; name: string }[] }
type UtteranceCtor = new (text: string) => { lang: string; rate: number; pitch: number; volume: number; voice: unknown; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };

function synth(): { s: SynthLike; U: UtteranceCtor } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: UtteranceCtor };
  return w.speechSynthesis && w.SpeechSynthesisUtterance ? { s: w.speechSynthesis, U: w.SpeechSynthesisUtterance } : null;
}

export function canSpeak(): boolean { return synth() !== null; }

export function cancelSpeech(): void {
  try { synth()?.s.cancel(); } catch { /* ignore */ }
}

export function speak(text: string, opts: { lang?: string; rate?: number } = {}): Promise<SpeakResult> {
  const sy = synth();
  if (!sy) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: SpeakResult) => { if (!done) { done = true; clearTimeout(guard); resolve(r); } };
    // Some browsers never fire end/error; do not leave the microphone muted forever.
    const guard = setTimeout(() => finish("error"), 3000 + text.length * 120);
    try {
      sy.s.cancel();
      const u = new sy.U(text);
      const lang = opts.lang ?? "en-IN";
      u.lang = lang; u.rate = opts.rate ?? 0.95; u.pitch = 1; u.volume = 1;
      const voices = sy.s.getVoices();
      u.voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
      u.onend = () => finish("spoken");
      u.onerror = (e) => finish(e?.error === "not-allowed" ? "blocked" : e?.error === "canceled" || e?.error === "interrupted" ? "spoken" : "error");
      sy.s.speak(u);
    } catch { finish("error"); }
  });
}

type AudioCtxCtor = new () => AudioContext;
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const w = window as unknown as { AudioContext?: AudioCtxCtor; webkitAudioContext?: AudioCtxCtor };
    const C = w.AudioContext ?? w.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  return ctx;
}

/** Call from inside a click/tap handler so later alarms are allowed to play. */
export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

/** A short two-tone alarm. Resolves true only if the audio context is actually running. */
export async function playAlarm(severity: "critical" | "concern" = "critical"): Promise<boolean> {
  const c = audio();
  if (!c) return false;
  if (c.state === "suspended") { try { await c.resume(); } catch { return false; } }
  if (c.state !== "running") return false;
  const beeps = severity === "critical" ? 4 : 2;
  const t0 = c.currentTime + 0.02;
  for (let i = 0; i < beeps; i++) {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = "square"; o.frequency.value = i % 2 === 0 ? 880 : 660;
    const s = t0 + i * 0.22;
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.18, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + 0.2);
  }
  return true;
}
