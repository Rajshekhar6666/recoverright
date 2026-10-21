import test from "node:test";
import assert from "node:assert/strict";
import { VoiceController, type RecognitionLike, type RecognitionResultEvent, type Scheduler, type VoiceState } from "../lib/voice/controller";
import type { Detection } from "../lib/voice/phrases";

class Clock implements Scheduler {
  t = 1_000_000; private id = 0; private q: { id: number; at: number; fn: () => void }[] = [];
  now() { return this.t; }
  setTimeout(fn: () => void, ms: number) { const id = ++this.id; this.q.push({ id, at: this.t + ms, fn }); return id; }
  clearTimeout(h: unknown) { this.q = this.q.filter((x) => x.id !== h); }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.q.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.q = this.q.filter((x) => x !== next); this.t = next.at; next.fn();
    }
    this.t = end;
  }
}

class FakeRec implements RecognitionLike {
  static all: FakeRec[] = [];
  continuous = false; interimResults = false; lang = ""; started = false; aborted = false;
  onstart: RecognitionLike["onstart"] = null; onaudiostart: RecognitionLike["onaudiostart"] = null; onsoundstart: RecognitionLike["onsoundstart"] = null;
  onspeechstart: RecognitionLike["onspeechstart"] = null; onresult: RecognitionLike["onresult"] = null; onerror: RecognitionLike["onerror"] = null; onend: RecognitionLike["onend"] = null;
  constructor() { FakeRec.all.push(this); }
  start() { this.started = true; }
  stop() { this.aborted = true; }
  abort() { this.aborted = true; }
  // helpers that behave like the browser
  open() { this.onstart?.(); this.onaudiostart?.(); }
  say(items: { text: string; final?: boolean }[], resultIndex = 0, all?: { text: string; final?: boolean }[]) {
    const src = all ?? items;
    const e: RecognitionResultEvent = { resultIndex, results: src.map((i) => ({ isFinal: !!i.final, 0: { transcript: i.text } })) };
    this.onresult?.(e);
  }
}

function rig(opts: { ctor?: typeof FakeRec | null; probe?: () => Promise<"denied" | "no-mic" | null>; secure?: boolean } = {}) {
  FakeRec.all = [];
  const clock = new Clock();
  const log = { states: [] as VoiceState[], heard: [] as string[], distress: [] as { d: Detection; heard: string; esc: boolean }[], took: [] as string[] };
  const c = new VoiceController(
    { ctor: opts.ctor === null ? null : FakeRec, timers: clock, probe: opts.probe, secureContext: opts.secure },
    { onState: (s) => log.states.push(s), onHeard: (t) => log.heard.push(t),
      onDistress: (d, heard, info) => log.distress.push({ d, heard, esc: info.escalation }), onTook: (h) => log.took.push(h) },
  );
  const rec = () => FakeRec.all[FakeRec.all.length - 1];
  return { c, clock, log, rec };
}

test("does NOT claim 'listening' until the browser reports audio (old code claimed it instantly)", async () => {
  const { c, log, rec } = rig();
  await c.start();
  assert.equal(c.getState(), "starting");
  assert.ok(!log.states.includes("listening"));
  rec().onstart?.();
  assert.equal(c.getState(), "starting");
  rec().onaudiostart?.();
  assert.equal(c.getState(), "listening");
  c.dispose();
});

test("fallback: a browser that never fires audiostart still becomes 'listening' once started cleanly", async () => {
  const { c, clock, rec } = rig();
  await c.start();
  rec().onstart?.();
  clock.advance(1300);
  assert.equal(c.getState(), "listening");
  c.dispose();
});

test("each requested phrase fires the distress callback", async () => {
  for (const phrase of ["I feel unwell", "I need help", "chest pain", "I feel dizzy", "I can't breathe"]) {
    const { c, rec, log } = rig();
    await c.start(); rec().open();
    rec().say([{ text: phrase }]);
    assert.equal(log.distress.length, 1, phrase);
    assert.equal(log.distress[0].esc, false);
    c.dispose();
  }
});

test("fires on an INTERIM result, before the sentence is finished", async () => {
  const { c, rec, log } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I can't breathe", final: false }]);
  assert.equal(log.distress.length, 1);
  c.dispose();
});

test("repeats inside one episode do not spam; escalation to critical fires once", async () => {
  const { c, rec, log, clock } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I feel dizzy" }]);
  clock.advance(2000); rec().say([{ text: "I feel dizzy" }]);
  clock.advance(2000); rec().say([{ text: "I need help" }]);
  assert.equal(log.distress.length, 1);
  clock.advance(1000); rec().say([{ text: "I can't breathe" }]);
  assert.equal(log.distress.length, 2);
  assert.equal(log.distress[1].esc, true);
  assert.equal(log.distress[1].d.severity, "critical");
  clock.advance(500); rec().say([{ text: "I can't breathe" }]);
  assert.equal(log.distress.length, 2);
  c.dispose();
});

test("BUG FIX: after dismissing, a second real emergency fires immediately (old code stayed silent for 20 s)", async () => {
  const { c, rec, log, clock } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I feel unwell", final: true }]);
  assert.equal(log.distress.length, 1);
  clock.advance(3000);                       // person taps "I'm okay"
  c.rearm();
  clock.advance(2000);
  rec().say([{ text: "chest pain", final: true }], 1, [{ text: "I feel unwell", final: true }, { text: "chest pain", final: true }]);
  assert.equal(log.distress.length, 2, "second emergency must not be swallowed");
  assert.equal(log.distress[1].d.kind, "chest");
  c.dispose();
});

test("rearm ignores the tail of the same utterance, but not a new one", async () => {
  const { c, rec, log } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I need help" }]);                 // index 0
  assert.equal(log.distress.length, 1);
  c.rearm();                                            // dismissed while the utterance is still being recognised
  rec().say([{ text: "I need help please" }], 0);       // same segment grows
  assert.equal(log.distress.length, 1, "same utterance must not re-trigger");
  rec().say([{ text: "I can't breathe" }], 1, [{ text: "I need help please", final: true }, { text: "I can't breathe" }]);
  assert.equal(log.distress.length, 2, "a new utterance must trigger");
  c.dispose();
});

test("phrase split across two results is still caught (rolling window)", async () => {
  const { c, rec, log } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I feel", final: true }]);
  assert.equal(log.distress.length, 0);
  rec().say([{ text: "unwell", final: true }], 1, [{ text: "I feel", final: true }, { text: "unwell", final: true }]);
  assert.equal(log.distress.length, 1);
  c.dispose();
});

test("BUG FIX: React StrictMode double mount cannot leave two recognizers fighting", async () => {
  FakeRec.all = [];
  const clock = new Clock();
  const noop = { onState() {}, onHeard() {}, onDistress() {}, onTook() {} };
  const a = new VoiceController({ ctor: FakeRec, timers: clock }, noop);
  await a.start();                                     // mount #1
  const recA = FakeRec.all[0]; recA.open();
  const staleOnEnd = recA.onend;                       // a handler the browser might still call later
  a.dispose();                                         // StrictMode cleanup
  const b = new VoiceController({ ctor: FakeRec, timers: clock }, noop);
  await b.start();                                     // mount #2
  assert.equal(FakeRec.all.length, 2);
  assert.equal(recA.aborted, true);
  assert.equal(recA.onend, null, "stale recognizer must be unhooked");
  staleOnEnd?.();                                      // browser fires the old end event late
  clock.advance(5000);
  assert.equal(FakeRec.all.length, 2, "stale session must not restart itself");
  b.dispose();
});

test("normal browser session end restarts quickly and stays 'listening' (no flicker)", async () => {
  const { c, rec, clock, log } = rig();
  await c.start(); rec().open();
  const before = log.states.length;
  rec().onend?.();
  assert.equal(c.getState(), "listening");
  clock.advance(200);
  assert.equal(FakeRec.all.length, 2);
  assert.equal(log.states.length, before, "no state flicker on a routine restart");
  c.dispose();
});

test("no-speech is benign: restarts, never errors", async () => {
  const { c, rec, clock } = rig();
  await c.start(); rec().open();
  for (let i = 0; i < 20; i++) { rec().onerror?.({ error: "no-speech" }); rec().onend?.(); clock.advance(300); rec().open(); }
  assert.equal(c.getState(), "listening");
  c.dispose();
});

test("permission denied: state 'blocked', never restarts", async () => {
  const { c, rec, clock } = rig();
  await c.start();
  rec().onerror?.({ error: "not-allowed" });
  rec().onend?.();
  clock.advance(60_000);
  assert.equal(c.getState(), "blocked");
  assert.equal(FakeRec.all.length, 1);
  c.dispose();
});

test("probe: denied and no-mic are reported without starting recognition", async () => {
  const d = rig({ probe: async () => "denied" }); await d.c.start();
  assert.equal(d.c.getState(), "blocked"); assert.equal(FakeRec.all.length, 0);
  const n = rig({ probe: async () => "no-mic" }); await n.c.start();
  assert.equal(n.c.getState(), "no-mic");
});

test("stop() during the probe wins (no zombie session)", async () => {
  let release: (v: null) => void = () => {};
  const { c } = rig({ probe: () => new Promise((r) => { release = r as (v: null) => void; }) });
  const p = c.start();
  c.stop();
  release(null);
  await p;
  assert.equal(c.getState(), "off");
  assert.equal(FakeRec.all.length, 0);
});

test("BUG FIX: an unreachable speech service retries forever with capped backoff and never claims to be listening (old code looped every 250 ms saying 'Listening')", async () => {
  const { c, rec, clock, log } = rig();
  await c.start();
  const delays: number[] = [];
  for (let i = 0; i < 10; i++) {
    const count = FakeRec.all.length;
    rec().onerror?.({ error: "network" });
    rec().onend?.();
    let waited = 0;
    while (FakeRec.all.length === count && waited < 30_000) { clock.advance(50); waited += 50; }
    delays.push(waited);
  }
  assert.ok(log.states.includes("reconnecting"));
  assert.ok(!log.states.includes("listening"), "must never claim to be listening while the service is down");
  assert.notEqual(c.getState(), "error", "a network blip must not make it give up");
  assert.ok(delays[3] > delays[0], `backoff should grow: ${delays.join(",")}`);
  assert.ok(Math.max(...delays) <= 10_100, `backoff must be capped: ${delays.join(",")}`);
  const made = FakeRec.all.length;
  clock.advance(120_000);
  assert.ok(FakeRec.all.length > made, "must keep trying");
  c.dispose();
});

test("sessions that die instantly with no network error stop honestly after MAX failures (no hot loop)", async () => {
  const { c, rec, clock, log } = rig();
  await c.start();
  for (let i = 0; i < 12 && c.getState() !== "error"; i++) {
    rec().onend?.();                    // dies without ever opening audio
    clock.advance(10_000);
  }
  assert.equal(c.getState(), "error");
  assert.ok(!log.states.includes("listening"));
  const made = FakeRec.all.length;
  assert.ok(made <= 8, `should not spin: ${made} sessions`);
  clock.advance(120_000);
  assert.equal(FakeRec.all.length, made);
  c.dispose();
});

test("a tap (start) recovers from the error state", async () => {
  const { c, rec, clock } = rig();
  await c.start();
  for (let i = 0; i < 12 && c.getState() !== "error"; i++) { rec().onend?.(); clock.advance(10_000); }
  assert.equal(c.getState(), "error");
  await c.start(); rec().open();
  assert.equal(c.getState(), "listening");
  c.dispose();
});

test("echo filter: the app's own words are ignored, but a person speaking OVER the app is still heard (blanket muting would miss them)", async () => {
  const { c, rec, log, clock } = rig();
  await c.start(); rec().open();
  c.speakStart("I heard you. It sounds like you may be needing help. I am trying to alert your care team.");
  rec().say([{ text: "it sounds like you may be needing help", final: true }]);
  assert.equal(log.distress.length, 0, "must not react to the app talking");
  assert.equal(log.heard.length, 1, "but still show what was heard");
  rec().say([{ text: "I can't breathe", final: false }], 1, [{ text: "x", final: true }, { text: "I can't breathe" }]);
  assert.equal(log.distress.length, 1, "a person talking over the app must still be heard");
  c.speakEnd(2500);
  c.rearm();
  clock.advance(1000);
  rec().say([{ text: "trying to alert your care team", final: true }], 2, [{ text: "x", final: true }, { text: "y", final: true }, { text: "trying to alert your care team", final: true }]);
  assert.equal(log.distress.length, 1, "echo tail is still filtered just after speaking");
  clock.advance(3000);
  rec().say([{ text: "I need help", final: true }], 3, [{ text: "x", final: true }, { text: "y", final: true }, { text: "z", final: true }, { text: "I need help", final: true }]);
  assert.equal(log.distress.length, 2, "after the echo window, normal speech works again");
  c.dispose();
});

test("stuck start (browser never opens the mic) is retried by the watchdog", async () => {
  const { c, clock } = rig();
  await c.start();
  clock.advance(15_000);
  assert.ok(FakeRec.all.length >= 2, "watchdog should have reopened the session");
  c.dispose();
});

test("long silent session is recycled before the browser stalls it", async () => {
  const { c, rec, clock } = rig();
  await c.start(); rec().open();
  clock.advance(120_000);
  assert.ok(FakeRec.all.length >= 2);
  c.dispose();
});

test("stop(): turning listening off never restarts", async () => {
  const { c, rec, clock } = rig();
  await c.start(); rec().open();
  const r = rec();
  c.stop();
  r.onend?.();
  clock.advance(60_000);
  assert.equal(c.getState(), "off");
  assert.equal(FakeRec.all.length, 1);
});

test("unsupported browser and insecure page are reported", () => {
  assert.equal(rig({ ctor: null }).c.getState(), "unsupported");
  assert.equal(rig({ secure: false }).c.getState(), "insecure");
});

test("medicine confirmation fires onTook once (debounced) and only when final", async () => {
  const { c, rec, log, clock } = rig();
  await c.start(); rec().open();
  rec().say([{ text: "I took my medicine", final: false }]);
  assert.equal(log.took.length, 0);
  rec().say([{ text: "I took my medicine", final: true }]);
  rec().say([{ text: "I took my medicine", final: true }]);
  assert.equal(log.took.length, 1);
  clock.advance(4000);
  rec().say([{ text: "I took my medicine", final: true }]);
  assert.equal(log.took.length, 2);
  c.dispose();
});

test("simulate() runs the same pipeline as the microphone", async () => {
  const { c, log } = rig();
  c.simulate("I feel unwell");
  assert.equal(log.distress.length, 1);
  assert.deepEqual(log.heard, ["I feel unwell"]);
  c.dispose();
});

test("kick() reopens a dead session after the page returns to the foreground", async () => {
  const { c, rec, clock } = rig();
  await c.start(); rec().open();
  rec().onerror?.({ error: "network" }); rec().onend?.();
  clock.advance(10);
  c.kick(); clock.advance(300);
  assert.ok(FakeRec.all.length >= 2);
  c.dispose();
});
