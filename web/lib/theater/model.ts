/**
 * Live Theater model. Pure functions: raw pipeline events in, everything the screen shows out.
 * Nothing here invents activity. Every number, node state and animation effect is derived from an event
 * that the backend (or, in the explicitly labelled demo mode, the simulator) actually emitted.
 */
export interface Ev { seq: number; ts: string; type: string; payload: Record<string, unknown> }

export type StageKey = "received" | "parse" | "a" | "b" | "ground" | "reconcile" | "review" | "approve";
export type NodeKey = "doc" | "parse" | "a" | "b" | "ground" | "recon" | "human" | "lock";
export type NodeState = "idle" | "active" | "done" | "failed" | "waiting";
export type Tone = "ok" | "info" | "warn" | "bad";

export const STAGE_NODE: Record<StageKey, NodeKey> = { received: "doc", parse: "parse", a: "a", b: "b", ground: "ground", reconcile: "recon", review: "human", approve: "lock" };

const startsAny = (t: string, ...p: string[]) => p.some((x) => t.startsWith(x));
export const STAGES: { key: StageKey; label: string; short: string; started: (t: string) => boolean; finished: (t: string) => boolean }[] = [
  { key: "received", label: "Document received", short: "RECEIVED", started: () => true, finished: () => true },
  { key: "parse", label: "Parsing & segmentation", short: "PARSING", started: (t) => startsAny(t, "parse."), finished: (t) => t === "parse.done" },
  { key: "a", label: "Extractor A", short: "READER A", started: (t) => startsAny(t, "extract.a."), finished: (t) => t === "extract.a.done" || t === "extract.a.failed" },
  { key: "b", label: "Extractor B", short: "READER B", started: (t) => startsAny(t, "extract.b."), finished: (t) => t === "extract.b.done" || t === "extract.b.failed" },
  { key: "ground", label: "Validation & evidence check", short: "EVIDENCE", started: (t) => startsAny(t, "ground."), finished: (t) => t === "ground.b.done" },
  { key: "reconcile", label: "Reconciliation", short: "RECONCILE", started: (t) => startsAny(t, "reconcile."), finished: (t) => t === "reconcile.done" },
  { key: "review", label: "Human review", short: "REVIEW", started: (t) => t === "review.ready", finished: () => false },
  { key: "approve", label: "Approval & lock", short: "APPROVED", started: () => false, finished: () => false },
];

// ------------------------------------------------------------------ small helpers
export const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const evMs = (e: Ev): number => { const t = new Date(e.ts).getTime(); return isFinite(t) ? t : 0; };
export const clock = (ms: number): string => `${String(Math.floor(Math.max(0, ms) / 60000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, ms) % 60000) / 1000)).padStart(2, "0")}`;
export const flat = (v: unknown): string => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>).filter((x) => x !== null && x !== "" && x !== undefined).map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" · ") : str(v));
const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const lastOf = <T,>(arr: T[], pred: (x: T) => boolean): T | undefined => { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i]; return undefined; };

// ------------------------------------------------------------------ model types
export interface StageView { key: StageKey; label: string; short: string; node: NodeKey; done: boolean; active: boolean; failed: boolean; startMs: number | null; endMs: number | null }
export interface FieldRead { seq: number; path: string; category: string; value: Record<string, unknown>; text: string; quote: string; blockId: string }
export interface PairRow { id: string; category: string; a?: FieldRead; b?: FieldRead; state: "same" | "diff" | "only-a" | "only-b"; diffKeys: string[] }
export interface Verdict { seq: number; status: string; category: string; fieldId: string }
export interface LogItem { seq: number; atMs: number; title: string; detail: string; tone: Tone; type: string }
export interface Counts { agreed: number; review: number; conflict: number; rejected: number }

export interface TheaterModel {
  t0: number;
  clockMs: number;
  stages: StageView[];
  activeKey: StageKey | "";
  nodes: Record<NodeKey, NodeState>;
  blocks: { id: string; type: string; preview: string }[];
  fa: FieldRead[];
  fb: FieldRead[];
  models: { a: string; b: string };
  pairs: PairRow[];
  verdicts: Verdict[];
  ground: { a?: { pass: number; fail: number }; b?: { pass: number; fail: number } };
  counts: Counts | null;
  metrics: { events: number; blocks: number; fieldsA: number; fieldsB: number; verified: number; failedQuotes: number; eventsPerSec: number; missingA: number; missingB: number; agreeing: number; differing: number };
  errors: { a?: string; b?: string; run?: string };
  failed: boolean;
  reviewReady: boolean;
  reconciled: boolean;
  log: LogItem[];
  narration: { big: string; small: string };
}

export interface BuildCtx {
  /** Run is approved (from the run status, polled; never guessed from events). */
  approved: boolean;
  /** Run status reported by the API ("processing", "needs_review", ...), if known. */
  runStatus?: string;
  /** "Now" in ms: the wall clock when live, the last visible event when replaying. */
  nowMs: number;
  /** Treat the stream as still in progress (drives the clock and the "working" labels). */
  busy: boolean;
}

const categoryOf = (path: string) => path.replace(/\[\d+\]$/, "");

function toRead(e: Ev): FieldRead {
  const p = e.payload;
  const value = (p.value && typeof p.value === "object" ? p.value : {}) as Record<string, unknown>;
  return { seq: e.seq, path: str(p.path), category: categoryOf(str(p.path)), value, text: flat(value), quote: str(p.source_quote), blockId: str(p.block_id) };
}

const pairKey = (f: FieldRead): string => {
  const v = f.value;
  if (f.category === "medications") return normText(str(v.name));
  if (f.category === "follow_ups") return normText(str(v.what));
  if (f.category === "contacts") return normText(str(v.label) || str(v.value));
  return normText(f.text);
};

/** Pairs what reader A and reader B found: by identity first (drug name, follow-up title ...), then by order. */
export function pairFields(fa: FieldRead[], fb: FieldRead[]): PairRow[] {
  const rows: PairRow[] = [];
  const cats = Array.from(new Set([...fa, ...fb].map((f) => f.category)));
  for (const cat of cats) {
    const A = fa.filter((f) => f.category === cat), B = fb.filter((f) => f.category === cat);
    const usedB = new Set<number>(), usedA = new Set<number>();
    const matched: [FieldRead, FieldRead][] = [];
    A.forEach((a, i) => {
      const k = pairKey(a);
      const j = k ? B.findIndex((b, jj) => !usedB.has(jj) && pairKey(b) === k) : -1;
      if (j >= 0) { usedA.add(i); usedB.add(j); matched.push([a, B[j]]); }
    });
    const restA = A.filter((_, i) => !usedA.has(i)), restB = B.filter((_, j) => !usedB.has(j));
    const n = Math.min(restA.length, restB.length);
    for (let i = 0; i < n; i++) matched.push([restA[i], restB[i]]);
    for (const [a, b] of matched) {
      const keys = Array.from(new Set([...Object.keys(a.value), ...Object.keys(b.value)]));
      const diffKeys = keys.filter((k) => normText(flat(a.value[k])) !== normText(flat(b.value[k])));
      rows.push({ id: `${cat}:${a.seq}:${b.seq}`, category: cat, a, b, state: diffKeys.length ? "diff" : "same", diffKeys });
    }
    for (const a of restA.slice(n)) rows.push({ id: `${cat}:${a.seq}:-`, category: cat, a, state: "only-a", diffKeys: [] });
    for (const b of restB.slice(n)) rows.push({ id: `${cat}:-:${b.seq}`, category: cat, b, state: "only-b", diffKeys: [] });
  }
  return rows;
}

export function describe(e: Ev): { title: string; detail: string; tone: Tone } | null {
  const p = e.payload;
  const k = e.type.startsWith("extract.") ? e.type[8].toUpperCase() : e.type.startsWith("ground.") ? e.type[7].toUpperCase() : "";
  switch (e.type) {
    case "parse.started": return { title: "Document received", detail: str(p.filename), tone: "info" };
    case "parse.done": return { title: "Document parsed", detail: `${num(p.blocks)} blocks`, tone: "ok" };
    case "extract.a.started": case "extract.b.started": return { title: `Reader ${k} started`, detail: str(p.model) + (p.cached ? " (from cache)" : ""), tone: "info" };
    case "extract.a.done": case "extract.b.done": return { title: `Reader ${k} finished`, detail: `${num(p.fields)} fields${num(p.missing) ? `, ${num(p.missing)} missing` : ""}`, tone: "ok" };
    case "extract.a.failed": case "extract.b.failed": return { title: `Reader ${k} failed`, detail: str(p.error).slice(0, 110), tone: "bad" };
    case "extract.a.field": case "extract.b.field": return { title: `Reader ${k} read ${categoryOf(str(p.path)).replace(/_/g, " ")}`, detail: flat(p.value).slice(0, 90), tone: "info" };
    case "ground.a.done": case "ground.b.done": return { title: `Quotes of reader ${k} checked`, detail: `${num(p.pass)} verified, ${num(p.fail)} failed`, tone: num(p.fail) ? "warn" : "ok" };
    case "reconcile.field": {
      const s = str(p.status) || "review";
      return { title: `${s === "agreed" ? "Agreed" : s === "conflict" ? "Conflict" : s === "rejected" ? "Rejected" : "Needs review"}: ${(str(p.category) || str(p.field_id) || "field").replace(/_/g, " ")}`, detail: "", tone: s === "agreed" ? "ok" : s === "review" ? "warn" : "bad" };
    }
    case "reconcile.done": return { title: "Reconciliation done", detail: `${num(p.agreed)} agreed, ${num(p.review) + num(p.conflict) + num(p.rejected)} to check`, tone: "ok" };
    case "review.ready": return { title: "Ready for human review", detail: "Waiting for the care team", tone: "warn" };
    case "run.failed": return { title: "Run failed", detail: str(p.error).slice(0, 120), tone: "bad" };
    default: return /\.(block)$/.test(e.type) ? null : { title: e.type, detail: "", tone: "info" };
  }
}

export function narrate(active: StageKey | "", events: Ev[], approved: boolean, failed: boolean, m: { a: number; b: number; blocks: number }): { big: string; small: string } {
  if (failed) return { big: "This run stopped with an error.", small: "The event log shows the reason. Nothing reached the patient." };
  if (events.length === 0) return { big: "Waiting for a document.", small: "Upload one in the care-team console and it appears here the moment it starts." };
  if (approved) return { big: "The care team approved the plan. It is now locked.", small: "Every field was checked by software, then by a person." };
  switch (active) {
    case "parse": return { big: "Reading the document, block by block.", small: `${m.blocks} blocks found so far. Tables stay tables, so a dose stays next to its drug.` };
    case "a": case "b": return { big: "Two AI readers extract the plan independently.", small: `Reader A found ${m.a} fields, reader B found ${m.b}. Each one must quote its source.` };
    case "ground": return { big: "Checking every quote against the original text.", small: "A value with no matching quote is not trusted, however confident the AI sounded." };
    case "reconcile": return { big: "Comparing the readers and the table reader.", small: "Agreement is not enough: vague text such as “1-2 tablets” still goes to a person." };
    case "review": return { big: "Waiting for a nurse to check the flagged fields.", small: "Nothing reaches the patient until staff approve it." };
    default: return { big: "Starting up.", small: "The first events are on their way." };
  }
}

export function buildModel(events: Ev[], ctx: BuildCtx): TheaterModel {
  const t0 = events.length ? evMs(events[0]) : 0;
  const types = events.map((e) => e.type);
  const has = (t: string) => types.includes(t);

  const stages: StageView[] = STAGES.map((s) => {
    const startEv = s.key === "received" ? events[0] : events.find((e) => s.started(e.type));
    const endEv = events.find((e) => s.finished(e.type));
    const failedStage = (s.key === "a" && has("extract.a.failed")) || (s.key === "b" && has("extract.b.failed"));
    const done = s.key === "received" ? events.length > 0 : s.key === "review" || s.key === "approve" ? (s.key === "review" ? ctx.approved || ctx.runStatus === "needs_review" || ctx.runStatus === "approved" : ctx.approved) : types.some(s.finished);
    const active = !done && (s.key === "approve" ? false : s.key === "review" ? has("review.ready") : events.length > 0 && types.some(s.started));
    return { key: s.key, label: s.label, short: s.short, node: STAGE_NODE[s.key], done: done && !failedStage, active, failed: failedStage, startMs: startEv ? evMs(startEv) - t0 : null, endMs: endEv ? evMs(endEv) - t0 : null };
  });
  // "review" is a waiting stage: it counts as active (waiting for a human) until approval.
  const reviewStage = stages.find((s) => s.key === "review")!;
  if (has("review.ready") && !ctx.approved) { reviewStage.done = false; reviewStage.active = true; }

  const runErr = lastOf(events, (e) => e.type === "run.failed");
  const errors = {
    a: str(lastOf(events, (e) => e.type === "extract.a.failed")?.payload.error) || undefined,
    b: str(lastOf(events, (e) => e.type === "extract.b.failed")?.payload.error) || undefined,
    run: runErr ? str(runErr.payload.error) || "The run failed." : ctx.runStatus === "failed" ? "The run failed." : undefined,
  };
  const failed = !!errors.run;
  // A failed run has nothing still "working": whatever was in progress when it died is the stage that failed.
  if (failed) for (const st of stages) if (st.active) { st.failed = true; st.active = false; }

  const blocks = events.filter((e) => e.type === "parse.block").map((e) => ({ id: str(e.payload.block_id), type: str(e.payload.type), preview: str(e.payload.preview) }));
  const fa = events.filter((e) => e.type === "extract.a.field").map(toRead);
  const fb = events.filter((e) => e.type === "extract.b.field").map(toRead);
  const modelOf = (k: "a" | "b") => str(events.find((e) => e.type === `extract.${k}.started`)?.payload.model) || `model ${k.toUpperCase()}`;
  const verdicts: Verdict[] = events.filter((e) => e.type === "reconcile.field").map((e) => ({ seq: e.seq, status: str(e.payload.status) || "review", category: str(e.payload.category), fieldId: str(e.payload.field_id) }));
  const g = (k: "a" | "b") => { const e = lastOf(events, (x) => x.type === `ground.${k}.done`); return e ? { pass: num(e.payload.pass), fail: num(e.payload.fail) } : undefined; };
  const ground = { a: g("a"), b: g("b") };
  const rec = lastOf(events, (e) => e.type === "reconcile.done");
  const counts: Counts | null = rec ? { agreed: num(rec.payload.agreed), review: num(rec.payload.review), conflict: num(rec.payload.conflict), rejected: num(rec.payload.rejected) } : null;

  const pairs = pairFields(fa, fb);
  const lastMs = events.length ? evMs(events[events.length - 1]) : t0;
  const clockMs = events.length ? Math.max(0, (ctx.busy ? ctx.nowMs : lastMs) - t0) : 0;
  const recent = events.filter((e) => evMs(e) >= (ctx.busy ? ctx.nowMs : lastMs) - 5000).length;

  const activeKey = (stages.find((s) => s.active)?.key ?? "") as StageKey | "";
  const nodes = {} as Record<NodeKey, NodeState>;
  for (const s of stages) nodes[s.node] = s.failed ? "failed" : s.done ? "done" : s.active ? (s.key === "review" ? "waiting" : "active") : "idle";
  if (failed) for (const s of stages) if (s.active) nodes[s.node] = "failed";

  const metrics = {
    events: events.length, blocks: blocks.length, fieldsA: fa.length, fieldsB: fb.length,
    verified: (ground.a?.pass ?? 0) + (ground.b?.pass ?? 0), failedQuotes: (ground.a?.fail ?? 0) + (ground.b?.fail ?? 0),
    eventsPerSec: Math.round((recent / 5) * 10) / 10,
    missingA: num(lastOf(events, (e) => e.type === "extract.a.done")?.payload.missing), missingB: num(lastOf(events, (e) => e.type === "extract.b.done")?.payload.missing),
    agreeing: pairs.filter((p) => p.state === "same").length, differing: pairs.filter((p) => p.state !== "same").length,
  };
  const log: LogItem[] = [];
  for (let i = events.length - 1; i >= 0 && log.length < 150; i--) {
    const d = describe(events[i]);
    if (d) log.push({ seq: events[i].seq, atMs: evMs(events[i]) - t0, type: events[i].type, ...d });
  }
  return {
    t0, clockMs, stages, activeKey, nodes, blocks, fa, fb, models: { a: modelOf("a"), b: modelOf("b") }, pairs, verdicts, ground, counts, metrics, errors, failed,
    reviewReady: has("review.ready"), reconciled: has("reconcile.done"), log,
    narration: narrate(activeKey, events, ctx.approved, failed, { a: fa.length, b: fb.length, blocks: blocks.length }),
  };
}

// ------------------------------------------------------------------ events -> visual effects
export type Effect =
  | { kind: "packet"; from: NodeKey; to: NodeKey; color: string; size?: number }
  | { kind: "burst"; at: NodeKey; color: string; n?: number }
  | { kind: "ring"; at: NodeKey; color: string }
  | { kind: "pop"; at: NodeKey; text: string; color: string }
  | { kind: "glitch"; at: NodeKey }
  | { kind: "confetti" }
  | { kind: "shake" };

export const COLORS = { a: "#b06cff", b: "#2de2c4", ok: "#52f08a", warn: "#ffd34d", bad: "#ff5d78", info: "#2ee6ff", white: "#eaf6ff" };
const verdictColor = (s: string) => (s === "agreed" ? COLORS.ok : s === "review" ? COLORS.warn : COLORS.bad);

/** One real event becomes zero or more effects. Unknown events produce nothing: no invented activity. */
export function effectsFor(e: Ev): Effect[] {
  const p = e.payload;
  switch (e.type) {
    case "parse.started": return [{ kind: "ring", at: "doc", color: COLORS.info }];
    case "parse.block": return [{ kind: "packet", from: "doc", to: "parse", color: COLORS.white, size: 1 }];
    case "parse.done": return [{ kind: "burst", at: "parse", color: COLORS.info }, { kind: "pop", at: "parse", text: `${num(p.blocks)}`, color: COLORS.info }];
    case "extract.a.started": return [{ kind: "ring", at: "a", color: COLORS.a }];
    case "extract.b.started": return [{ kind: "ring", at: "b", color: COLORS.b }];
    case "extract.a.field": return [{ kind: "packet", from: "parse", to: "a", color: COLORS.a }, { kind: "pop", at: "a", text: "+1", color: COLORS.a }];
    case "extract.b.field": return [{ kind: "packet", from: "parse", to: "b", color: COLORS.b }, { kind: "pop", at: "b", text: "+1", color: COLORS.b }];
    case "extract.a.done": return [{ kind: "burst", at: "a", color: COLORS.a }];
    case "extract.b.done": return [{ kind: "burst", at: "b", color: COLORS.b }];
    case "extract.a.failed": return [{ kind: "glitch", at: "a" }, { kind: "burst", at: "a", color: COLORS.bad, n: 24 }];
    case "extract.b.failed": return [{ kind: "glitch", at: "b" }, { kind: "burst", at: "b", color: COLORS.bad, n: 24 }];
    case "ground.a.done": return [{ kind: "packet", from: "a", to: "ground", color: COLORS.a }, num(p.fail) ? { kind: "burst", at: "ground", color: COLORS.bad } : { kind: "ring", at: "ground", color: COLORS.ok }];
    case "ground.b.done": return [{ kind: "packet", from: "b", to: "ground", color: COLORS.b }, num(p.fail) ? { kind: "burst", at: "ground", color: COLORS.bad } : { kind: "ring", at: "ground", color: COLORS.ok }];
    case "reconcile.field": {
      const s = str(p.status) || "review";
      return [{ kind: "packet", from: "ground", to: "recon", color: COLORS.info, size: 1 }, { kind: "packet", from: "recon", to: s === "agreed" ? "lock" : "human", color: verdictColor(s) }, { kind: "ring", at: "recon", color: verdictColor(s) }];
    }
    case "reconcile.done": return [{ kind: "burst", at: "recon", color: COLORS.ok, n: 28 }];
    case "review.ready": return [{ kind: "ring", at: "human", color: COLORS.warn }, { kind: "burst", at: "human", color: COLORS.warn }];
    case "run.failed": return [{ kind: "shake" }];
    default: return [];
  }
}

/** Effect fired once, the moment the run is approved (from the run status, not from an event). */
export const approvalEffects = (): Effect[] => [{ kind: "packet", from: "human", to: "lock", color: COLORS.ok }, { kind: "ring", at: "lock", color: COLORS.ok }, { kind: "burst", at: "lock", color: COLORS.ok, n: 30 }, { kind: "confetti" }, { kind: "shake" }];
