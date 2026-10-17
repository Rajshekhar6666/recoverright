"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import StatusTable from "@/components/staff/StatusTable";
import { api } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import type { RunMeta } from "@/lib/types";

export default function Dashboard() {
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api.listRuns();
        if (!alive) return;
        setRuns(r);
        setError(null);
        const busy = r.some((x) => x.status === "queued" || x.status === "processing");
        timer = setTimeout(load, busy ? 1500 : 6000);
      } catch {
        if (!alive) return;
        setError("Cannot reach the API. Is it running on port 8000?");
        timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const toReview = runs?.filter((r) => r.status === "needs_review").length ?? 0;
  const approved = runs?.filter((r) => r.status === "approved").length ?? 0;

  return (
    <motion.div className="rr-page" {...fadeUp}>
      <div className="rr-page-head">
        <div>
          <h1 className="rr-title">Discharge plans</h1>
          <p className="rr-sub">Upload a discharge document, check what was extracted, approve, and hand it to the patient.</p>
        </div>
        <Link href="/staff/upload" className="rr-btn rr-btn--primary"><Icon.upload size={16} /> New discharge</Link>
      </div>

      <div className="rr-stats">
        <div className="rr-card rr-stat"><small>Awaiting review</small><b>{toReview}</b></div>
        <div className="rr-card rr-stat"><small>Approved</small><b>{approved}</b></div>
        <div className="rr-card rr-stat"><small>All plans</small><b>{runs?.length ?? "–"}</b></div>
      </div>

      {error && <p className="rr-error">{error}</p>}
      {runs === null && !error && (
        <div className="rr-card">
          {[0, 1, 2].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}
        </div>
      )}
      {runs && runs.length === 0 && (
        <div className="rr-card rr-empty">
          <span className="rr-empty-icon"><Icon.file size={26} /></span>
          <b>No discharge plans yet</b>
          <small>Start with the sample document to see the whole flow.</small>
          <Link href="/staff/upload" className="rr-btn rr-btn--primary">Upload a document</Link>
        </div>
      )}
      {runs && runs.length > 0 && <StatusTable runs={runs} />}
    </motion.div>
  );
}
