"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ApproveDialog from "@/components/staff/ApproveDialog";
import { Icon } from "@/components/staff/icons";
import ProcessingView from "@/components/staff/ProcessingView";
import ReviewSplit from "@/components/staff/ReviewSplit";
import RunPill from "@/components/staff/RunPill";
import { ApiError, api } from "@/lib/api";
import { dur, fadeUp } from "@/lib/motion";
import { needsDecision } from "@/lib/review";
import { useRunEvents } from "@/lib/useEventStream";
import type { Action, Attrs, ReviewData, RunMeta } from "@/lib/types";

function Seal() {
  return (
    <svg viewBox="0 0 52 52" width={44} height={44} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.circle cx="26" cy="26" r="23" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
      <motion.path d="M15 27l8 8 14-16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.45 }} />
    </svg>
  );
}

export default function ReviewClient({ runId }: { runId: string }) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);

  const processing = !meta || meta.status === "queued" || meta.status === "processing";
  const events = useRunEvents(runId, processing);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const m = await api.getRun(runId);
        if (!alive) return;
        setMeta(m);
        if (m.status === "needs_review" || m.status === "approved") {
          const r = await api.getReview(runId);
          if (alive) setData(r);
          return;
        }
        if (m.status !== "failed") timer = setTimeout(tick, 900);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof ApiError && e.status === 404 ? "This plan does not exist." : "Cannot reach the API. Is it running on port 8000?");
      }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  const onDecide = useCallback(async (fieldId: string, action: Action, attrs?: Attrs) => {
    try {
      const res = await api.decide(runId, fieldId, action, attrs);
      setData((d) => d && {
        ...d,
        fields: d.fields.map((f) => (f.field.field_id === fieldId ? res.field : f)),
        blockers: res.blockers,
        can_approve: res.can_approve,
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save that decision");
      throw e;
    }
  }, [runId]);

  const onApprove = useCallback(async (by: string) => {
    try {
      await api.approve(runId, by);
      setDialog(false);
      const [m, r] = await Promise.all([api.getRun(runId), api.getReview(runId)]);
      setMeta(m);
      setData(r);
    } catch (e) {
      setDialog(false);
      setNotice(e instanceof Error ? e.message : "Could not approve");
    }
  }, [runId]);

  const progress = useMemo(() => {
    if (!data) return { done: 0, total: 0 };
    const req = data.fields.filter((f) => needsDecision(f.field));
    return { done: req.filter((f) => f.decision).length, total: req.length };
  }, [data]);
  const removed = data?.fields.filter((f) => f.decision?.action === "reject").length ?? 0;
  const accepted = (data?.fields.length ?? 0) - removed;
  const approved = meta?.status === "approved";

  if (error) {
    return <div className="rr-page"><div className="rr-card rr-empty"><b>{error}</b><Link className="rr-btn rr-btn--ghost" href="/staff">Back to dashboard</Link></div></div>;
  }
  if (meta?.status === "failed") {
    return (
      <div className="rr-page">
        <div className="rr-card rr-empty">
          <span className="rr-empty-icon rr-empty-icon--bad"><Icon.alert size={24} /></span>
          <b>The document could not be processed</b>
          <small>{meta.error ?? "Unknown error"}</small>
          <Link className="rr-btn rr-btn--primary" href="/staff/upload">Try another document</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rr-page rr-page--narrow">
        <motion.div {...fadeUp}>
          <h1 className="rr-title">{meta?.patient.name ?? "Loading…"}</h1>
          <p className="rr-sub">{meta?.filename ?? " "}</p>
          <ProcessingView events={events} />
        </motion.div>
      </div>
    );
  }

  const pct = progress.total ? (progress.done / progress.total) * 100 : 100;
  return (
    <div className="rr-review">
      <header className="rr-review-head">
        <div className="rr-review-title">
          <Link href="/staff" className="rr-link">← Dashboard</Link>
          <h1>{data.run.patient.name}</h1>
          <span className="rr-mute">{data.run.filename}{data.run.cached ? " · cached extraction" : ""}</span>
          <RunPill status={meta?.status ?? data.run.status} />
        </div>
        <div className="rr-review-actions">
          {!approved && (
            <div className="rr-progress" title="Decisions needed before approval">
              <span>{progress.done} of {progress.total} decisions</span>
              <div className="rr-bar"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: dur.base }} /></div>
            </div>
          )}
          {!approved && (
            <button className="rr-btn rr-btn--primary" disabled={!data.can_approve}
              title={data.can_approve ? "Approve and lock the plan" : `${data.blockers.length} field(s) still need a decision`}
              onClick={() => setDialog(true)}>
              <Icon.lock size={16} /> Approve plan
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {approved && (
          <motion.div className="rr-banner" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="rr-seal"><Seal /></span>
            <div>
              <b>Plan approved and locked</b>
              <small>Approved by {meta?.approved_by ?? "staff"}. Every decision is recorded in the audit log.</small>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewSplit data={data} locked={approved} onDecide={onDecide} />
      <ApproveDialog open={dialog} accepted={accepted} removed={removed} onClose={() => setDialog(false)} onApprove={onApprove} />

      <AnimatePresence>
        {notice && (
          <motion.div className="rr-toast" role="alert" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <Icon.alert size={16} /> {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
