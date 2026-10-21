/**
 * Optional sound effects for the Live Theater. OFF by default, enabled by an explicit button (which is also the
 * user gesture browsers require). Tiny WebAudio blips only; no audio files. Every call is a safe no-op if audio
 * is unavailable, disabled, or blocked.
 */
export type Sfx = "boot" | "stage" | "tick" | "agree" | "review" | "conflict" | "fail" | "approve";

type Ctor = new () => AudioContext;
const NOTES: Record<Sfx, { f: number[]; d: number; type: OscillatorType; v: number }> = {
  boot: { f: [330, 495, 660], d: 0.09, type: "square", v: 0.05 },
  stage: { f: [523, 784], d: 0.08, type: "triangle", v: 0.07 },
  tick: { f: [1200], d: 0.03, type: "square", v: 0.025 },
  agree: { f: [660, 880], d: 0.06, type: "triangle", v: 0.06 },
  review: { f: [440, 440], d: 0.11, type: "square", v: 0.05 },
  conflict: { f: [220, 165], d: 0.12, type: "sawtooth", v: 0.05 },
  fail: { f: [196, 147, 110], d: 0.14, type: "sawtooth", v: 0.07 },
  approve: { f: [523, 659, 784, 1046], d: 0.11, type: "triangle", v: 0.08 },
};

export class SoundFx {
  private ctx: AudioContext | null = null;
  private on = false;
  private last: Partial<Record<Sfx, number>> = {};

  get enabled(): boolean { return this.on; }

  /** Call from a click handler. Returns true if sound is now really available. */
  async enable(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const C = w.AudioContext ?? w.webkitAudioContext;
    if (!C) return false;
    try {
      this.ctx ??= new C();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.on = this.ctx.state === "running";
    } catch { this.on = false; }
    if (this.on) this.play("boot");
    return this.on;
  }
  disable(): void { this.on = false; }

  play(kind: Sfx): void {
    const c = this.ctx;
    if (!this.on || !c || c.state !== "running") return;
    const now = c.currentTime;
    const gap = kind === "tick" ? 0.12 : 0.05;
    if (now - (this.last[kind] ?? -1) < gap) return; // never machine-gun
    this.last[kind] = now;
    const n = NOTES[kind];
    n.f.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), s = now + i * n.d;
      o.type = n.type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(n.v, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + n.d * 0.95);
      o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + n.d);
    });
  }
}

/** Which sound a real event deserves (or null). */
export function sfxFor(type: string, payload: Record<string, unknown>): Sfx | null {
  switch (type) {
    case "parse.done": case "extract.a.done": case "extract.b.done": case "ground.a.done": case "ground.b.done": case "reconcile.done": return type.startsWith("ground") && Number(payload.fail) > 0 ? "conflict" : "stage";
    case "extract.a.field": case "extract.b.field": return "tick";
    case "reconcile.field": return payload.status === "agreed" ? "agree" : payload.status === "review" ? "review" : "conflict";
    case "review.ready": return "review";
    case "extract.a.failed": case "extract.b.failed": case "run.failed": return "fail";
    default: return null;
  }
}
