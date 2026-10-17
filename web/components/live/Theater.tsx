"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/staff/icons";
import { api } from "@/lib/api";
import { CATEGORY_ATTRS, CATEGORY_LABEL, VOTER_LABEL, currentAttrs, timeAgo } from "@/lib/review";
import type { ApiEvent, Attrs, ReviewData, ReviewField, RunMeta } from "@/lib/types";
import { useRunEvents } from "@/lib/useEventStream";

type Ev = ApiEvent;
type StageDef = { key: string; label: string; icon: keyof typeof Icon; started: (t: string) => boolean; finished: (t: string) => boolean };

const has = (t: string, ...p: string[]) => p.some((x) => t.startsWith(x));
const STAGES: StageDef[] = [
  { key: "received", label: "Document received", icon: "file", started: () => true, finished: () => true },
  { key: "parse", label: "Parsing and segmentation", icon: "list", started: (t) => has(t, "parse."), finished: (t) => t === "parse.done" },
  { key: "a", label: "Extractor A", icon: "spark", started: (t) => has(t, "extract.a."), finished: (t) => t === "extract.a.done" || t === "extract.a.failed" },
  { key: "b", label: "Extractor B", icon: "spark", started: (t) => has(t, "extract.b."), finished: (t) => t === "extract.b.done" || t === "extract.b.failed" },
  { key: "ground", label: "Validation and evidence check", icon: "shield", started: (t) => has(t, "ground."), finished: (t) => t === "ground.b.done" },
  { key: "reconcile", label: "Reconciliation", icon: "layers", started: (t) => has(t, "reconcile."), finished: (t) => t === "reconcile.done" },
  { key: "review", label: "Human review", icon: "user", started: (t) => t === "review.ready", finished: () => false },
  { key: "approve", label: "Approval and lock", icon: "lock", started: () => false, finished: () => false },
];

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const ms = (e: Ev) => new Date(e.ts).getTime();
const mmss = (t: number) => `${String(Math.floor(t / 60000)).padStart(2, "0")}:${String(Math.floor((t % 60000) / 1000)).padStart(2, "0")}`;
const summarize = (a: Attrs | null) => (a ? Object.values(a).filter(Boolean).join(" · ") : "Nothing read");

function describe(e: Ev): { title: string; detail: string; tone: "ok" | "info" | "warn" | "bad" } | null {
  const p = e.payload;
  switch (e.type) {
    case "parse.started": return { title: "Reading the document", detail: str(p.filename), tone: "info" };
    case "parse.done": return { title: "Document parsed", detail: `${num(p.blocks)} blocks found`, tone: "ok" };
    case "extract.a.started": case "extract.b.started": return { title: `Extractor ${e.type[8].toUpperCase()} started`, detail: str(p.model), tone: "info" };
    case "extract.a.done": case "extract.b.done": return { title: `Extractor ${e.type[8].toUpperCase()} completed`, detail: `${num(p.fields)} fields found`, tone: "ok" };
    case "extract.a.failed": case "extract.b.failed": return { title: `Extractor ${e.type[8].toUpperCase()} failed`, detail: str(p.error).slice(0, 90), tone: "bad" };
    case "ground.a.done": case "ground.b.done": return { title: `Evidence check for ${e.type[7].toUpperCase()} finished`, detail: `${num(p.pass)} verified, ${num(p.fail)} failed`, tone: num(p.fail) ? "warn" : "ok" };
    case "reconcile.done": return { title: "Reconciliation completed", detail: `${num(p.agreed)} fields agreed, ${num(p.review) + num(p.conflict) + num(p.rejected)} need review`, tone: "ok" };
    case "review.ready": return { title: "Ready for human review", detail: "Waiting for the care team", tone: "warn" };
    case "run.failed": return { title: "Run failed", detail: str(p.error).slice(0, 90), tone: "bad" };
    default: return /\.(field|block)$/.test(e.type) ? null : { title: e.type, detail: "", tone: "info" };
  }
}

function useRuns() {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  useEffect(() => { api.listRuns().then(setRuns).catch(() => undefined); }, []);
  return runs;
}

export default function Theater({ runId }: { runId: string }) {
  const router = useRouter();
  const runs = useRuns();
  const live = useRunEvents(runId, true);
  const [run, setRun] = useState<RunMeta | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const [voter, setVoter] = useState<string>("A");

  // The REST status is the source of truth for review/approval; events drive everything before that.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api.getRun(runId);
        if (!alive) return;
        setRun(r);
        if (r.status === "needs_review" || r.status === "approved") api.getReview(runId).then((d) => alive && setReview(d)).catch(() => undefined);
        if (r.status !== "approved" && r.status !== "failed") timer = setTimeout(tick, 3000);
      } catch { if (alive) timer = setTimeout(tick, 5000); }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  useEffect(() => {
    if (replayAt === null) return;
    if (replayAt >= live.length) { setReplayAt(null); return; }
    const id = setTimeout(() => setReplayAt(replayAt + 1), 320);
    return () => clearTimeout(id);
  }, [replayAt, live.length]);

  const replaying = replayAt !== null;
  const events = replaying ? live.slice(0, replayAt) : live;
  const approved = !replaying && run?.status === "approved";
  const failed = !replaying && (run?.status === "failed" || events.some((e) => e.type === "run.failed"));
  const t0 = live.length ? ms(live[0]) : 0;

  const stages = useMemo(() => {
    const types = events.map((e) => e.type);
    return STAGES.map((s) => {
      let done = s.key === "received" ? events.length > 0 : s.key === "review" || s.key === "approve" ? approved : types.some(s.finished);
      if (s.key === "review" && approved) done = true;
      const active = !done && (s.key === "approve" ? false : s.key === "review" ? types.includes("review.ready") : events.length > 0 && types.some(s.started));
      const at = events.find((e) => s.finished(e.type) && s.key !== "received" && s.key !== "review" && s.key !== "approve");
      return { ...s, done, active, time: s.key === "received" ? "00:00" : at ? mmss(ms(at) - t0) : "--" };
    });
  }, [events, approved, t0]);

  const log = useMemo(() => events.flatMap((e) => { const d = describe(e); return d ? [{ e, ...d }] : []; }).reverse(), [events]);
  const blocks = useMemo(() => events.filter((e) => e.type === "parse.block").map((e) => e.payload as { block_id: string; type: string; preview: string }), [events]);
  const model = (k: "a" | "b") => str(events.find((e) => e.type === `extract.${k}.started`)?.payload.model) || `Model ${k.toUpperCase()}`;
  const done = (key: string) => stages.find((s) => s.key === key)?.done ?? false;
  const act = (key: string) => stages.find((s) => s.key === key)?.active ?? false;

  const rd = replaying ? null : review;
  const focus: ReviewField | undefined = rd?.fields.find((f) => f.field.status !== "agreed") ?? rd?.fields[0];
  const reconcileDone = events.findLast((e) => e.type === "reconcile.done")?.payload;
  const counts = rd?.run.counts ?? (reconcileDone ? { agreed: num(reconcileDone.agreed), review: num(reconcileDone.review), conflict: num(reconcileDone.conflict), rejected: num(reconcileDone.rejected) } : null);
  const total = counts ? counts.agreed + counts.review + counts.conflict + counts.rejected : 0;
  const toCheck = counts ? counts.review + counts.conflict + counts.rejected : 0;
  const opinion = focus?.field.opinions.find((o) => o.voter === voter) ?? focus?.field.opinions[0];

  return (
    <div className="tt">
      <div className="tt-head">
        <div>
          <h1>Live processing theater
            <span className={`tt-live${replaying ? " is-replay" : failed || approved || (run && run.status !== "processing" && run.status !== "queued") ? " is-idle" : ""}`}>
              <i className="rr-dot is-live" />{replaying ? "REPLAY" : run && (run.status === "processing" || run.status === "queued") ? "LIVE" : "FINISHED"}
            </span>
          </h1>
          <p className="rr-sub">Watch how RecoverRight turns a discharge document into a safe, approved care plan.</p>
        </div>
        <div className="tt-tools">
          <select className="tt-select" value={runId} onChange={(e) => router.push(`/live/${e.target.value}`)} aria-label="Choose a run">
            {!runs.some((r) => r.run_id === runId) && <option value={runId}>{run?.filename ?? runId}</option>}
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.filename} · {timeAgo(r.created_at)}</option>)}
          </select>
          <button className="rr-btn rr-btn--ghost" disabled={live.length === 0} onClick={() => setReplayAt(1)}><Icon.replay size={16} /> Replay</button>
        </div>
      </div>

      <div className="rr-card tt-stepper">
        {stages.map((s) => {
          const I = Icon[s.icon] ?? Icon.file;
          return (
            <div key={s.key} className={`tt-stage${s.done ? " is-done" : ""}${s.active ? " is-active" : ""}`}>
              <span className="tt-stage-ic">{s.done ? <Icon.check size={22} /> : <I size={22} />}</span>
              {s.label}
              <small>{s.time}{s.key === "review" && s.active && toCheck > 0 && <span className="tt-badge">{toCheck}</span>}</small>
            </div>
          );
        })}
      </div>

      <div className="tt-mid">
        <div className="rr-card tt-stage-box">
          <div className="tt-doc" aria-label="Document preview">
            {blocks.length === 0 ? <p className="tt-doc-empty">The document appears here as it is read.</p> : blocks.map((b) => (
              <motion.p key={b.block_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`${b.type === "heading" ? "is-h" : b.type === "table_row" ? "is-t" : ""}${focus?.field.block_id === b.block_id ? " is-hit" : ""}`}>
                {b.type === "list_item" ? "• " : ""}{b.preview}
              </motion.p>
            ))}
          </div>
          <div className="tt-flow">
            <div className="tt-flow-row">
              <Node label="Document" icon={<Icon.file size={22} />} on={done("parse") ? "done" : act("parse") ? "active" : done("received") ? "done" : ""} />
              <Link2 on={act("a") || act("b")} />
              <div className="tt-ext">
                <div>Extractor A<small>{model("a")}</small></div>
                <div>Extractor B<small>{model("b")}</small></div>
              </div>
              <Link2 on={act("ground")} />
              <Node label="Validation" icon={<Icon.shield size={22} />} on={done("ground") ? "done" : act("ground") ? "active" : ""} />
            </div>
            <div className="tt-flow-row">
              <Node label="Reconciliation" icon={<Icon.layers size={22} />} on={done("reconcile") ? "done" : act("reconcile") ? "active" : ""} />
              <Link2 on={act("reconcile")} />
              <Node label="Human review" icon={<Icon.user size={22} />} on={done("review") ? "done" : act("review") ? "active" : ""} />
              <Link2 on={act("review")} />
              <Node label="Approved plan" icon={<Icon.lock size={22} />} on={approved ? "done" : ""} />
            </div>
          </div>
        </div>

        <div className="rr-card tt-events">
          <h2>Events</h2>
          {log.length === 0 ? <small>Waiting for the first event…</small> : (
            <ul>
              {log.map(({ e, title, detail, tone }) => (
                <li key={e.seq}>
                  <time>{mmss(ms(e) - t0)}</time>
                  <i className={`cc-alert-i t-${tone}`} style={{ background: `var(--${tone === "ok" ? "ok" : tone === "bad" ? "bad" : tone === "warn" ? "warn" : "info"}-bg)`, color: `var(--${tone === "ok" ? "ok" : tone === "bad" ? "bad" : tone === "warn" ? "warn" : "info"})` }}>
                    {tone === "ok" ? <Icon.check size={15} /> : tone === "bad" ? <Icon.x size={15} /> : tone === "warn" ? <Icon.alert size={15} /> : <Icon.clock size={15} />}
                  </i>
                  <div><b>{title}</b>{detail && <small>{detail}</small>}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="tt-bottom">
        <div className="rr-card">
          <div className="cc-panel-head"><h2>Compare the sources</h2></div>
          {!focus || !opinion ? <small>Comparisons appear once the run reaches human review.</small> : (
            <>
              <div className="tt-cmp-name">
                <span><small>{CATEGORY_LABEL[focus.field.category] ?? focus.field.category}</small><br /><b>{summarize(focus.field.proposed).split(" · ")[0]}</b></span>
                <span className={`rr-pill rr-pill--${focus.field.status === "agreed" ? "ok" : "warn"}`}>{focus.field.status === "agreed" ? "Agreed" : "Needs review"}</span>
              </div>
              <div className="tt-tabs" role="tablist">
                {focus.field.opinions.map((o) => (
                  <button key={o.voter} role="tab" aria-selected={opinion.voter === o.voter} className={`tt-tab${opinion.voter === o.voter ? " is-on" : ""}`} onClick={() => setVoter(o.voter)}>{VOTER_LABEL[o.voter] ?? o.voter}</button>
                ))}
              </div>
              <div className="tt-voters">
                {focus.field.opinions.map((o) => (
                  <div key={o.voter} className={`tt-voter${o.trusted ? "" : " is-bad"}`}>
                    <small>{VOTER_LABEL[o.voter] ?? o.voter}{o.trusted ? "" : " · not verified"}</small>
                    “{o.quote}”
                  </div>
                ))}
              </div>
              <div className="tt-result">
                <small>Reconciled value</small>
                <b>{summarize(currentAttrs(focus))}</b>
                {focus.field.issues[0] && <small>Flagged: {focus.field.issues[0]}</small>}
              </div>
              <p style={{ marginTop: 12 }}><Link className="rr-link" href={`/staff/runs/${runId}/review`}>Open in review <Icon.arrow size={14} /></Link></p>
            </>
          )}
        </div>

        <div className="rr-card">
          <div className="cc-panel-head"><h2>Patient impact</h2></div>
          {!counts ? <small>Numbers appear after reconciliation.</small> : (
            <div className="tt-impact">
              <div><i className="t-ok" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon.shield size={20} /></i><span><b>{counts.agreed}</b><small>Agreed fields (out of {total} total)</small></span></div>
              <div><i style={{ background: "var(--warn-bg)", color: "var(--warn)" }}><Icon.alert size={20} /></i><span><b>{counts.review}</b><small>Fields need review</small></span></div>
              <div><i style={{ background: "var(--info-bg)", color: "var(--info)" }}><Icon.user size={20} /></i><span><b>{counts.conflict}</b><small>Conflicts</small></span></div>
              <div><i style={{ background: "var(--bad-bg)", color: "var(--bad)" }}><Icon.x size={20} /></i><span><b>{counts.rejected}</b><small>Rejected</small></span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Node({ label, icon, on }: { label: string; icon: ReactNode; on: "" | "done" | "active" }) {
  return <div className={`tt-node${on ? ` is-${on}` : ""}`}><i>{icon}</i>{label}</div>;
}
function Link2({ on }: { on: boolean }) {
  return <span className={`tt-link${on ? " is-on" : ""}`} />;
}
