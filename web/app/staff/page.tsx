"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import ClinicalAnalytics from "@/components/staff/ClinicalAnalytics";
import { HelpActions, SeverityBadge, SlaMeter } from "@/components/staff/help/HelpBits";
import { Icon } from "@/components/staff/icons";
import RunPill from "@/components/staff/RunPill";
import QueueTable, { type RunHelp } from "@/components/staff/QueueTable";
import { useSearch } from "@/components/staff/Shell";
import StaffVoiceBar from "@/components/staff/StaffVoiceBar";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { fadeUp } from "@/lib/motion";
import { timeAgo } from "@/lib/review";
import { useHelp } from "@/lib/staffHelp";
import { age, initials, mmss, ms } from "@/lib/time";
import type { PatientRow, RunMeta } from "@/lib/types";

type Feed = { at: number; tone: string; icon: keyof typeof Icon; title: string; text: string; href?: string };
type RunTab = "all" | "needs_review" | "processing" | "approved" | "failed";
type PatientTab = "all" | "help" | "review" | "approved";

const RUN_TABS: { key: RunTab; label: string; test: (r: RunMeta) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "needs_review", label: "Needs review", test: (r) => r.status === "needs_review" },
  { key: "processing", label: "Processing", test: (r) => r.status === "queued" || r.status === "processing" },
  { key: "approved", label: "Approved", test: (r) => r.status === "approved" || r.status === "reapproved" },
  { key: "failed", label: "Failed", test: (r) => r.status === "failed" },
];

function runFeed(r: RunMeta): Feed {
  const toCheck = r.counts ? (r.counts.review || 0) + (r.counts.conflict || 0) + (r.counts.rejected || 0) : 0;
  const at = ms(r.created_at), href = `/staff/runs/${r.run_id}/review`;
  const name = r.patient?.name || "Patient";
  const filename = r.filename || "document";
  switch (r.status) {
    case "needs_review": return { at, tone: "warn", icon: "alert", title: "Review needed", text: `${name}: ${toCheck} field${toCheck === 1 ? "" : "s"} to check`, href };
    case "approved":
    case "reapproved": return { at, tone: "ok", icon: "check", title: "Plan approved", text: `${name}: locked and ready to share`, href };
    case "failed": return { at, tone: "bad", icon: "x", title: "Processing failed", text: `${name}: ${r.error?.slice(0, 60) ?? "see the live theater"}`, href: `/live/${r.run_id}` };
    default: return { at, tone: "info", icon: "spark", title: "Processing", text: `${name}: reading ${filename}`, href: `/live/${r.run_id}` };
  }
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const hp = useHelp();
  const { t, lang } = useLanguage();

  /**
   * Three top-level views:
   *  "patients"  — default: unique patient directory (one row per person)
   *  "plans"     — power-user discharge plan queue (all runs)
   *  "analytics" — clinical analytics charts
   */
  const [mainView, setMainView] = useState<"patients" | "plans" | "analytics">(
    initialTabParam === "analytics" || initialTabParam === "attention"
      ? "analytics"
      : initialTabParam === "plans"
      ? "plans"
      : "patients"
  );

  // --- Runs (for the plans view & KPI counts) ---
  const [runs, setRuns] = useState<RunMeta[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runTab, setRunTab] = useState<RunTab>(initialTabParam === "needs_review" ? "needs_review" : "all");

  // --- Patients (for the patient directory view) ---
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patientTab, setPatientTab] = useState<PatientTab>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeletePatient = async (e: React.MouseEvent, patientId: string, patientName: string) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      lang === "hi"
        ? `क्या आप वाकई ${patientName || "मरीज़"} का डिस्चार्ज रिकॉर्ड और प्रोफ़ाइल हटाना चाहते हैं?`
        : `Are you sure you want to delete the discharge record and profile for ${patientName || "this patient"}?`
    );
    if (!confirmed) return;

    setDeletingId(patientId);
    try {
      await api.deletePatient(patientId);
      setPatients((prev) => (prev ? prev.filter((p) => p.id !== patientId) : []));
      setRuns((prev) => (prev ? prev.filter((r) => r.run_id !== patientId) : []));
    } catch {
      alert(lang === "hi" ? "मरीज़ रिकॉर्ड हटाने में त्रुटि हुई।" : "Failed to delete patient record.");
    } finally {
      setDeletingId(null);
    }
  };

  const [hello, setHello] = useState({ greet: "Hello", date: "" });
  const q = useSearch().trim().toLowerCase();

  // Handle URL param changes
  useEffect(() => {
    if (initialTabParam === "analytics" || initialTabParam === "attention") {
      setMainView("analytics");
    } else if (initialTabParam === "needs_review") {
      setMainView("plans");
      setRunTab("needs_review");
    } else if (initialTabParam === "plans") {
      setMainView("plans");
    }
  }, [initialTabParam]);

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setHello({
      greet: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
      date: now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    });
  }, []);

  // Load runs (needed for KPIs and plans view)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api.listRuns();
        if (!alive) return;
        setRuns(r);
        setRunsError(null);
        const busy = r.some((x) => x.status === "queued" || x.status === "processing");
        timer = setTimeout(load, busy ? 1500 : 8000);
      } catch {
        if (!alive) return;
        setRunsError("Cannot reach the API. Is it running on port 8000?");
        timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // Load patients (patient directory)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api.listPatients();
        if (!alive) return;
        setPatients(r.items);
        setPatientsError(null);
        timer = setTimeout(load, 8000);
      } catch {
        if (!alive) return;
        setPatientsError("Cannot reach the API.");
        timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // --- Computed values ---
  const countRun = (f: (r: RunMeta) => boolean) => runs?.filter(f).length ?? "–";

  // Patients filtered
  const PATIENT_TABS: { key: PatientTab; label: string; test: (p: PatientRow) => boolean }[] = [
    { key: "all", label: lang === "hi" ? "सभी" : "All", test: () => true },
    { key: "help", label: lang === "hi" ? "मदद अनुरोध" : "Asked for help", test: (p) => p.help_active > 0 },
    { key: "review", label: lang === "hi" ? "समीक्षा बाकी" : "Needs review", test: (p) => p.status === "needs_review" },
    { key: "approved", label: lang === "hi" ? "स्वीकृत" : "Approved", test: (p) => p.status === "approved" },
  ];
  const searchedPatients = useMemo(
    () => (patients ?? []).filter((p) => !q || `${p.name} ${p.filename} ${p.phone}`.toLowerCase().includes(q)),
    [patients, q]
  );
  const patientTabCounts = useMemo(
    () => Object.fromEntries(PATIENT_TABS.map((tb) => [tb.key, searchedPatients.filter(tb.test).length])) as Record<PatientTab, number>,
    [searchedPatients]
  );
  const shownPatients = useMemo(
    () => searchedPatients.filter(PATIENT_TABS.find((tb) => tb.key === patientTab)!.test),
    [searchedPatients, patientTab]
  );

  // Runs filtered
  const searchedRuns = useMemo(
    () => (runs ?? []).filter((r) => !q || `${r.patient?.name || ""} ${r.filename || ""}`.toLowerCase().includes(q)),
    [runs, q]
  );
  const runTabCounts = useMemo(
    () => Object.fromEntries(RUN_TABS.map((t) => [t.key, searchedRuns.filter(t.test).length])) as Record<RunTab, number>,
    [searchedRuns]
  );
  const shownRuns = useMemo(
    () => searchedRuns.filter(RUN_TABS.find((t) => t.key === runTab)!.test),
    [searchedRuns, runTab]
  );

  const helpByRun = useMemo(() => {
    const m: Record<string, RunHelp> = {};
    for (const h of hp.items) if (h.status !== "resolved") { const c = (m[h.run_id] ??= { active: 0, critical: 0 }); c.active++; if (h.severity === "critical") c.critical++; }
    return m;
  }, [hp.items]);

  const waiting = hp.items.filter((h) => h.status === "open");
  const feed = useMemo<Feed[]>(() => {
    const f: Feed[] = (runs ?? []).map(runFeed);
    for (const h of hp.items.slice(0, 40)) {
      f.push({ at: ms(h.created_at), tone: "bad", icon: "bell", title: "Help requested", text: `${h.patient_name}: ${h.source === "button" ? "pressed the help button" : `"${h.heard}"`}`, href: `/staff/help?open=${h.id}` });
      if (h.resolved_at) f.push({ at: ms(h.resolved_at), tone: "ok", icon: "check", title: "Help request resolved", text: `${h.patient_name}: ${h.resolution_label ?? ""}`, href: `/staff/help?open=${h.id}` });
    }
    return f.filter((x) => isFinite(x.at)).sort((a, b) => b.at - a.at).slice(0, 8);
  }, [runs, hp.items]);

  return (
    <motion.div className="rr-page" {...fadeUp}>
      {/* Header */}
      <div className="cc-hello" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="rr-title">{hello.greet}, {hp.staffName === "Care team" ? "care team" : hp.staffName.split(" ")[0]}</h1>
          <p className="rr-sub">{lang === "hi" ? "मरीज़ों की रिकवरी एवं डिस्चार्ज योजनाएं।" : "Patient recovery dashboard — discharge plans & monitoring."}</p>
        </div>
        <span className="cc-date"><Icon.calendar size={16} /> {hello.date}</span>
      </div>

      {/* Voice bar */}
      <div style={{ marginBottom: 20 }}>
        <StaffVoiceBar
          runs={runs || undefined}
          patients={patients || undefined}
          onDeletePatient={async (patientId) => {
            await api.deletePatient(patientId);
            setPatients((prev) => (prev ? prev.filter((p) => p.id !== patientId) : []));
            setRuns((prev) => (prev ? prev.filter((r) => r.run_id !== patientId) : []));
          }}
          onNavigateUrl={(url) => {
            if (url.includes("tab=analytics") || url.includes("tab=attention")) {
              setMainView("analytics");
            } else if (url.includes("tab=plans") || url.includes("tab=needs_review")) {
              setMainView("plans");
              if (url.includes("tab=needs_review")) setRunTab("needs_review");
            } else if (url === "/staff") {
              setMainView("patients");
            } else {
              router.push(url);
            }
          }}
        />
      </div>

      {/* Primary Section Tabs */}
      <div
        className="hx-tabs"
        role="tablist"
        aria-label="Staff Dashboard Sections"
        style={{ marginBottom: 20, borderBottom: "2px solid #e2e8f0", paddingBottom: 4 }}
      >
        <button
          role="tab"
          aria-selected={mainView === "patients"}
          className={mainView === "patients" ? "is-on" : ""}
          onClick={() => setMainView("patients")}
          style={{ fontSize: "0.95rem", fontWeight: 600 }}
        >
          <Icon.users size={16} /> {lang === "hi" ? "मरीज़" : "Patients"}
          {patients && <span>{patients.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={mainView === "plans"}
          className={mainView === "plans" ? "is-on" : ""}
          onClick={() => setMainView("plans")}
          style={{ fontSize: "0.95rem", fontWeight: 600 }}
        >
          <Icon.file size={16} /> {t.tabDischargePlans}
          {runs && <span>{runs.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={mainView === "analytics"}
          className={mainView === "analytics" ? "is-on" : ""}
          onClick={() => setMainView("analytics")}
          style={{ fontSize: "0.95rem", fontWeight: 600 }}
        >
          <Icon.pulse size={16} /> {t.tabClinicalAnalytics}
          {waiting.length > 0 && <span style={{ background: "#ef4444", color: "white" }}>{waiting.length}</span>}
        </button>
      </div>

      {/* View: Clinical Analytics */}
      {mainView === "analytics" && (
        <ClinicalAnalytics
          initialFilter={initialTabParam === "attention" ? "attention" : "all"}
          onOpenReviewQueue={() => {
            setMainView("plans");
            setRunTab("needs_review");
          }}
        />
      )}

      {/* ===== View: PATIENTS (default) ===== */}
      {mainView === "patients" && (
        <>
          {/* Urgent help banner */}
          {waiting.length > 0 && (
            <section className="hx-attn" aria-label="Needs attention now" style={{ marginBottom: 20 }}>
              <header>
                <span><Icon.siren size={18} /></span>
                <h2>Needs attention now</h2>
                <small>{waiting.length} patient{waiting.length === 1 ? "" : "s"} waiting for a nurse</small>
                <Link href="/staff/help" className="rr-btn rr-btn--ghost rr-btn--sm">Open inbox <Icon.chevron size={14} /></Link>
              </header>
              <ul>
                {waiting.slice(0, 3).map((h) => (
                  <li key={h.id} className={`hx-attn-row hx-attn-row--${h.severity}`}>
                    <div className="hx-attn-who"><b>{h.patient_name}</b><SeverityBadge s={h.severity} /></div>
                    <p>{h.source === "button" ? "Pressed the help button" : `"${h.heard}"`}</p>
                    <SlaMeter h={h} now={hp.now} />
                    <div className="hx-attn-act"><HelpActions h={h} compact /><Link href={`/staff/help?open=${h.id}`} className="rr-btn rr-btn--ghost rr-btn--sm">Open</Link></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* KPIs */}
          <div className="cc-kpis cc-kpis--5" style={{ marginBottom: 24 }}>
            <Link href="/staff/help" className={`rr-card cc-kpi hx-kpi-link${waiting.length ? " is-alert" : ""}`}>
              <span className="cc-kpi-ic cc-kpi-ic--red"><Icon.bell size={22} /></span>
              <div><small>Help waiting</small><b>{hp.summary ? hp.summary.unacked : "–"}</b></div>
            </Link>
            <div className="rr-card cc-kpi" style={{ cursor: "pointer" }} onClick={() => { setMainView("plans"); setRunTab("needs_review"); }}>
              <span className="cc-kpi-ic cc-kpi-ic--amber"><Icon.alert size={22} /></span>
              <div><small>Awaiting review</small><b>{countRun((r) => r.status === "needs_review")}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.users size={22} /></span>
              <div><small>Total patients</small><b>{patients ? patients.length : "–"}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--green"><Icon.shield size={22} /></span>
              <div><small>Approved plans</small><b>{countRun((r) => r.status === "approved" || r.status === "reapproved")}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.clock size={22} /></span>
              <div><small>Avg help response</small><b>{hp.summary?.avg_ack_seconds != null ? mmss(hp.summary.avg_ack_seconds * 1000) : "–"}</b></div>
            </div>
          </div>

          {patientsError && <p className="rr-error">{patientsError}</p>}

          <div className="cc-cols">
            <section>
              <div className="cc-panel-head">
                <h2>{lang === "hi" ? "मरीज़ डायरेक्ट्री" : "Patient directory"}</h2>
                <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm"><Icon.upload size={15} /> {t.newDischarge}</Link>
              </div>
              {patients && patients.length > 0 && (
                <div className="hx-tabs hx-tabs--tight" role="tablist" aria-label="Filter patients">
                  {PATIENT_TABS.map((tb) => (
                    <button key={tb.key} role="tab" aria-selected={patientTab === tb.key} className={patientTab === tb.key ? "is-on" : ""} onClick={() => setPatientTab(tb.key)}>
                      {tb.label}<span>{patientTabCounts[tb.key]}</span>
                    </button>
                  ))}
                </div>
              )}
              {patients === null && !patientsError && (
                <div className="rr-card">{[0, 1, 2, 3].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}</div>
              )}
              {patients && patients.length === 0 && (
                <div className="rr-card rr-empty">
                  <span className="rr-empty-icon"><Icon.users size={26} /></span>
                  <b>{lang === "hi" ? "कोई मरीज़ नहीं" : "No patients yet"}</b>
                  <small>{lang === "hi" ? "डिस्चार्ज दस्तावेज़ अपलोड करते ही मरीज़ यहाँ दिखाई देगा।" : "Patients appear here once you upload their discharge document."}</small>
                  <Link href="/staff/upload" className="rr-btn rr-btn--primary">{t.newDischarge}</Link>
                </div>
              )}
              {patients && patients.length > 0 && shownPatients.length === 0 && (
                <div className="rr-card rr-empty rr-empty--sm">
                  <b>{q ? (lang === "hi" ? "कोई परिणाम नहीं" : "No patients match your search") : (lang === "hi" ? "इस सूची में कोई नहीं" : "Nobody in this view")}</b>
                </div>
              )}
              {shownPatients.length > 0 && (
                <div className="rr-table-wrap">
                  <table className="rr-table hx-queue">
                    <thead>
                      <tr>
                        <th>{t.thPatient}</th>
                        <th>{t.thPhone}</th>
                        <th>{t.thPlanStatus}</th>
                        <th>{t.thChecks}</th>
                        <th>{t.thHelp}</th>
                        <th>{t.thAdded}</th>
                        <th><span className="hx-sr">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownPatients.map((p) => (
                        <tr key={p.id} className="rr-row" tabIndex={0} onClick={() => router.push(`/staff/patients/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/staff/patients/${p.id}`)}>
                          <td>
                            <span className="rr-pt">
                              <span className="cc-avatar cc-avatar--sm">{initials(p.name || "P")}</span>
                              <span>
                                <b>{p.name || "Patient"}</b>
                                <small>{(p.language || "en").toUpperCase()} · {p.filename}</small>
                                {(p as any).patient_slug && (
                                  <small style={{ color: "var(--accent, #3b82f6)", fontSize: "0.72rem" }}>
                                    /p/demo/{(p as any).patient_slug}
                                  </small>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="rr-mute">{p.phone || "–"}</td>
                          <td><RunPill status={p.status} /></td>
                          <td>
                            {p.to_check === null ? (
                              <span className="rr-mute">{lang === "hi" ? "संसाधित हो रहा है" : "Working"}</span>
                            ) : p.to_check > 0 ? (
                              <span className="rr-chip rr-chip--warn">{p.to_check} {lang === "hi" ? "समीक्षा बाकी" : "to check"}</span>
                            ) : (
                              <span className="rr-chip rr-chip--ok">{lang === "hi" ? "सभी सहमत" : "All agreed"}</span>
                            )}
                          </td>
                          <td>
                            {p.help_active > 0 ? (
                              <span className={`hx-help-chip${p.help_critical_active ? " is-critical" : ""}`}>
                                <Icon.bell size={13} />{p.help_active} {lang === "hi" ? "सक्रिय" : "open"}
                              </span>
                            ) : p.help_total > 0 ? (
                              <span className="rr-mute">{p.help_total} {lang === "hi" ? "निपटाए गए" : "resolved"}</span>
                            ) : (
                              <span className="rr-mute">–</span>
                            )}
                          </td>
                          <td className="rr-mute">{timeAgo(p.created_at)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <span className="hx-rowtools">
                              <Link href={`/staff/patients/${p.id}`} title="Patient details" aria-label={`Details for ${p.name || "Patient"}`}><Icon.user size={16} /></Link>
                              {(p as any).patient_slug && (
                                <Link href={`/p/demo/${(p as any).patient_slug}`} target="_blank" rel="noreferrer" title="Patient companion app" aria-label={`Patient app for ${p.name || "Patient"}`}><Icon.phone size={16} /></Link>
                              )}
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={(e) => handleDeletePatient(e, p.id, p.name || "")}
                                title={lang === "hi" ? `मरीज़ हटाएं: ${p.name || "Patient"}` : `Delete patient: ${p.name || "Patient"}`}
                                aria-label={`Delete ${p.name || "Patient"}`}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "3px 4px",
                                  cursor: deletingId === p.id ? "not-allowed" : "pointer",
                                  color: "#dc2626",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: 4,
                                  transition: "background 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                              >
                                {deletingId === p.id ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>…</span>
                                ) : (
                                  <Icon.trash size={15} />
                                )}
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Right rail */}
            <aside className="cc-rail">
              <div className="rr-card">
                <div className="cc-panel-head"><h2>Quick actions</h2></div>
                <div className="cc-quick cc-quick--3">
                  <Link href="/staff/upload"><span><Icon.upload size={17} /></span>New discharge</Link>
                  <Link href="/staff/help"><span><Icon.bell size={17} /></span>Help requests</Link>
                  <button onClick={() => setMainView("analytics")} className="rr-btn rr-btn--ghost rr-btn--sm" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}>
                    <Icon.pulse size={16} /> Clinical analytics
                  </button>
                  <Link href="/live" target="_blank" rel="noreferrer"><span><Icon.pulse size={17} /></span>Live theater</Link>
                  <Link href="/p/demo/priya-sharma-526" target="_blank" rel="noreferrer"><span><Icon.phone size={17} /></span>Patient app demo</Link>
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
                  <dt>API</dt><dd className={hp.conn === "ok" && !runsError ? "is-ok" : "is-bad"}>{hp.conn === "ok" && !runsError ? "Online" : "Offline"}</dd>
                  <dt>Processing</dt><dd>{countRun((r) => r.status === "queued" || r.status === "processing")}</dd>
                  <dt>Failed plans</dt><dd className={runs?.some((r) => r.status === "failed") ? "is-bad" : ""}>{countRun((r) => r.status === "failed")}</dd>
                  <dt>Last plan</dt><dd>{runs && runs[0] ? timeAgo(runs[0].created_at) : "–"}</dd>
                </dl>
              </div>
            </aside>
          </div>
        </>
      )}

      {/* ===== View: DISCHARGE PLANS (raw runs queue) ===== */}
      {mainView === "plans" && (
        <>
          {waiting.length > 0 && (
            <section className="hx-attn" aria-label="Needs attention now" style={{ marginBottom: 20 }}>
              <header>
                <span><Icon.siren size={18} /></span>
                <h2>Needs attention now</h2>
                <small>{waiting.length} patient{waiting.length === 1 ? "" : "s"} waiting for a nurse</small>
                <Link href="/staff/help" className="rr-btn rr-btn--ghost rr-btn--sm">Open inbox <Icon.chevron size={14} /></Link>
              </header>
              <ul>
                {waiting.slice(0, 3).map((h) => (
                  <li key={h.id} className={`hx-attn-row hx-attn-row--${h.severity}`}>
                    <div className="hx-attn-who"><b>{h.patient_name}</b><SeverityBadge s={h.severity} /></div>
                    <p>{h.source === "button" ? "Pressed the help button" : `"${h.heard}"`}</p>
                    <SlaMeter h={h} now={hp.now} />
                    <div className="hx-attn-act"><HelpActions h={h} compact /><Link href={`/staff/help?open=${h.id}`} className="rr-btn rr-btn--ghost rr-btn--sm">Open</Link></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="cc-kpis cc-kpis--5" style={{ marginBottom: 24 }}>
            <Link href="/staff/help" className={`rr-card cc-kpi hx-kpi-link${waiting.length ? " is-alert" : ""}`}>
              <span className="cc-kpi-ic cc-kpi-ic--red"><Icon.bell size={22} /></span>
              <div><small>Help waiting</small><b>{hp.summary ? hp.summary.unacked : "–"}</b></div>
            </Link>
            <div className="rr-card cc-kpi" style={{ cursor: "pointer" }} onClick={() => setRunTab("needs_review")}>
              <span className="cc-kpi-ic cc-kpi-ic--amber"><Icon.alert size={22} /></span>
              <div><small>Awaiting review</small><b>{countRun((r) => r.status === "needs_review")}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.spark size={22} /></span>
              <div><small>Processing</small><b>{countRun((r) => r.status === "queued" || r.status === "processing")}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--green"><Icon.shield size={22} /></span>
              <div><small>Approved</small><b>{countRun((r) => r.status === "approved" || r.status === "reapproved")}</b></div>
            </div>
            <div className="rr-card cc-kpi">
              <span className="cc-kpi-ic cc-kpi-ic--blue"><Icon.clock size={22} /></span>
              <div><small>Avg help response</small><b>{hp.summary?.avg_ack_seconds != null ? mmss(hp.summary.avg_ack_seconds * 1000) : "–"}</b></div>
            </div>
          </div>

          {runsError && <p className="rr-error">{runsError}</p>}

          <div className="cc-cols">
            <section>
              <div className="cc-panel-head">
                <h2>Discharge plans</h2>
                <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm"><Icon.upload size={15} /> New discharge</Link>
              </div>
              {runs && runs.length > 0 && (
                <div className="hx-tabs hx-tabs--tight" role="tablist" aria-label="Filter plans">
                  {RUN_TABS.map((t) => (
                    <button key={t.key} role="tab" aria-selected={runTab === t.key} className={runTab === t.key ? "is-on" : ""} onClick={() => setRunTab(t.key)}>
                      {t.label}<span>{runTabCounts[t.key]}</span>
                    </button>
                  ))}
                </div>
              )}
              {runs === null && !runsError && <div className="rr-card">{[0, 1, 2].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}</div>}
              {runs && runs.length === 0 && (
                <div className="rr-card rr-empty">
                  <span className="rr-empty-icon"><Icon.file size={26} /></span>
                  <b>No discharge plans yet</b>
                  <small>Start with the sample document to see the whole flow.</small>
                  <Link href="/staff/upload" className="rr-btn rr-btn--primary">Upload a document</Link>
                </div>
              )}
              {runs && runs.length > 0 && shownRuns.length === 0 && <div className="rr-card rr-empty rr-empty--sm"><b>{q ? "No plans match your search" : "Nothing in this view"}</b></div>}
              {shownRuns.length > 0 && <QueueTable runs={shownRuns} help={helpByRun} />}
            </section>

            <aside className="cc-rail">
              <div className="rr-card">
                <div className="cc-panel-head"><h2>Quick actions</h2></div>
                <div className="cc-quick cc-quick--3">
                  <Link href="/staff/upload"><span><Icon.upload size={17} /></span>New discharge</Link>
                  <Link href="/staff/help"><span><Icon.bell size={17} /></span>Help requests</Link>
                  <button onClick={() => setMainView("patients")} className="rr-btn rr-btn--ghost rr-btn--sm" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}>
                    <Icon.users size={16} /> Patient directory
                  </button>
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
                  <dt>API</dt><dd className={hp.conn === "ok" && !runsError ? "is-ok" : "is-bad"}>{hp.conn === "ok" && !runsError ? "Online" : "Offline"}</dd>
                  <dt>Plans processing</dt><dd>{countRun((r) => r.status === "queued" || r.status === "processing")}</dd>
                  <dt>Failed plans</dt><dd className={runs?.some((r) => r.status === "failed") ? "is-bad" : ""}>{countRun((r) => r.status === "failed")}</dd>
                  <dt>Last plan</dt><dd>{runs && runs[0] ? timeAgo(runs[0].created_at) : "–"}</dd>
                </dl>
              </div>
            </aside>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="rr-page"><div className="rr-card rr-skel" style={{ height: 180 }} /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
