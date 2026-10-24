"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/staff/icons";
import RunPill from "@/components/staff/RunPill";
import { useSearch } from "@/components/staff/Shell";
import StaffVoiceBar from "@/components/staff/StaffVoiceBar";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { timeAgo } from "@/lib/review";
import { initials } from "@/lib/time";
import type { PatientRow } from "@/lib/types";

type Tab = "all" | "help" | "review" | "approved";

export default function PatientList() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const q = useSearch().trim().toLowerCase();
  const [rows, setRows] = useState<PatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const TABS: { key: Tab; label: string; test: (p: PatientRow) => boolean }[] = [
    { key: "all", label: lang === "hi" ? "सभी" : "All", test: () => true },
    { key: "help", label: lang === "hi" ? "मदद अनुरोध" : "Asked for help", test: (p) => p.help_active > 0 },
    { key: "review", label: lang === "hi" ? "समीक्षा बाकी" : "Needs review", test: (p) => p.status === "needs_review" },
    { key: "approved", label: lang === "hi" ? "स्वीकृत" : "Approved", test: (p) => p.status === "approved" },
  ];

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api.listPatients();
        if (!alive) return;
        setRows(r.items);
        setError(null);
        timer = setTimeout(load, 5000);
      } catch {
        if (!alive) return;
        setError(lang === "hi" ? "API से संपर्क नहीं हो पा रहा है।" : "Cannot reach the API. Is it running on port 8000?");
        timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [lang]);

  const searched = useMemo(() => (rows ?? []).filter((p) => !q || `${p.name} ${p.filename} ${p.phone}`.toLowerCase().includes(q)), [rows, q]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((tabItem) => [tabItem.key, searched.filter(tabItem.test).length])) as Record<Tab, number>, [searched]);
  const shown = useMemo(() => searched.filter(TABS.find((tabItem) => tabItem.key === tab)!.test), [searched, tab]);
  const open = (id: string) => router.push(`/staff/patients/${id}`);

  return (
    <div className="rr-page">
      <div className="rr-page-head">
        <div>
          <h1 className="rr-title">{t.dashboardTitle}</h1>
          <p className="rr-sub">{t.dashboardSub}</p>
        </div>
        <Link href="/staff/upload" className="rr-btn rr-btn--primary rr-btn--sm">
          <Icon.upload size={15} /> {t.newDischarge}
        </Link>
      </div>
      <div style={{ marginBottom: 16 }}>
        <StaffVoiceBar patients={rows || undefined} />
      </div>
      {error && <p className="rr-error">{error}</p>}
      {rows && rows.length > 0 && (
        <div className="hx-tabs" role="tablist" aria-label="Filter patients">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              role="tab"
              aria-selected={tab === tabItem.key}
              className={tab === tabItem.key ? "is-on" : ""}
              onClick={() => setTab(tabItem.key)}
            >
              {tabItem.label}
              <span>{counts[tabItem.key]}</span>
            </button>
          ))}
        </div>
      )}
      {rows === null && !error && (
        <div className="rr-card">
          {[0, 1, 2, 3].map((i) => <div key={i} className="rr-skel" style={{ height: 44, marginBottom: 10 }} />)}
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="rr-card rr-empty">
          <span className="rr-empty-icon"><Icon.users size={26} /></span>
          <b>{lang === "hi" ? "कोई मरीज़ रिकॉर्ड नहीं है" : "No patients yet"}</b>
          <small>{lang === "hi" ? "डिस्चार्ज दस्तावेज़ अपलोड करते ही मरीज़ यहाँ दिखाई देगा।" : "A patient appears here as soon as you upload their discharge document."}</small>
          <Link href="/staff/upload" className="rr-btn rr-btn--primary">{t.newDischarge}</Link>
        </div>
      )}
      {rows && rows.length > 0 && shown.length === 0 && (
        <div className="rr-card rr-empty rr-empty--sm">
          <b>{q ? (lang === "hi" ? "कोई परिणाम नहीं मिला" : "No patients match your search") : (lang === "hi" ? "इस सूची में कोई नहीं है" : "Nobody in this view")}</b>
        </div>
      )}
      {shown.length > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="rr-row" tabIndex={0} onClick={() => open(p.id)} onKeyDown={(e) => e.key === "Enter" && open(p.id)}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
