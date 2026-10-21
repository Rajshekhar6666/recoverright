"use client";
import { memo, useState } from "react";
import { clock, evMs, flat, type Ev, type PairRow, type StageKey, type StageView, type TheaterModel, type Tone } from "@/lib/theater/model";
import { PixelIcon } from "./Pixel";

export interface ReconRow { id: string; category: string; status: string; final: string; issues: string[]; blockId?: string }
const STATUS_TEXT: Record<string, string> = { agreed: "AGREED", review: "REVIEW", conflict: "CONFLICT", rejected: "REJECTED" };
const label = (cat: string, map: Record<string, string>) => map[cat] ?? cat.replace(/_/g, " ");
const SPRITE_OF_STAGE: Record<StageKey, "doc" | "parse" | "chip" | "shield" | "core" | "nurse" | "lock"> = { received: "doc", parse: "parse", a: "chip", b: "chip", ground: "shield", reconcile: "core", review: "nurse", approve: "lock" };

// ------------------------------------------------------------------ stage rail
export const StageRail = memo(function StageRail({ stages, nowMs, t0, busy }: { stages: StageView[]; nowMs: number; t0: number; busy: boolean }) {
  return (
    <ol className="lt-rail" aria-label="Pipeline stages">
      {stages.map((s, i) => {
        const state = s.failed ? "failed" : s.done ? "done" : s.active ? (s.key === "review" ? "waiting" : "active") : "idle";
        const dur = s.active && s.startMs !== null && busy ? nowMs - t0 - s.startMs : s.startMs !== null && s.endMs !== null ? s.endMs - s.startMs : null;
        const prev = i > 0 ? stages[i - 1] : null;
        return (
          <li key={s.key} className={`lt-st is-${state}`} aria-current={s.active ? "step" : undefined}>
            {prev && <i className={`lt-conn${prev.done && (s.done || s.active) ? " is-lit" : ""}${s.active && !s.failed ? " is-flow" : ""}`} aria-hidden="true" />}
            <div className="lt-st-ic"><PixelIcon name={SPRITE_OF_STAGE[s.key]} scale={4} who={s.key === "a" ? "a" : s.key === "b" ? "b" : undefined} dim={state === "idle"} /></div>
            <b>{i + 1}. {s.label}</b>
            <span className="lt-st-t">{s.startMs !== null ? clock(s.startMs) : "--:--"}{dur !== null && dur > 0 && s.key !== "received" ? ` · ${(dur / 1000).toFixed(dur < 10000 ? 1 : 0)}s` : ""}</span>
            <em className="lt-st-s">{state === "done" ? "DONE" : state === "active" ? "WORKING" : state === "waiting" ? "WAITING" : state === "failed" ? "FAILED" : "PENDING"}</em>
          </li>
        );
      })}
    </ol>
  );
});

// ------------------------------------------------------------------ source document
export const SourcePanel = memo(function SourcePanel({ m, focusBlock }: { m: TheaterModel; focusBlock?: string }) {
  const la = m.fa[m.fa.length - 1], lb = m.fb[m.fb.length - 1];
  return (
    <section className="lt-panel lt-src" aria-label="Source document">
      <h3>SOURCE DOCUMENT <small>{m.blocks.length} blocks</small></h3>
      <div className="lt-src-scroll">
        {m.blocks.length === 0 ? <p className="lt-empty">No document yet.</p> : (
          <ul>
            {m.blocks.map((b, i) => {
              const hit = [la?.blockId === b.id ? "hit-a" : "", lb?.blockId === b.id ? "hit-b" : "", focusBlock === b.id ? "hit-f" : ""].filter(Boolean).join(" ");
              return <li key={b.id || i} className={`${b.type === "heading" ? "is-h" : b.type === "table_row" ? "is-t" : ""} ${hit}`}><i>{b.id}</i>{b.preview}</li>;
            })}
          </ul>
        )}
      </div>
      <div className="lt-legend" aria-label="Highlight legend"><span className="a">READER A</span><span className="b">READER B</span><span className="f">FLAGGED</span></div>
      {(la || lb) && (
        <div className="lt-reading" aria-label="Quotes being read">
          {la && <p className="a"><b>A</b> “{la.quote.slice(0, 90)}”</p>}
          {lb && <p className="b"><b>B</b> “{lb.quote.slice(0, 90)}”</p>}
        </div>
      )}
    </section>
  );
});

// ------------------------------------------------------------------ A vs B + reconciled
function ValueCells({ row, side }: { row: PairRow; side: "a" | "b" }) {
  const f = row[side];
  if (!f) return <span className="lt-miss">not found</span>;
  const entries = Object.entries(f.value).filter(([, v]) => v !== null && v !== "" && v !== undefined);
  if (!entries.length) return <span className="lt-miss">empty</span>;
  return <>{entries.map(([k, v], i) => <span key={k} className={row.diffKeys.includes(k) ? "d" : ""}>{i > 0 ? " · " : ""}{flat(v)}</span>)}</>;
}

export const ComparePanel = memo(function ComparePanel({ m, recon, models, labels }: { m: TheaterModel; recon: ReconRow[]; models: { a: string; b: string }; labels: Record<string, string> }) {
  const [tab, setTab] = useState<"diff" | "final">("diff");
  const showFinal = tab === "final";
  return (
    <section className="lt-panel lt-cmp" aria-label="Field by field comparison">
      <h3>
        <span>FIELD-BY-FIELD</span>
        <span className="lt-tabs" role="tablist">
          <button role="tab" aria-selected={!showFinal} className={!showFinal ? "is-on" : ""} onClick={() => setTab("diff")}>READER A vs B <small>{m.pairs.length}</small></button>
          <button role="tab" aria-selected={showFinal} className={showFinal ? "is-on" : ""} onClick={() => setTab("final")}>RECONCILED <small>{recon.length}</small></button>
        </span>
      </h3>
      <div className="lt-cmp-scroll">
        {!showFinal ? (
          m.pairs.length === 0 ? <p className="lt-empty">Waiting for the readers to report their first field.</p> : (
            <table>
              <thead><tr><th>Field</th><th className="a" title={models.a}>Reader A <small>{models.a}</small></th><th className="b" title={models.b}>Reader B <small>{models.b}</small></th><th>Live diff</th></tr></thead>
              <tbody>
                {m.pairs.map((p) => (
                  <tr key={p.id} className={`is-${p.state}`}>
                    <td>{label(p.category, labels)}</td>
                    <td className="a"><ValueCells row={p} side="a" /></td>
                    <td className="b"><ValueCells row={p} side="b" /></td>
                    <td>{p.state === "same" ? <em className="ok">MATCH</em> : p.state === "diff" ? <em className="warn">DIFFERS: {p.diffKeys.join(", ").toUpperCase()}</em> : <em className="bad">{p.state === "only-a" ? "ONLY A" : "ONLY B"}</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : recon.length === 0 ? <p className="lt-empty">The reconciled result appears when reconciliation finishes.</p> : (
          <table>
            <thead><tr><th>Field</th><th>Final value</th><th>Status</th><th>Why</th></tr></thead>
            <tbody>
              {recon.map((r) => (
                <tr key={r.id} className={`is-${r.status === "agreed" ? "same" : "diff"}`}>
                  <td>{label(r.category, labels)}</td><td>{r.final || <span className="lt-miss">nothing read</span>}</td>
                  <td><em className={r.status === "agreed" ? "ok" : r.status === "review" ? "warn" : "bad"}>{STATUS_TEXT[r.status] ?? r.status.toUpperCase()}</em></td>
                  <td>{r.issues[0] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
});

// ------------------------------------------------------------------ event log
export const LogPanel = memo(function LogPanel({ log, live }: { log: TheaterModel["log"]; live: boolean }) {
  return (
    <section className="lt-panel lt-log" aria-label="Event log">
      <h3>LIVE EVENTS <small className={live ? "is-live" : ""}>{live ? "STREAMING" : "RECORDED"}</small></h3>
      {log.length === 0 ? <p className="lt-empty">No events yet.</p> : (
        <ol>
          {log.slice(0, 60).map((l) => (
            <li key={l.seq} className={`t-${l.tone}`}>
              <i aria-hidden="true" />
              <time>{clock(l.atMs)}</time>
              <div><b>{l.title}</b>{l.detail && <small>{l.detail}</small>}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

// ------------------------------------------------------------------ verification + final
type Check = { text: string; state: "done" | "active" | "pending" | "warn" };
export const VerifyPanel = memo(function VerifyPanel({ m }: { m: TheaterModel }) {
  const missing = m.metrics.missingA + m.metrics.missingB;
  const checks: Check[] = [
    { text: "Cross-checking values", state: m.reconciled ? "done" : m.pairs.length ? "active" : "pending" },
    { text: m.ground.a || m.ground.b ? `Source evidence: ${m.metrics.verified} quotes verified${m.metrics.failedQuotes ? `, ${m.metrics.failedQuotes} failed` : ""}` : "Checking source evidence", state: m.ground.b ? (m.metrics.failedQuotes ? "warn" : "done") : m.ground.a ? "active" : "pending" },
    { text: m.counts ? `Conflicts: ${m.counts.conflict + m.counts.review} to check` : "Detecting conflicts", state: m.counts ? (m.counts.conflict + m.counts.review ? "warn" : "done") : m.verdicts.length ? "active" : "pending" },
    { text: m.reconciled || m.metrics.missingA + m.metrics.missingB ? `Missing fields flagged: ${missing}` : "Flagging missing fields", state: m.reconciled ? "done" : "pending" },
    { text: "Generating final result", state: m.reviewReady ? "done" : m.reconciled ? "active" : "pending" },
  ];
  return (
    <section className="lt-panel lt-verify" aria-label="Verification">
      <h3>VERIFICATION</h3>
      <ul>
        {checks.map((c) => <li key={c.text} className={`is-${c.state}`}><i aria-hidden="true">{c.state === "done" ? "✓" : c.state === "warn" ? "!" : c.state === "active" ? "…" : "·"}</i>{c.text}</li>)}
      </ul>
    </section>
  );
});

export const FinalPanel = memo(function FinalPanel({ m, recon, approved, failed }: { m: TheaterModel; recon: ReconRow[]; approved: boolean; failed: boolean }) {
  const state = failed ? ["bad", "FAILED"] : approved ? ["ok", "APPROVED & LOCKED"] : m.reviewReady ? ["warn", "READY FOR REVIEW"] : ["info", "IN PROGRESS"];
  const held = recon.filter((r) => r.status !== "agreed");
  const cat = (c: string) => recon.filter((r) => r.category === c);
  // once staff approve, flagged fields count as resolved
  const row = (name: string, cats: string[]) => { const rs = cats.flatMap(cat); const bad = approved ? 0 : rs.filter((r) => r.status !== "agreed").length; return { name, n: rs.length, bad }; };
  const rows = [row("Medications", ["medications"]), row("Instructions", ["wound_care", "activity", "diet"]), row("Follow-ups", ["follow_ups"]), row("Safety alerts", ["warning_signs"])];
  return (
    <section className="lt-panel lt-final" aria-label="Final output and patient impact">
      <h3>FINAL OUTPUT</h3>
      <div className="lt-final-h"><b>Approved Care Plan</b><em className={`is-${state[0]}`}>{state[1]}</em></div>
      <ul>
        {rows.map((r) => <li key={r.name} className={r.n === 0 ? "is-pending" : r.bad ? "is-warn" : "is-done"}><i aria-hidden="true">{r.n === 0 ? "·" : r.bad ? "!" : "✓"}</i>{r.name}<small>{r.n === 0 ? "—" : r.bad ? `${r.bad} to check` : approved ? `${r.n} approved` : `${r.n} ok`}</small></li>)}
      </ul>
      <div className="lt-impact" aria-label="Patient impact">
        <h4>PATIENT IMPACT</h4>
        {recon.length === 0 ? <p>Nothing reconciled yet.</p> : approved ? <p><b>Live for the patient.</b> Staff approved {recon.length} fields.</p> : held.length ? (
          <>
            <p><b>{held.length} field{held.length === 1 ? "" : "s"} held back</b> until a nurse decides. The patient sees none of the plan before approval.</p>
            <ul>{held.slice(0, 3).map((h) => <li key={h.id}>{h.issues[0] || `${h.category.replace(/_/g, " ")}: needs a decision`}</li>)}</ul>
          </>
        ) : <p>All {recon.length} fields agree. Staff still approve before the patient sees anything.</p>}
      </div>
    </section>
  );
});

// ------------------------------------------------------------------ metrics + connection + timeline
export interface ConnInfo { stream: string; tone: Tone; api: string; apiTone: Tone; lastEvent: string; reconnects: number; mode: "live" | "replay" | "demo" }

export const MetricsPanel = memo(function MetricsPanel({ m, rate, elapsed, conn, nowMs, busy }: { m: TheaterModel; rate: number; elapsed: number; conn: ConnInfo; nowMs: number; busy: boolean }) {
  const mx = m.metrics;
  const tiles: [string, string, Tone?][] = [
    ["EVENTS", String(mx.events)], ["EVENTS/S", rate.toFixed(1)], ["BLOCKS", String(mx.blocks)], ["ELAPSED", clock(elapsed)],
    ["FIELDS A", String(mx.fieldsA)], ["FIELDS B", String(mx.fieldsB)], ["QUOTES OK", String(mx.verified), "ok"], ["QUOTES FAIL", String(mx.failedQuotes), mx.failedQuotes ? "bad" : undefined],
    ["A = B", String(mx.agreeing), "ok"], ["A ≠ B", String(mx.differing), mx.differing ? "warn" : undefined],
  ];
  const total = Math.max(1, ...m.stages.map((s) => (s.endMs ?? (s.startMs !== null && busy ? nowMs - m.t0 : s.startMs ?? 0))), elapsed);
  return (
    <section className="lt-panel lt-metrics" aria-label="Processing metrics and connection">
      <h3>METRICS</h3>
      <div className="lt-tiles">{tiles.map(([k, v, t]) => <div key={k} className={t ? `is-${t}` : ""}><small>{k}</small><b>{v}</b></div>)}</div>
      <h4>STAGE TIMINGS</h4>
      <ul className="lt-gantt">
        {m.stages.filter((s) => s.key !== "received" && s.key !== "approve").map((s) => {
          const st = s.startMs ?? 0, en = s.endMs ?? (s.startMs !== null && busy ? nowMs - m.t0 : st);
          return <li key={s.key} className={s.failed ? "is-failed" : s.done ? "is-done" : s.active ? "is-active" : ""}><span>{s.key === "a" ? "READER A" : s.key === "b" ? "READER B" : s.label.split(" ")[0].toUpperCase()}</span><div><i style={{ left: `${(st / total) * 100}%`, width: `${Math.max(s.startMs === null ? 0 : 1.2, ((en - st) / total) * 100)}%` }} /></div></li>;
        })}
      </ul>
      <h4>CONNECTION</h4>
      <dl className="lt-conninfo">
        <dt>Event stream</dt><dd className={`is-${conn.tone}`}>{conn.stream}</dd>
        <dt>API</dt><dd className={`is-${conn.apiTone}`}>{conn.api}</dd>
        <dt>Last event</dt><dd>{conn.lastEvent}</dd>
        <dt>Reconnects</dt><dd>{conn.reconnects}</dd>
        <dt>Data</dt><dd className={conn.mode === "demo" ? "is-warn" : "is-ok"}>{conn.mode === "demo" ? "SIMULATED" : conn.mode === "replay" ? "RECORDED (real)" : "REAL"}</dd>
      </dl>
    </section>
  );
});

export type { Ev };
export { evMs };
