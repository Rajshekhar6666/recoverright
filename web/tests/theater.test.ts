import test from "node:test";
import assert from "node:assert/strict";
import { approvalEffects, buildModel, effectsFor, pairFields, type Ev, type FieldRead } from "../lib/theater/model";
import { DEMO_MODELS, demoEvents, demoSchedule } from "../lib/theater/demo";

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const all = demoEvents(demoSchedule(), T0);
const upTo = (ms: number) => all.filter((e) => new Date(e.ts).getTime() - T0 <= ms);
const ctx = (over = {}) => ({ approved: false, nowMs: T0 + 60000, busy: false, ...over });

test("empty stream: waiting state, nothing active, no invented activity", () => {
  const m = buildModel([], ctx());
  assert.equal(m.activeKey, ""); assert.equal(m.nodes.doc, "idle"); assert.equal(m.metrics.events, 0);
  assert.match(m.narration.big, /Waiting for a document/);
});

test("stages progress in the real order and timings come from event timestamps", () => {
  const early = buildModel(upTo(1500), ctx({ busy: true, nowMs: T0 + 1500 }));
  assert.equal(early.activeKey, "parse"); assert.equal(early.nodes.doc, "done"); assert.equal(early.nodes.parse, "active");
  const mid = buildModel(upTo(6000), ctx({ busy: true, nowMs: T0 + 6000 }));
  assert.equal(mid.nodes.parse, "done"); assert.equal(mid.nodes.a, "active"); assert.equal(mid.nodes.b, "active");
  const full = buildModel(all, ctx());
  assert.equal(full.nodes.recon, "done"); assert.equal(full.nodes.human, "waiting"); assert.equal(full.nodes.lock, "idle");
  const parse = full.stages.find((s) => s.key === "parse")!;
  assert.equal(parse.startMs, 0); assert.equal(parse.endMs, 3000);
});

test("approval comes only from the run status, never from events", () => {
  assert.equal(buildModel(all, ctx()).nodes.lock, "idle");
  const ok = buildModel(all, ctx({ approved: true }));
  assert.equal(ok.nodes.lock, "done"); assert.equal(ok.nodes.human, "done"); assert.match(ok.narration.big, /approved/i);
});

test("real model names are passed through, with a safe fallback", () => {
  const m = buildModel(all, ctx());
  assert.equal(m.models.a, DEMO_MODELS.a);
  const noStart = buildModel(all.filter((e) => !e.type.endsWith(".started")), ctx());
  assert.equal(noStart.models.a, "model A");
});

test("A vs B pairing: identity first, then order; real differences are flagged with the differing field", () => {
  const m = buildModel(all, ctx());
  assert.equal(m.pairs.length, 11);
  const placebex = m.pairs.find((p) => p.a?.value.name === "Placebex")!;
  assert.equal(placebex.state, "diff"); assert.deepEqual(placebex.diffKeys, ["dose"]);
  const wound = m.pairs.find((p) => p.category === "follow_ups" && String(p.a?.value.what).startsWith("Wound"))!;
  assert.equal(wound.state, "diff"); assert.deepEqual(wound.diffKeys, ["when"]);
  assert.equal(m.metrics.differing, 2); assert.equal(m.metrics.agreeing, 9);
});

test("pairing is robust to different ordering between readers", () => {
  const mk = (seq: number, name: string, dose: string): FieldRead => ({ seq, path: `medications[${seq}]`, category: "medications", value: { name, dose }, text: `${name} ${dose}`, quote: "", blockId: "b1" });
  const rows = pairFields([mk(1, "Aa", "1"), mk(2, "Bb", "2")], [mk(3, "Bb", "2"), mk(4, "Aa", "1")]);
  assert.ok(rows.every((r) => r.state === "same"), JSON.stringify(rows.map((r) => r.state)));
});

test("an unmatched field is reported as only-a / only-b rather than hidden", () => {
  const mk = (seq: number, cat: string, t: string): FieldRead => ({ seq, path: `${cat}[0]`, category: cat, value: { instruction: t }, text: t, quote: "", blockId: "" });
  const rows = pairFields([mk(1, "diet", "x")], []);
  assert.equal(rows[0].state, "only-a");
});

test("quote verification and reconciliation numbers come from events", () => {
  const m = buildModel(all, ctx());
  assert.equal(m.metrics.verified, 21); assert.equal(m.metrics.failedQuotes, 1);
  assert.deepEqual(m.counts, { agreed: 9, review: 1, conflict: 1, rejected: 0 });
  assert.equal(m.verdicts.length, 11);
});

test("reader failure marks that node failed and records the error; run.failed marks the run failed", () => {
  const evs: Ev[] = [...upTo(5000), { seq: 900, ts: new Date(T0 + 5100).toISOString(), type: "extract.b.failed", payload: { error: "429 rate limit" } }];
  const m = buildModel(evs, ctx({ busy: true, nowMs: T0 + 5200 }));
  assert.equal(m.nodes.b, "failed"); assert.equal(m.errors.b, "429 rate limit"); assert.equal(m.failed, false);
  const dead = buildModel([...evs, { seq: 901, ts: new Date(T0 + 5200).toISOString(), type: "run.failed", payload: { error: "boom" } }], ctx());
  assert.equal(dead.failed, true); assert.equal(dead.errors.run, "boom"); assert.match(dead.narration.big, /error/);
});

test("clock: advances with wall time while busy, freezes at the last event when finished", () => {
  assert.equal(buildModel(upTo(2000), ctx({ busy: true, nowMs: T0 + 9000 })).clockMs, 9000);
  const done = buildModel(all, ctx({ busy: false, nowMs: T0 + 999999 }));
  assert.equal(done.clockMs, new Date(all[all.length - 1].ts).getTime() - T0);
});

test("effects: only real events produce visuals; unknown events produce none", () => {
  assert.deepEqual(effectsFor({ seq: 1, ts: "", type: "totally.unknown", payload: {} }), []);
  const f = effectsFor({ seq: 2, ts: "", type: "reconcile.field", payload: { status: "conflict" } });
  assert.ok(f.some((e) => e.kind === "packet" && e.to === "human" && e.color === "#ff5d78"));
  const agreed = effectsFor({ seq: 3, ts: "", type: "reconcile.field", payload: { status: "agreed" } });
  assert.ok(agreed.some((e) => e.kind === "packet" && e.to === "lock"));
  assert.ok(effectsFor({ seq: 4, ts: "", type: "extract.a.failed", payload: {} }).some((e) => e.kind === "glitch" && e.at === "a"));
  assert.ok(effectsFor({ seq: 5, ts: "", type: "ground.b.done", payload: { fail: 1 } }).some((e) => e.kind === "burst"));
  assert.ok(approvalEffects().some((e) => e.kind === "confetti"));
});

test("the simulated demo is a coherent run: ordered, ends at review.ready, schema matches what the model reads", () => {
  const sch = demoSchedule();
  assert.ok(sch.every((s, i) => i === 0 || s.at >= sch[i - 1].at));
  assert.equal(sch[sch.length - 1].type, "review.ready");
  assert.ok(sch[sch.length - 1].at < 25000, "demo should be presentable in under ~25 s");
  const m = buildModel(all, ctx());
  assert.equal(m.metrics.blocks, 21); assert.equal(m.reviewReady, true); assert.equal(m.failed, false);
});

test("REGRESSION: after run.failed nothing is still 'active' or 'working'; the interrupted stage is the failed one", () => {
  const evs: Ev[] = [...upTo(5000), { seq: 950, ts: new Date(T0 + 5200).toISOString(), type: "run.failed", payload: { error: "boom" } }];
  const m = buildModel(evs, ctx());
  assert.equal(m.failed, true);
  assert.equal(m.stages.filter((s) => s.active).length, 0);
  assert.ok(m.stages.filter((s) => s.failed).length >= 1);
  assert.equal(m.activeKey, "");
  assert.ok(Object.values(m.nodes).every((n) => n !== "active" && n !== "waiting"));
});
