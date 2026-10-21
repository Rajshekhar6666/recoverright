"use client";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { dur } from "@/lib/motion";
import type { ApiEvent } from "@/lib/types";
import { Icon } from "./icons";

type Step = {
  key: string;
  label: string;
  started: (t: string) => boolean;
  finished: (t: string) => boolean;
};

const STEPS: Step[] = [
  { key: "parse", label: "Reading the document", started: (t) => t.startsWith("parse."), finished: (t) => t === "parse.done" },
  { key: "a", label: "Extractor A reads it", started: (t) => t.startsWith("extract.a."), finished: (t) => t === "extract.a.done" || t === "extract.a.failed" },
  { key: "b", label: "Extractor B reads it", started: (t) => t.startsWith("extract.b."), finished: (t) => t === "extract.b.done" || t === "extract.b.failed" },
  { key: "ground", label: "Checking every quote against the source", started: (t) => t.startsWith("ground."), finished: (t) => t === "ground.b.done" },
  { key: "reconcile", label: "Comparing the sources", started: (t) => t.startsWith("reconcile."), finished: (t) => t === "reconcile.done" },
  { key: "ready", label: "Ready for human review", started: (t) => t === "review.ready", finished: (t) => t === "review.ready" },
];

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export default function ProcessingView({ events }: { events: ApiEvent[] }) {
  const rows = useMemo(() => {
    const types = events.map((e) => e.type);
    const detail = (key: string): string => {
      const last = (t: string) => events.findLast((e) => e.type === t);
      if (key === "parse") {
        const d = last("parse.done");
        return d ? `${num(d.payload.blocks)} blocks found` : "";
      }
      if (key === "a" || key === "b") {
        const n = events.filter((e) => e.type === `extract.${key}.field`).length;
        const cached = last(`extract.${key}.started`)?.payload.cached ? " (from cache)" : "";
        return n ? `${n} fields found${cached}` : "";
      }
      if (key === "ground") {
        const a = last("ground.a.done");
        const b = last("ground.b.done");
        const pass = num(a?.payload.pass) + num(b?.payload.pass);
        const fail = num(a?.payload.fail) + num(b?.payload.fail);
        return a || b ? `${pass} verified, ${fail} failed` : "";
      }
      if (key === "reconcile") {
        const d = last("reconcile.done");
        return d ? `${num(d.payload.agreed)} agreed, ${num(d.payload.review) + num(d.payload.conflict) + num(d.payload.rejected)} to check` : "";
      }
      return "";
    };
    return STEPS.map((s) => {
      const done = types.some(s.finished);
      const active = !done && types.some(s.started);
      return { ...s, done, active, detail: detail(s.key) };
    });
  }, [events]);

  const doneCount = rows.filter((r) => r.done).length;

  return (
    <div className="rr-proc rr-card">
      <h2>Processing the document</h2>
      <p className="rr-mute">Every step below is real.</p>
      <div className="rr-bar"><motion.i animate={{ width: `${(doneCount / rows.length) * 100}%` }} transition={{ duration: dur.slow }} /></div>
      <ol className="rr-steps">
        {rows.map((r, i) => (
          <motion.li key={r.key} className={`rr-step${r.done ? " is-done" : ""}${r.active ? " is-active" : ""}`}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: dur.base }}>
            <span className="rr-step-dot">{r.done ? <Icon.check size={14} /> : r.active ? <i className="rr-spin" /> : null}</span>
            <span className="rr-step-label">{r.label}</span>
            <span className="rr-step-detail">{r.detail}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
