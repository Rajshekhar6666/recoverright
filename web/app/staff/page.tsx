"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HelpActions, SeverityBadge, SlaMeter } from "@/components/staff/help/HelpBits";
import { Icon } from "@/components/staff/icons";
import QueueTable, { type RunHelp } from "@/components/staff/QueueTable";
import { useSearch } from "@/components/staff/Shell";
import { api } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { timeAgo } from "@/lib/review";
import { useHelp } from "@/lib/staffHelp";
import { age, mmss, ms } from "@/lib/time";
import type { RunMeta } from "@/lib/types";

type Feed = { at: number; tone: string; icon: keyof typeof Icon; title: string; text: string; href?: string };
type Tab = "all" | "needs_review" | "processing" | "approved" | "failed";
const TABS: { key: Tab; label: string; test: (r: RunMeta) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "needs_review", label: "Needs review", test: (r) => r.status === "needs_review" },
  { key: "processing", label: "Processing", test: (r) => r.status === "queued" || r.status === "processing" },
  { key: "approved", label: "Approved", test: (r) => r.status === "approved" },
  { key: "failed", label: "Failed", test: (r) => r.status === "failed" },
];

function runFeed(r: RunMeta): Feed {
  const toCheck = r.counts ? r.counts.review + r.counts.conflict + r.counts.rejected : 0;
  const at = ms(r.created_at), href = `/staff/runs/${r.run_id}/review`;
  switch (r.status) {
    case "needs_review": return { at, tone: "warn", icon: "alert", title: "Review needed", text: `${r.patient.name}: ${toCheck} field${toCheck === 1 ? "" : "s"} to check`, href };
    case "approved": return { at, tone: "ok", icon: "check", title: "Plan approved", text: `${r.patient.name}: locked and ready to share`, href };
    case "failed": return { at, tone: "bad", icon: "x", title: "Processing failed", text: `${r.patient.name}: ${r.error?.slice(0, 60) ?? "see the live theater"}`, href: `/live/${r.run_id}` };
    default: return { at, tone: "info", icon: "spark", title: "Processing", text: `${r.patient.name}: reading ${r.filename}`, href: `/live/${r.run_id}` };
  }
}

export default function Dashboard() {
  const hp = useHelp();
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
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
  const searched = useMemo(() => (runs ?? []).filter((r) => !q || `${r.patient.name} ${r.filename}`.toLowerCase().includes(q)), [runs, q]);
  const tabCounts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, searched.filter(t.test).length])) as Record<Tab, number>, [searched]);
  const shown = useMemo(() => searched.filter(TABS.find((t) => t.key === tab)!.test), [searched, tab]);

  const helpByRun = useMemo(() => {
    const m: Record<string, RunHelp> = {};
    for (const h of hp.items) if (h.status !== "resolved") { const c = (m[h.run_id] ??= { active: 0, critical: 0 }); c.active++; if (h.severity === "critical") c.critical++; }
    return m;
  }, [hp.items]);

  const waiting = hp.items.filter((h) => h.status === "open");
  const feed = useMemo<Feed[]>(() => {
    const f: Feed[] = (runs ?? []).map(runFeed);
    for (const h of hp.items.slice(0, 40)) {
      f.push({ at: ms(h.created_at), tone: "bad", icon: "bell", title: "Help requested", text: `${h.patient_name}: ${h.source === "button" ? "pressed the help button" : `“${h.heard}”`}`, href: `/staff/help?open=${h.id}` });
      if (h.resolved_at) f.push({ at: ms(h.resolved_at), tone: "ok", icon: "check", title: "Help request resolved", text: `${h.patient_name}: ${h.resolution_label ?? ""}`, href: `/staff/help?open=${h.id}` });
    }
    return f.filter((x) => isFinite(x.at)).sort((a, b) => b.at - a.at).slice(0, 8);
  }, [runs, hp.items]);

  return (
    <motion.div className="rr-page" {...fadeUp}>
      <div className="cc-hello">
        <div>
          <h1 className="rr-title">{hello.greet}, {hp.staffName === "Care team" ? "care team" : hp.staffName.split(" ")[0]}</h1>
          <p className="rr-sub">Here is what is happening with your discharge plans today.</p>
        </div>
        <span className="cc-date"><Icon.calendar size={16} /> {hello.date}</span>
      </div>

      {waiting.length > 0 && (
        <section className="hx-attn" aria-label="Needs attention now">
          <header><span><Icon.siren size={18} /></span><h2>Needs attention now</h2><small>{waiting.length} patient{waiting.length === 1 ? "" : "s"} waiting for a nurse</small><Link href="/staff/help" className="rr-btn rr-btn--ghost rr-btn--sm">Open inbox <Icon.chevron size={14} /></Link></header>
          <ul>
            {waiting.slice(0, 3).map((h) => (
              <li key={h.id} className={`hx-attn-row hx-attn-row--${h.severity}`}>
                <div className="hx-attn-who"><b>{h.patient_name}</b><SeverityBadge s={h.severity} /></div>
                <p>{h.source === "button" ? "Pressed the help button" : `“${h.heard}”`}</p>
                <SlaMeter h={h} now={hp.now} />
                <div className="hx-attn-act"><HelpActions h={h} compact /><Link href={`/staff/help?open=${h.id}`} className="rr-btn rr-btn--ghost rr-btn--sm">Open</Link></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cc-kpis cc-kpis--5">
        <Link href="/staff/help" className={`rr-card cc-kpi hx-kpi-link${waiting.length ? " is-alert" : ""}`}><span className="cc-kpi-ic cc-kpi-ic--red"><Icon.bell size={22} /></span><div><small>Help waiting</small><b>{hp.summary ? hp.summary.unacked : "–"}</b></div></Link>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--amber"><Icon.alert size={22} /></span><div><small>Awaiting review</small><b>{count((r) => r.status === "needs_review")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.spark size={22} /></span><div><small>Processing</small><b>{count((r) => r.status === "queued" || r.status === "processing")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--green"><Icon.shield size={22} /></span><div><small>Approved</small><b>{count((r) => r.status === "approved")}</b></div></div>
        <div className="rr-card cc-kpi"><span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.clock size={22} /></span><div><small>Avg help response</small><b>{hp.summary?.avg_ack_seconds != null ? mmss(hp.summary.avg_ack_seconds * 1000) : "–"}</b></div></div>
      </div>

      {error && <p className="rr-error">{error}</p>}

      <div className="cc-cols">
        <section>
          <div className="cc-panel-head">
            <h2>Discharge plans</h2>
            <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm"><Icon.upload size={15} /> New discharge</Link>
          </div>
          {runs && runs.length > 0 && (
            <div className="hx-tabs hx-tabs--tight" role="tablist" aria-label="Filter plans">
              {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>{t.label}<span>{tabCounts[t.key]}</span></button>)}
            </div>
          )}
          {runs === null && !error && <div className="rr-card">{[0, 1, 2].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}</div>}
          {runs && runs.length === 0 && (
            <div className="rr-card rr-empty">
              <span className="rr-empty-icon"><Icon.file size={26} /></span>
              <b>No discharge plans yet</b>
              <small>Start with the sample document to see the whole flow.</small>
              <Link href="/staff/upload" className="rr-btn rr-btn--primary">Upload a document</Link>
            </div>
          )}
          {runs && runs.length > 0 && shown.length === 0 && <div className="rr-card rr-empty rr-empty--sm"><b>{q ? "No plans match your search" : "Nothing in this view"}</b></div>}
          {shown.length > 0 && <QueueTable runs={shown} help={helpByRun} />}
        </section>

        <aside className="cc-rail">
          <div className="rr-card">
            <div className="cc-panel-head"><h2>Quick actions</h2></div>
            <div className="cc-quick cc-quick--3">
              <Link href="/staff/upload"><span><Icon.upload size={17} /></span>New discharge</Link>
              <Link href="/staff/help"><span><Icon.bell size={17} /></span>Help requests</Link>
              <Link href="/staff/patients"><span><Icon.users size={17} /></span>Patients</Link>
              <Link href="/live" target="_blank" rel="noreferrer"><span><Icon.pulse size={17} /></span>Live theater</Link>
            </div>
          </div>
          <div className="rr-card">
            <div className="cc-panel-head"><h2>Recent activity</h2></div>
            {feed.length === 0 ? <small>Nothing to report yet.</small> : (
              <ul className="cc-alerts">
                {feed.map((a, i) => {
                  const I = Icon[a.icon];
                  const body = (<><i className={`t-${a.tone}`}><I size={16} /></i><div><b>{a.title}</b><small>{a.text}</small></div><time>{age(hp.now - a.at)}</time></>);
                  return <li key={i} className="cc-alert">{a.href ? <Link href={a.href} className="hx-feed-link">{body}</Link> : body}</li>;
                })}
              </ul>
            )}
          </div>
          <div className="rr-card hx-sys">
            <div className="cc-panel-head"><h2>System</h2></div>
            <dl>
              <dt>API</dt><dd className={hp.conn === "ok" && !error ? "is-ok" : "is-bad"}>{hp.conn === "ok" && !error ? "Online" : "Offline"}</dd>
              <dt>Plans processing</dt><dd>{count((r) => r.status === "queued" || r.status === "processing")}</dd>
              <dt>Failed plans</dt><dd className={runs?.some((r) => r.status === "failed") ? "is-bad" : ""}>{count((r) => r.status === "failed")}</dd>
              <dt>Last plan</dt><dd>{runs && runs[0] ? timeAgo(runs[0].created_at) : "–"}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
