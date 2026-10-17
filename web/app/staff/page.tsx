"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { useSearch } from "@/components/staff/Shell";
import StatusTable from "@/components/staff/StatusTable";
import { api } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { timeAgo } from "@/lib/review";
import type { RunMeta } from "@/lib/types";

function alertFor(r: RunMeta): { tone: string; icon: keyof typeof Icon; title: string; text: string } {
  const toCheck = r.counts ? r.counts.review + r.counts.conflict + r.counts.rejected : 0;
  switch (r.status) {
    case "needs_review": return { tone: "warn", icon: "alert", title: "Review needed", text: `${r.patient.name}: ${toCheck} field${toCheck === 1 ? "" : "s"} to check` };
    case "approved": return { tone: "ok", icon: "check", title: "Plan approved", text: `${r.patient.name}: locked and ready to share` };
    case "failed": return { tone: "bad", icon: "x", title: "Processing failed", text: `${r.patient.name}: ${r.error?.slice(0, 60) ?? "see the live theater"}` };
    default: return { tone: "info", icon: "spark", title: "Processing", text: `${r.patient.name}: reading ${r.filename}` };
  }
}

export default function Dashboard() {
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hello, setHello] = useState({ greet: "Hello", date: "" });
  const q = useSearch().trim().toLowerCase();

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setHello({
      greet: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
      date: now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    });
  }, []);

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

  const count = (f: (r: RunMeta) => boolean) => runs?.filter(f).length ?? "–";
  const shown = useMemo(
    () => (runs ?? []).filter((r) => !q || `${r.patient.name} ${r.filename}`.toLowerCase().includes(q)),
    [runs, q],
  );
  const latest = runs?.[0];

  return (
    <motion.div className="rr-page" {...fadeUp}>
      <div className="cc-hello">
        <div>
          <h1 className="rr-title">{hello.greet}, care team</h1>
          <p className="rr-sub">Here is what is happening with your discharge plans today.</p>
        </div>
        <span className="cc-date"><Icon.calendar size={16} /> {hello.date}</span>
      </div>

      <div className="cc-kpis">
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--amber"><Icon.alert size={22} /></span><div><small>Awaiting review</small><b>{count((r) => r.status === "needs_review")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--green"><Icon.shield size={22} /></span><div><small>Approved</small><b>{count((r) => r.status === "approved")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.spark size={22} /></span><div><small>Processing</small><b>{count((r) => r.status === "queued" || r.status === "processing")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--red"><Icon.file size={22} /></span><div><small>All plans</small><b>{runs?.length ?? "–"}</b></div></div>
      </div>

      {error && <p className="rr-error">{error}</p>}

      <div className="cc-cols">
        <section>
          <div className="cc-panel-head">
            <h2>Discharge plans</h2>
            <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm"><Icon.upload size={15} /> New discharge</Link>
          </div>
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
          {runs && runs.length > 0 && shown.length === 0 && <div className="rr-card rr-empty rr-empty--sm"><b>No plans match your search</b></div>}
          {shown.length > 0 && <StatusTable runs={shown} />}
        </section>

        <aside className="cc-rail">
          <div className="rr-card">
            <div className="cc-panel-head"><h2>Quick actions</h2></div>
            <div className="cc-quick">
              <Link href="/staff/upload"><span><Icon.upload size={17} /></span>New discharge</Link>
              <Link href={latest ? `/live/${latest.run_id}` : "/live"}><span><Icon.pulse size={17} /></span>Live theater</Link>
              <Link href="/staff/help"><span><Icon.bell size={17} /></span>Help requests</Link>
              <Link href="/p/demo"><span><Icon.heart size={17} /></span>Patient app demo</Link>
            </div>
          </div>
          <div className="rr-card">
            <div className="cc-panel-head"><h2>Alerts and notifications</h2></div>
            {!runs || runs.length === 0 ? <small>Nothing to report yet.</small> : (
              <ul className="cc-alerts">
                {runs.slice(0, 5).map((r) => {
                  const a = alertFor(r);
                  const I = Icon[a.icon];
                  return (
                    <li key={r.run_id} className="cc-alert">
                      <i className={`t-${a.tone}`}><I size={16} /></i>
                      <div><b>{a.title}</b><small>{a.text}</small></div>
                      <time>{timeAgo(r.created_at)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
