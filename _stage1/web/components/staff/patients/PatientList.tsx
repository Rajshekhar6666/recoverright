"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/staff/icons";
import RunPill from "@/components/staff/RunPill";
import { useSearch } from "@/components/staff/Shell";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/review";
import { initials } from "@/lib/time";
import type { PatientRow } from "@/lib/types";

type Tab = "all" | "help" | "review" | "approved";
const TABS: { key: Tab; label: string; test: (p: PatientRow) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "help", label: "Asked for help", test: (p) => p.help_active > 0 },
  { key: "review", label: "Needs review", test: (p) => p.status === "needs_review" },
  { key: "approved", label: "Approved", test: (p) => p.status === "approved" },
];

export default function PatientList() {
  const router = useRouter();
  const q = useSearch().trim().toLowerCase();
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try { const r = await api.listPatients(); if (!alive) return; setRows(r.items); setError(null); timer = setTimeout(load, 5000); }
      catch { if (!alive) return; setError("Cannot reach the API. Is it running on port 8000?"); timer = setTimeout(load, 4000); }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const searched = useMemo(() => (rows ?? []).filter((p) => !q || `${p.name} ${p.filename} ${p.phone}`.toLowerCase().includes(q)), [rows, q]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, searched.filter(t.test).length])) as Record<Tab, number>, [searched]);
  const shown = useMemo(() => searched.filter(TABS.find((t) => t.key === tab)!.test), [searched, tab]);
  const open = (id: string) => router.push(`/staff/patients/${id}`);

  return (
    <div className="rr-page">
      <div className="rr-page-head">
        <div>
          <h1 className="rr-title">Patients</h1>
          <p className="rr-sub">Every discharge plan with contact details and any open help requests.</p>
        </div>
        <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm"><Icon.upload size={15} /> New discharge</Link>
      </div>
      {error && <p className="rr-error">{error}</p>}
      {rows && rows.length > 0 && (
        <div className="hx-tabs" role="tablist" aria-label="Filter patients">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>{t.label}<span>{counts[t.key]}</span></button>)}
        </div>
      )}
      {rows === null && !error && <div className="rr-card">{[0, 1, 2, 3].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}</div>}
      {rows && rows.length === 0 && (
        <div className="rr-card rr-empty">
          <span className="rr-empty-icon"><Icon.users size={26} /></span>
          <b>No patients yet</b>
          <small>A patient appears here as soon as you upload their discharge document.</small>
          <Link href="/staff/upload" className="rr-btn rr-btn--primary">Upload a document</Link>
        </div>
      )}
      {rows && rows.length > 0 && shown.length === 0 && <div className="rr-card rr-empty rr-empty--sm"><b>{q ? "No patients match your search" : "Nobody in this view"}</b></div>}
      {shown.length > 0 && (
        <div className="rr-table-wrap">
          <table className="rr-table hx-queue">
            <thead><tr><th>Patient</th><th>Phone</th><th>Plan</th><th>Checks</th><th>Help</th><th>Added</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="rr-row" tabIndex={0} onClick={() => open(p.id)} onKeyDown={(e) => e.key === "Enter" && open(p.id)}>
                  <td><span className="rr-pt"><span className="cc-avatar cc-avatar--sm">{initials(p.name)}</span><span><b>{p.name}</b><small>{p.language.toUpperCase()} · {p.filename}</small></span></span></td>
                  <td className="rr-mute">{p.phone || "–"}</td>
                  <td><RunPill status={p.status} /></td>
                  <td>{p.to_check === null ? <span className="rr-mute">Working</span> : p.to_check > 0 ? <span className="rr-chip rr-chip--warn">{p.to_check} to check</span> : <span className="rr-chip rr-chip--ok">All agreed</span>}</td>
                  <td>{p.help_active > 0 ? <span className={`hx-help-chip${p.help_critical_active ? " is-critical" : ""}`}><Icon.bell size={13} />{p.help_active} open</span> : p.help_total > 0 ? <span className="rr-mute">{p.help_total} resolved</span> : <span className="rr-mute">–</span>}</td>
                  <td className="rr-mute">{timeAgo(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
