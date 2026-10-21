/**
 * VoiceController: a framework-free, fully testable wrapper around the browser SpeechRecognition API.
 *
 * It exists to fix the failure modes of the old hook (see README, "Voice: what was wrong"):
 *  - every recognizer session carries a generation number, so a stale session (React StrictMode double
 *    mount, a restart racing a stop) can never restart itself or deliver results;
 *  - "listening" is only reported once the browser says audio has really started, never optimistically;
 *  - errors are classified: permission denied / no microphone / insecure page / network / benign;
 *    a failing service backs off exponentially and finally stops with an honest error instead of
 *    looping every 250 ms while still claiming to listen;
 *  - phrases are judged on a short rolling window, so "I feel" + "unwell" split across two results still fires;
 *  - one "episode" per emergency: repeats don't spam, a more serious phrase escalates, and after the
 *    person dismisses the alert, listening re-arms IMMEDIATELY (the old 20 s cooldown swallowed real emergencies);
 *  - the app's own speech is filtered by TEXT overlap (not by muting), so the microphone never re-triggers on the
 *    app saying "help", yet a person who speaks over the app ("I can't breathe") is still heard;
 *  - sessions are recycled before the browser silently kills them, and a watchdog catches stuck starts.
 */
import { detectDistress, detectTookMedicine, normalize, type Detection, type Severity } from "./phrases";

export type VoiceState =
  | "idle"          // created, nothing requested yet
  | "starting"      // start() called, waiting for the browser to open the microphone
  | "listening"     // audio is really flowing
  | "reconnecting"  // session ended or the speech service failed; retrying with backoff
  | "needs-tap"     // the browser wants a user gesture (or permission prompt) before it will listen
  | "blocked"       // microphone permission was denied
  | "no-mic"        // no microphone found
  | "insecure"      // page is not https/localhost, so browsers refuse microphone access
  | "unsupported"   // this browser has no speech recognition
  | "error"         // repeated failures; stopped on purpose, a tap retries
  | "off";          // the person turned listening off

/** The subset of the SpeechRecognition interface we use. */
export interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  abort?(): void;
  onstart: ((e?: unknown) => void) | null;
  onaudiostart: ((e?: unknown) => void) | null;
  onsoundstart: ((e?: unknown) => void) | null;
  onspeechstart: ((e?: unknown) => void) | null;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error?: string; message?: string }) => void) | null;
  onend: ((e?: unknown) => void) | null;
}
export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
}
export type RecognitionCtor = new () => RecognitionLike;

export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface VoiceCallbacks {
  onState(state: VoiceState, detail: string): void;
  /** Every transcript fragment, interim or final, for live "I heard ..." feedback. */
  onHeard(text: string, final: boolean): void;
  /** Fired once per emergency episode, and again only if the situation escalates to critical. */
  onDistress(d: Detection, heard: string, info: { escalation: boolean }): void;
  onTook(heard: string): void;
}

export interface VoiceOptions {
  ctor: RecognitionCtor | null;
  lang?: string;
  timers?: Scheduler;
  /** Asks the browser for the microphone once (so errors are specific). Resolves to a failure code, or null if fine/unknown. */
  probe?: () => Promise<"denied" | "no-mic" | null>;
  /** False when the page cannot use the microphone at all (not https/localhost). */
  secureContext?: boolean;
}

const SESSION_RECYCLE_MS = 100_000;   // restart before Chrome silently ends/stalls a long session
const START_STUCK_MS = 9_000;         // "starting" for this long means the browser never opened the mic
const EPISODE_MS = 25_000;            // the same emergency repeated inside this window is one episode
const WINDOW_MS = 8_000;              // rolling transcript window for phrases split across results
const MAX_FAILURES = 6;               // consecutive instant deaths (not network) before we stop and say so
const NETWORK_BACKOFF_MAX_MS = 10_000;

const rank = (s: Severity) => (s === "critical" ? 2 : 1);

export class VoiceController {
  private readonly t: Scheduler;
  private readonly lang: string;
  private rec: RecognitionLike | null = null;
  private gen = 0;
  private want = false;
  private disposed = false;
  private state: VoiceState = "idle";
  private detail = "";

  private failures = 0;            // consecutive sessions that died without ever proving they were alive
  private networkFails = 0;       // consecutive speech-service/network errors: retried forever, with capped backoff
  private failureCounted = false; // this session's failure was already counted (avoid double counting error + end)
  private sessionStart = 0;
  private lastResultAt = 0;
  private sawResult = false;
  private sessionConfirmed = false;   // did the CURRENT session prove it is alive (audio/sound/result)?
  private lastIdx = -1;
  private skip: { gen: number; idx: number } | null = null;

  private restartTimer: unknown = null;
  private fallbackTimer: unknown = null;
  private watchdogTimer: unknown = null;

  private speaking = 0;
  private echoUntil = 0;
  private spokenWords = new Set<string>();

  private finals: { t: number; text: string }[] = [];
  private episode: { severity: Severity; at: number } | null = null;
  private lastTookAt = 0;

  constructor(private readonly opts: VoiceOptions, private readonly cb: VoiceCallbacks) {
    this.t = opts.timers ?? realScheduler;
    this.lang = opts.lang ?? "en-IN";
    if (!opts.ctor) this.setState("unsupported", "This browser cannot listen for voice.");
    else if (opts.secureContext === false) this.setState("insecure", "Microphone access needs https or localhost.");
  }

  getState(): VoiceState { return this.state; }
  isWanted(): boolean { return this.want; }

  /** Begin (or resume) hands-free listening. Call from a user gesture when possible. */
  async start(): Promise<void> {
    if (this.disposed) return;
    if (!this.opts.ctor) return this.setState("unsupported", "This browser cannot listen for voice.");
    if (this.opts.secureContext === false) return this.setState("insecure", "Microphone access needs https or localhost.");
    this.want = true;
    this.failures = 0;
    this.networkFails = 0;
    this.setState("starting", "Opening the microphone…");
    const myGen = ++this.gen;                       // invalidate anything still in flight
    this.detach();
    if (this.opts.probe) {
      let verdict: "denied" | "no-mic" | null = null;
      try { verdict = await this.opts.probe(); } catch { verdict = null; }
      if (this.disposed || !this.want || myGen !== this.gen) return; // stop()/start() called while waiting
      if (verdict === "denied") { this.want = false; return this.setState("blocked", "Microphone permission was denied."); }
      if (verdict === "no-mic") { this.want = false; return this.setState("no-mic", "No microphone was found."); }
    }
    this.openSession();
    this.armWatchdog();
  }

  /** The browser will only listen after a tap (permission not granted yet). Does nothing if already running. */
  markNeedsTap(): void {
    if (this.disposed || this.want) return;
    if (this.state === "idle" || this.state === "off") this.setState("needs-tap", "Tap to turn on voice safety.");
  }

  /** Person turned listening off. Never restarts by itself afterwards. */
  stop(): void {
    this.want = false;
    this.gen++;
    this.clearTimers();
    this.detach();
    if (!this.disposed) this.setState("off", "Voice safety is off.");
  }

  dispose(): void {
    this.disposed = true;
    this.want = false;
    this.gen++;
    this.clearTimers();
    this.detach();
  }

  /** Page became visible / network came back / window focused: make sure we are really listening. */
  kick(): void {
    if (this.disposed || !this.want) return;
    if (this.state === "listening" || this.state === "starting") return;
    if (this.state === "error") return; // needs an explicit tap
    this.failures = Math.min(this.failures, 2);
    this.networkFails = Math.min(this.networkFails, 1);
    this.scheduleRestart(100);
  }

  /**
   * The app is about to speak `text` aloud. Results whose words mostly match it are treated as echo of the
   * app's own voice and ignored. Everything else is still evaluated, so speaking over the app works.
   * Pair every speakStart with a speakEnd.
   */
  speakStart(text: string): void {
    this.speaking++;
    for (const w of this.words(text)) this.spokenWords.add(w);
  }
  speakEnd(tailMs = 2500): void {
    this.speaking = Math.max(0, this.speaking - 1);
    this.echoUntil = Math.max(this.echoUntil, this.t.now() + tailMs); // the room still echoes for a moment
  }
  private words(text: string): string[] { return normalize(text).split(" ").filter((w) => w.length >= 3); }
  private isEcho(text: string, now: number): boolean {
    if (this.speaking === 0 && now >= this.echoUntil) { this.spokenWords.clear(); return false; }
    const ws = this.words(text);
    if (ws.length < 2) return false;
    const hit = ws.filter((w) => this.spokenWords.has(w)).length;
    return hit >= 2 && hit / ws.length >= 0.6;
  }

  /**
   * The alert was dismissed. Re-arm at once: forget the episode and ignore the words of the utterance
   * that was still being recognised, so the same sentence cannot immediately re-trigger it.
   */
  rearm(): void {
    this.episode = null;
    this.finals = [];
    this.skip = { gen: this.gen, idx: this.lastIdx + 1 };
  }

  /** Feed text exactly as if the microphone had heard it (typed fallback / demo / tests). */
  simulate(text: string): void {
    this.cb.onHeard(text, true);
    this.evaluate(text, true, this.t.now());
  }

  // ---------------------------------------------------------------- internals

  private setState(s: VoiceState, detail = ""): void {
    if (this.state === s && this.detail === detail) return;
    this.state = s;
    this.detail = detail;
    if (!this.disposed) this.cb.onState(s, detail);
  }

  private clearTimers(): void {
    for (const h of [this.restartTimer, this.fallbackTimer, this.watchdogTimer]) if (h !== null) this.t.clearTimeout(h);
    this.restartTimer = this.fallbackTimer = this.watchdogTimer = null;
  }

  /** Unhook and abort the current recognizer so it can never call us back again. */
  private detach(): void {
    const r = this.rec;
    this.rec = null;
    if (!r) return;
    r.onstart = r.onaudiostart = r.onsoundstart = r.onspeechstart = r.onresult = r.onerror = r.onend = null;
    try { (r.abort ?? r.stop).call(r); } catch { /* already stopped */ }
  }

  private openSession(): void {
    if (this.disposed || !this.want || !this.opts.ctor) return;
    this.detach();
    const gen = ++this.gen;
    const r = new this.opts.ctor();
    r.continuous = true;
    r.interimResults = true;      // react while the sentence is still being spoken
    r.lang = this.lang;
    try { r.maxAlternatives = 1; } catch { /* optional */ }
    const live = () => this.rec === r && this.gen === gen && this.want && !this.disposed;

    r.onstart = () => {
      if (!live()) return;
      this.sessionStart = this.t.now();
      this.lastResultAt = this.sessionStart;
      this.sawResult = false;
      this.lastIdx = -1;
      // Some browsers never fire audiostart: if nothing went wrong shortly after start, we are listening.
      if (this.fallbackTimer !== null) this.t.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = this.t.setTimeout(() => { if (live() && !this.sessionConfirmed) this.confirm(); }, 1200);
    };
    r.onaudiostart = () => { if (live()) this.confirm(); };
    r.onsoundstart = r.onspeechstart = () => { if (live()) this.confirm(); };
    r.onresult = (e) => { if (live()) this.handleResult(gen, e); };
    r.onerror = (e) => { if (live()) this.handleError(e?.error ?? "unknown"); };
    r.onend = () => { if (live()) this.handleEnd(); };

    this.rec = r;
    this.sessionStart = this.t.now();
    this.sessionConfirmed = false;
    this.failureCounted = false;
    try {
      r.start();
    } catch (err) {
      // InvalidStateError (already started) or a browser refusing without a gesture.
      const name = (err as { name?: string } | null)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        this.want = false;
        this.setState("needs-tap", "Tap to turn on voice safety.");
      } else {
        this.failures++;
        this.scheduleRestart(this.backoff());
      }
    }
  }

  /** The current session has proven it is alive: only now do we tell the person we are listening. */
  private confirm(): void {
    this.sessionConfirmed = true;
    this.failures = 0;
    this.networkFails = 0;
    if (this.state !== "listening") this.setState("listening", "Listening.");
  }

  private backoff(): number {
    return Math.min(250 * 2 ** Math.max(0, this.failures - 1), 8000);
  }

  private scheduleRestart(delay: number): void {
    if (this.disposed || !this.want) return;
    if (this.restartTimer !== null) this.t.clearTimeout(this.restartTimer);
    if (this.failures >= MAX_FAILURES) {
      this.want = false;
      this.detach();
      return this.setState("error", "Speech recognition keeps stopping. Tap to try again.");
    }
    if (this.state !== "listening" || this.failures > 0 || this.networkFails > 0) {
      if (this.networkFails === 0) this.setState("reconnecting", "Reconnecting the microphone…");
    }
    this.restartTimer = this.t.setTimeout(() => { this.restartTimer = null; this.openSession(); }, delay);
  }

  private handleError(code: string): void {
    switch (code) {
      case "not-allowed":
      case "service-not-allowed":
        this.want = false;
        this.detach();
        this.setState("blocked", "Microphone permission was denied.");
        return;
      case "audio-capture":
        this.want = false;
        this.detach();
        this.setState("no-mic", "No working microphone was found.");
        return;
      case "language-not-supported":
      case "bad-grammar":
        this.want = false;
        this.detach();
        this.setState("error", `Speech recognition problem (${code}).`);
        return;
      case "network":
        // The speech service is unreachable. Keep retrying forever (capped backoff) and say so honestly:
        // a safety feature must not quietly give up because the Wi-Fi blinked.
        this.networkFails++;
        this.failureCounted = true;
        this.setState("reconnecting", "The speech service cannot be reached. Retrying…");
        return; // onend follows and schedules the restart
      case "no-speech":
      case "aborted":
      default:
        return; // benign: the browser ends the session and onend restarts it
    }
  }

  private handleEnd(): void {
    // A session that opened audio was healthy even if it was short. Only sessions that never proved
    // themselves alive count as failures (and a network error was already counted once).
    if (!this.sessionConfirmed && !this.failureCounted) this.failures++;
    this.rec = null;
    const delay = this.networkFails > 0
      ? Math.min(500 * 2 ** (this.networkFails - 1), NETWORK_BACKOFF_MAX_MS)
      : this.failures === 0 ? 120 : this.backoff();
    this.scheduleRestart(delay);
  }

  private armWatchdog(): void {
    if (this.watchdogTimer !== null) this.t.clearTimeout(this.watchdogTimer);
    this.watchdogTimer = this.t.setTimeout(() => this.watchdog(), 4000);
  }

  private watchdog(): void {
    this.watchdogTimer = null;
    if (this.disposed || !this.want) return;
    const now = this.t.now();
    if (!this.sessionConfirmed && now - this.sessionStart > START_STUCK_MS) {
      this.failures++;
      this.scheduleRestart(this.backoff());
    } else if (this.state === "listening" && now - this.sessionStart > SESSION_RECYCLE_MS && now - this.lastResultAt > 3000) {
      this.scheduleRestart(50); // recycle quietly during silence, before the browser stalls the session
    }
    this.armWatchdog();
  }

  private handleResult(gen: number, e: RecognitionResultEvent): void {
    const now = this.t.now();
    this.sawResult = true;
    this.failures = 0;
    this.lastResultAt = now;
    this.confirm();
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (i > this.lastIdx) this.lastIdx = i;
      const res = e.results[i];
      const text = String(res?.[0]?.transcript ?? "").trim();
      if (!text) continue;
      const final = !!res.isFinal;
      this.cb.onHeard(text, final);
      if (this.isEcho(text, now)) continue;                          // the app's own voice, not the person
      if (this.skip && this.skip.gen === gen && i < this.skip.idx) continue; // words from before a dismissal
      this.evaluate(text, final, now);
    }
  }

  private evaluate(text: string, final: boolean, now: number): void {
    this.finals = this.finals.filter((f) => now - f.t < WINDOW_MS);
    const windowText = [...this.finals.map((f) => f.text), text].join(" ");
    const hit = detectDistress(text) ?? detectDistress(windowText);
    if (final) { this.finals.push({ t: now, text }); if (this.finals.length > 6) this.finals.shift(); }

    if (hit) {
      const ep = this.episode;
      if (!ep || now - ep.at > EPISODE_MS) {
        this.episode = { severity: hit.severity, at: now };
        this.finals = [];
        this.cb.onDistress(hit, text, { escalation: false });
      } else if (rank(hit.severity) > rank(ep.severity)) {
        this.episode = { severity: hit.severity, at: now };
        this.finals = [];
        this.cb.onDistress(hit, text, { escalation: true });
      } else {
        ep.at = now; // still the same emergency: keep the episode alive, do not re-fire
      }
      return;
    }
    if (final && now - this.lastTookAt > 3000 && detectTookMedicine(text)) {
      this.lastTookAt = now;
      this.cb.onTook(text);
    }
  }
}

/** Looks up the browser's recognition constructor (standard or webkit-prefixed). */
export function findRecognitionCtor(w: unknown): RecognitionCtor | null {
  const g = w as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return g?.SpeechRecognition ?? g?.webkitSpeechRecognition ?? null;
}
