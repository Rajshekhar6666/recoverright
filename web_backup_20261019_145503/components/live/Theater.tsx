"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_LABEL, VOTER_LABEL, currentAttrs, timeAgo } from "@/lib/review";
import type { ApiEvent, Attrs, ReviewData, RunMeta } from "@/lib/types";
import { useLiveRun } from "@/lib/useLiveRun";

type Ev = ApiEvent;
const startsAny = (t: string, ...p: string[]) => p.some((x) => t.startsWith(x));
const STAGES = [
  { key: "received", label: "Document received", started: () => true, finished: () => true },
  { key: "parse", label: "Parsing", started: (t: string) => startsAny(t, "parse."), finished: (t: string) => t === "parse.done" },
  { key: "a", label: "Extractor A", started: (t: string) => startsAny(t, "extract.a."), finished: (t: string) => t === "extract.a.done" || t === "extract.a.failed" },
  { key: "b", label: "Extractor B", started: (t: string) => startsAny(t, "extract.b."), finished: (t: string) => t === "extract.b.done" || t === "extract.b.failed" },
  { key: "ground", label: "Evidence check", started: (t: string) => startsAny(t, "ground."), finished: (t: string) => t === "ground.b.done" },
  { key: "reconcile", label: "Reconciliation", started: (t: string) => startsAny(t, "reconcile."), finished: (t: string) => t === "reconcile.done" },
  { key: "review", label: "Human review", started: (t: string) => t === "review.ready", finished: () => false },
  { key: "approve", label: "Approved and locked", started: () => false, finished: () => false },
] as const;

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const ms = (e: Ev) => new Date(e.ts).getTime();
const clock = (t: number) => `${String(Math.floor(Math.max(0, t) / 60000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, t) % 60000) / 1000)).padStart(2, "0")}`;
const flat = (v: unknown): string => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>).filter(Boolean).join(" · ") : str(v));
const summarize = (a: Attrs | null) => (a ? Object.values(a).filter(Boolean).join(" · ") : "Nothing read");

function narrate(active: string, events: Ev[], approved: boolean, failed: boolean): { big: string; small: string } {
  const n = (t: string) => events.filter((e) => e.type === t).length;
  if (failed) return { big: "This run stopped with an error.", small: "Check the event log for the reason." };
  if (events.length === 0) return { big: "Waiting for a document.", small: "Upload one in the care-team console and it appears here the moment it starts." };
  if (approved) return { big: "The care team approved the plan. It is now locked.", small: "Every field was checked by software, then by a person." };
  switch (active) {
    case "parse": return { big: "Reading the document, block by block.", small: `${n("parse.block")} blocks found so far. Tables stay tables, so a dose stays next to its drug.` };
    case "a": case "b": return { big: "Two AI readers extract the plan independently.", small: `Reader A found ${n("extract.a.field")} fields, reader B found ${n("extract.b.field")}. Each one must quote its source.` };
    case "ground": return { big: "Checking every quote against the original text.", small: "A value with no matching quote is not trusted, however confident the AI sounded." };
    case "reconcile": return { big: "Comparing the readers and the table reader.", small: "Agreement is not enough: vague text such as “1-2 tablets” still goes to a person." };
    case "review": return { big: "Waiting for a nurse to check the flagged fields.", small: "Nothing reaches the patient until staff approve it." };
    default: return { big: "Starting up.", small: "The first events are on their way." };
  }
}

function describe(e: Ev): { title: string; detail: string; tone: "ok" | "info" | "warn" | "bad" } | null {
  const p = e.payload;
  const k = e.type.startsWith("extract.") ? e.type[8].toUpperCase() : e.type.startsWith("ground.") ? e.type[7].toUpperCase() : "";
  switch (e.type) {
    case "parse.started": return { title: "Reading the document", detail: str(p.filename), tone: "info" };
    case "parse.done": return { title: "Document parsed", detail: `${num(p.blocks)} blocks`, tone: "ok" };
    case "extract.a.started": case "extract.b.started": return { title: `Reader ${k} started`, detail: str(p.model), tone: "info" };
    case "extract.a.done": case "extract.b.done": return { title: `Reader ${k} finished`, detail: `${num(p.fields)} fields`, tone: "ok" };
    case "extract.a.failed": case "extract.b.failed": return { title: `Reader ${k} failed`, detail: str(p.error).slice(0, 90), tone: "bad" };
    case "ground.a.done": case "ground.b.done": return { title: `Quotes of reader ${k} checked`, detail: `${num(p.pass)} verified, ${num(p.fail)} failed`, tone: num(p.fail) ? "warn" : "ok" };
    case "reconcile.done": return { title: "Reconciliation done", detail: `${num(p.agreed)} agreed, ${num(p.review) + num(p.conflict) + num(p.rejected)} to check`, tone: "ok" };
    case "review.ready": return { title: "Ready for human review", detail: "Waiting for the care team", tone: "warn" };
    case "run.failed": return { title: "Run failed", detail: str(p.error).slice(0, 90), tone: "bad" };
    default: return /\.(field|block)$/.test(e.type) ? null : { title: e.type, detail: "", tone: "info" };
  }
}

export default function Theater({ runId }: { runId: string }) {
  const router = useRouter();
  const { events: live, conn } = useLiveRun(runId);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [run, setRun] = useState<RunMeta | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [replay, setReplay] = useState<{ at: number; playing: boolean; speed: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voter, setVoter] = useState("A");

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const [r, all] = await Promise.all([api.getRun(runId), api.listRuns()]);
        if (!alive) return;
        setRun(r); setRuns(all);
        if (r.status === "needs_review" || r.status === "approved") api.getReview(runId).then((d) => alive && setReview(d)).catch(() => undefined);
        timer = setTimeout(tick, r.status === "approved" || r.status === "failed" ? 8000 : 2500);
      } catch { if (alive) timer = setTimeout(tick, 5000); }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  useEffect(() => {
    if (!replay || !replay.playing) return;
    if (replay.at >= live.length) { setReplay(null); return; }
    const id = setTimeout(() => setReplay((r) => (r ? { ...r, at: r.at + 1 } : r)), 420 / replay.speed);
    return () => clearTimeout(id);
  }, [replay, live.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "SELECT") return;
      if (e.code === "Space" && replay) { e.preventDefault(); setReplay((r) => (r ? { ...r, playing: !r.playing } : r)); }
      if (e.key === "Escape") setReplay(null);
      if (e.key.toLowerCase() === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  const replaying = replay !== null;
  const events = replaying ? live.slice(0, replay.at) : live;
  const approved = !replaying && run?.status === "approved";
  const failed = !replaying && (run?.status === "failed" || events.some((e) => e.type === "run.failed"));
  const busy = !replaying && !approved && !failed && (run ? run.status === "processing" || run.status === "queued" : true);
  const t0 = live.length ? ms(live[0]) : 0;
  const clockNow = replaying ? (events.length ? ms(events[events.length - 1]) : t0) : busy ? now : (live.length ? ms(live[live.length - 1]) : t0);

  const stages = useMemo(() => {
    const types = events.map((e) => e.type);
    return STAGES.map((s) => {
      const startEv = s.key === "received" ? events[0] : events.find((e) => s.started(e.type));
      const endEv = events.find((e) => s.finished(e.type));
      const done = s.key === "received" ? events.length > 0 : s.key === "review" || s.key === "approve" ? approved : types.some(s.finished);
      const active = !done && (s.key === "approve" ? false : s.key === "review" ? types.includes("review.ready") : events.length > 0 && types.some(s.started));
      return { ...s, done, active, start: startEv ? ms(startEv) - t0 : null, end: endEv ? ms(endEv) - t0 : null };
    });
  }, [events, approved, t0]);
  const activeKey = stages.find((s) => s.active)?.key ?? "";

  const blocks = useMemo(() => events.filter((e) => e.type === "parse.block").map((e) => e.payload as { block_id: string; type: string; preview: string }), [events]);
  const fieldsOf = (k: "a" | "b") => events.filter((e) => e.type === `extract.${k}.field`);
  const fa = fieldsOf("a"), fb = fieldsOf("b");
  const lastA = str(fa[fa.length - 1]?.payload.block_id), lastB = str(fb[fb.length - 1]?.payload.block_id);
  const model = (k: "a" | "b") => str(events.find((e) => e.type === `extract.${k}.started`)?.payload.model) || `model ${k.toUpperCase()}`;
  const verdicts = events.filter((e) => e.type === "reconcile.field");
  const groundSum = (k: string) => events.findLast((e) => e.type === `ground.${k}.done`)?.payload;
  const verified = num(groundSum("a")?.pass) + num(groundSum("b")?.pass);
  const rejectedQuotes = num(groundSum("a")?.fail) + num(groundSum("b")?.fail);
  const log = useMemo(() => events.flatMap((e) => { const d = describe(e); return d ? [{ e, ...d }] : []; }).reverse(), [events]);

  const rd = replaying ? null : review;
  const focus = rd?.fields.find((f) => f.field.status !== "agreed") ?? rd?.fields[0];
  const opinion = focus?.field.opinions.find((o) => o.voter === voter) ?? focus?.field.opinions[0];
  const rec = events.findLast((e) => e.type === "reconcile.done")?.payload;
  const counts = rd?.run.counts ?? (rec ? { agreed: num(rec.agreed), review: num(rec.review), conflict: num(rec.conflict), rejected: num(rec.rejected) } : null);
  const toCheck = counts ? counts.review + counts.conflict + counts.rejected : 0;
  const cap = narrate(activeKey, events, approved, failed);
  const newest = runs[0] && runs[0].run_id !== runId && new Date(runs[0].created_at).getTime() > (run ? new Date(run.created_at).getTime() : 0) ? runs[0] : null;
  const total = Math.max(clockNow - t0, 1);

  const status = replaying ? ["replay", "REPLAY"] : conn === "retrying" ? ["warn", "RECONNECTING"] : busy ? ["live", "LIVE"] : ["idle", approved ? "APPROVED" : failed ? "FAILED" : "FINISHED"];

  return (
    <div className="tt">
      <header className="tt-bar">
        <div className="tt-logo"><b>RecoverRight</b><span>Live theater</span></div>
        <span className={`tt-pill is-${status[0]}`}><i />{status[1]}</span>
        <div className="tt-bar-right">
          <select className="tt-select" value={runId} onChange={(e) => router.push(`/live/${e.target.value}`)} aria-label="Choose a run">
            {!runs.some((r) => r.run_id === runId) && <option value={runId}>{run?.filename ?? runId}</option>}
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.filename} · {timeAgo(r.created_at)}</option>)}
          </select>
          {!replaying
            ? <button className="tt-btn" disabled={live.length === 0} onClick={() => setReplay({ at: 1, playing: true, speed: 1 })}>Replay</button>
            : <>
                <button className="tt-btn" onClick={() => setReplay({ ...replay, playing: !replay.playing })}>{replay.playing ? "Pause" : "Play"}</button>
                {[1, 2, 4].map((s) => <button key={s} className={`tt-btn tt-btn--sm${replay.speed === s ? " is-on" : ""}`} onClick={() => setReplay({ ...replay, speed: s })}>{s}x</button>)}
                <input className="tt-scrub" type="range" min={0} max={live.length} value={replay.at} onChange={(e) => setReplay({ ...replay, at: Number(e.target.value), playing: false })} aria-label="Replay position" />
                <button className="tt-btn" onClick={() => setReplay(null)}>Back to live</button>
              </>}
          <button className="tt-btn tt-btn--sm" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} aria-label="Toggle full screen">Full screen</button>
        </div>
      </header>

      <AnimatePresence>
        {newest && !replaying && (
          <motion.div className="tt-new" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            A new document just started: <b>{newest.filename}</b>
            <button className="tt-btn tt-btn--sm" onClick={() => router.push(`/live/${newest.run_id}`)}>Watch it</button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="tt-cap" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={cap.big} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <h1>{cap.big}</h1><p>{cap.small}</p>
          </motion.div>
        </AnimatePresence>
        <div className="tt-clock"><b>{clock(clockNow - t0)}</b><small>elapsed</small></div>
      </section>

      <section className="tt-rail">
        {stages.map((s) => (
          <div key={s.key} className={`tt-st${s.done ? " is-done" : ""}${s.active ? " is-active" : ""}`}>
            <i>{s.done ? "✓" : s.active ? <span className="tt-spin" /> : ""}</i>
            <b>{s.label}</b>
            <small>{s.end !== null && s.key !== "received" ? clock(s.end) : s.key === "review" && s.active && toCheck ? `${toCheck} to check` : s.active ? "working" : ""}</small>
          </div>
        ))}
      </section>

      <div className="tt-grid">
        <section className="tt-panel tt-doc">
          <h2>The document</h2>
          <div className="tt-doc-body">
            {blocks.length === 0 ? <p className="tt-empty">It appears here as it is read.</p> : blocks.map((b) => (
              <motion.p key={b.block_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`${b.type === "heading" ? "is-h" : b.type === "table_row" ? "is-t" : ""}${b.block_id === lastA ? " hit-a" : ""}${b.block_id === lastB ? " hit-b" : ""}${focus?.field.block_id === b.block_id ? " hit-f" : ""}`}>
                {b.type === "list_item" ? "• " : ""}{b.preview}
              </motion.p>
            ))}
          </div>
          <small className="tt-legend"><i className="a" /> where A just read <i className="b" /> where B just read</small>
        </section>

        <section className="tt-panel tt-race">
          <h2>Two readers, one document</h2>
          <div className="tt-race-cols">
            {([["A", "a", fa], ["B", "b", fb]] as const).map(([L, k, list]) => (
              <div key={k} className={`tt-col tt-col--${k}`}>
                <header><b>Reader {L}</b><small>{model(k)}</small><span>{list.length}</span></header>
                <ul>
                  <AnimatePresence initial={false}>
                    {list.slice(-7).reverse().map((e) => (
                      <motion.li key={e.seq} layout initial={{ opacity: 0, x: k === "a" ? -14 : 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                        <small>{str(e.payload.path).replace(/\[\d+\]/, "")}</small>
                        <b>{flat(e.payload.value) || "—"}</b>
                        <em>“{str(e.payload.source_quote).slice(0, 70)}”</em>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {list.length === 0 && <li className="tt-empty">Not started</li>}
                </ul>
              </div>
            ))}
          </div>
          <div className="tt-verdicts">
            <small>Verdicts as they arrive</small>
            <div>
              {verdicts.length === 0 ? <span className="tt-empty">After both readers finish and their quotes are checked.</span> : verdicts.map((e) => {
                const st = str(e.payload.status) || "review";
                return <motion.span key={e.seq} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`tt-v tt-v--${st}`}>{CATEGORY_LABEL[str(e.payload.category)] ?? (str(e.payload.category) || str(e.payload.field_id) || "field")}</motion.span>;
              })}
            </div>
          </div>
        </section>

        <section className="tt-panel tt-log">
          <h2>Events</h2>
          <div className="tt-nums">
            <div><b>{blocks.length}</b><small>blocks</small></div>
            <div><b>{fa.length + fb.length}</b><small>fields read</small></div>
            <div><b>{verified}</b><small>quotes verified</small></div>
            <div className={rejectedQuotes ? "is-bad" : ""}><b>{rejectedQuotes}</b><small>quotes failed</small></div>
          </div>
          <ul>
            {log.length === 0 && <li className="tt-empty">Waiting for the first event…</li>}
            {log.map(({ e, title, detail, tone }) => (
              <li key={e.seq}><time>{clock(ms(e) - t0)}</time><i className={`t-${tone}`} /><div><b>{title}</b>{detail && <small>{detail}</small>}</div></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="tt-bottom">
        <section className="tt-panel">
          <h2>Where the time went</h2>
          <div className="tt-gantt">
            {stages.filter((s) => s.key !== "received" && s.key !== "approve").map((s) => {
              const st = s.start ?? 0;
              const en = s.end ?? (s.active ? clockNow - t0 : st);
              return (
                <div key={s.key} className="tt-gr">
                  <small>{s.label}</small>
                  <div><i className={s.done ? "is-done" : ""} style={{ left: `${(st / total) * 100}%`, width: `${Math.max(((en - st) / total) * 100, s.start !== null ? 1 : 0)}%` }} /></div>
                  <time>{s.start !== null ? clock(en - st) : ""}</time>
                </div>
              );
            })}
          </div>
        </section>

        <section className="tt-panel">
          <h2>What the sources said</h2>
          {!focus || !opinion ? <p className="tt-empty">Appears once the run reaches human review.</p> : (
            <>
              <div className="tt-cmp-h"><span>{CATEGORY_LABEL[focus.field.category] ?? focus.field.category}</span><em className={`tt-v tt-v--${focus.field.status}`}>{focus.field.status === "agreed" ? "Agreed" : "Needs review"}</em></div>
              <div className="tt-tabs">{focus.field.opinions.map((o) => <button key={o.voter} className={opinion.voter === o.voter ? "is-on" : ""} onClick={() => setVoter(o.voter)}>{VOTER_LABEL[o.voter] ?? o.voter}</button>)}</div>
              <p className="tt-quote">“{opinion.quote}”{!opinion.trusted && <small> · quote did not verify</small>}</p>
              <div className="tt-result"><small>Reconciled value</small><b>{summarize(currentAttrs(focus))}</b>{focus.field.issues[0] && <small>Flagged: {focus.field.issues[0]}</small>}</div>
            </>
          )}
        </section>

        <section className="tt-panel">
          <h2>Result so far</h2>
          {!counts ? <p className="tt-empty">Appears after reconciliation.</p> : (
            <div className="tt-impact">
              <div className="ok"><b>{counts.agreed}</b><small>agreed</small></div>
              <div className="warn"><b>{counts.review}</b><small>need review</small></div>
              <div className="info"><b>{counts.conflict}</b><small>conflicts</small></div>
              <div className="bad"><b>{counts.rejected}</b><small>rejected</small></div>
            </div>
          )}
          <p className="tt-keys"><kbd>F</kbd> full screen · <kbd>Space</kbd> pause replay · <kbd>Esc</kbd> back to live</p>
        </section>
      </div>
      <footer className="tt-foot"><Link href="/live">All runs</Link></footer>
    </div>
  );
}
