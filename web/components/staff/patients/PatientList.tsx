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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const TABS: { key: Tab; label: string; test: (p: PatientRow) => boolean }[] = [
    { key: "all", label: lang === "hi" ? "सभी मरीज़" : "All Patients", test: () => true },
    { key: "help", label: lang === "hi" ? "मदद अनुरोध" : "Asked for Help", test: (p) => p.help_active > 0 },
    { key: "review", label: lang === "hi" ? "समीक्षा बाकी" : "Needs Review", test: (p) => p.status === "needs_review" },
    { key: "approved", label: lang === "hi" ? "स्वीकृत प्लान" : "Approved", test: (p) => p.status === "approved" },
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

  // Close 3-dots dropdown when clicking outside
  useEffect(() => {
    const handleOutside = () => setOpenMenuId(null);
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, []);

  const searched = useMemo(() => (rows ?? []).filter((p) => !q || `${p.name} ${p.filename} ${p.phone}`.toLowerCase().includes(q)), [rows, q]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((tabItem) => [tabItem.key, searched.filter(tabItem.test).length])) as Record<Tab, number>, [searched]);
  const shown = useMemo(() => searched.filter(TABS.find((tabItem) => tabItem.key === tab)!.test), [searched, tab]);
  const open = (id: string) => router.push(`/staff/patients/${id}`);

  const handleDelete = async (e: React.MouseEvent, patient: PatientRow) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      lang === "hi"
        ? `क्या आप वाकई ${patient.name || "इस मरीज़"} का डिस्चार्ज रिकॉर्ड और प्रोफ़ाइल हटाना चाहते हैं?`
        : `Are you sure you want to delete the discharge record and profile for ${patient.name || "this patient"}?`
    );
    if (!confirmed) return;

    setDeletingId(patient.id);
    setOpenMenuId(null);
    try {
      await api.deletePatient(patient.id);
      setRows((prev) => (prev ? prev.filter((r) => r.id !== patient.id) : []));
      setActionNotice(
        lang === "hi"
          ? `${patient.name || "मरीज़"} का डिस्चार्ज रिकॉर्ड सफलतापूर्वक हटा दिया गया।`
          : `Discharge and profile for ${patient.name || "patient"} successfully deleted.`
      );
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      alert(lang === "hi" ? "रिकॉर्ड हटाने में विफल।" : "Failed to delete patient record.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCall = (e: React.MouseEvent, phone: string | undefined, name: string) => {
    e.stopPropagation();
    if (!phone) {
      alert(lang === "hi" ? "इस मरीज़ का फोन नंबर उपलब्ध नहीं है।" : "No phone number registered for this patient.");
      return;
    }
    window.open(`tel:${phone}`, "_self");
  };

  return (
    <div className="rr-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 20px" }}>
      {/* Page Header */}
      <div className="rr-page-head" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 className="rr-title" style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
              {t.dashboardTitle}
            </h1>
            <span style={{ fontSize: "0.78rem", background: "#EFF6FF", color: "#1D4ED8", padding: "3px 10px", borderRadius: 12, fontWeight: 600 }}>
              Aurevia Hospital Care Console
            </span>
          </div>
          <p className="rr-sub" style={{ marginTop: 4, color: "#64748B", fontSize: "0.92rem" }}>
            {t.dashboardSub}
          </p>
        </div>
        <Link
          href="/staff/upload"
          className="rr-btn rr-btn--primary rr-btn--sm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 18px",
            borderRadius: 8,
            fontWeight: 600,
            boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
          }}
        >
          <Icon.upload size={16} /> {t.newDischarge}
        </Link>
      </div>

      {actionNotice && (
        <div style={{
          background: "#ECFDF5",
          border: "1px solid #10B981",
          color: "#065F46",
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 16,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <Icon.check size={16} /> {actionNotice}
        </div>
      )}

      {/* Staff Voice Action Bar */}
      <div style={{ marginBottom: 20 }}>
        <StaffVoiceBar patients={rows || undefined} />
      </div>

      {error && <p className="rr-error" style={{ marginBottom: 16 }}>{error}</p>}

      {/* Filter Tabs */}
      {rows && rows.length > 0 && (
        <div className="hx-tabs" role="tablist" aria-label="Filter patients" style={{ marginBottom: 16 }}>
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              role="tab"
              aria-selected={tab === tabItem.key}
              className={tab === tabItem.key ? "is-on" : ""}
              onClick={() => setTab(tabItem.key)}
              style={{ padding: "8px 16px", fontWeight: 600, borderRadius: 8 }}
            >
              {tabItem.label}
              <span style={{ marginLeft: 8, background: tab === tabItem.key ? "#2563EB" : "#E2E8F0", color: tab === tabItem.key ? "#fff" : "#475569", padding: "2px 7px", borderRadius: 10, fontSize: "0.75rem" }}>
                {counts[tabItem.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Skeleton Loading */}
      {rows === null && !error && (
        <div className="rr-card" style={{ padding: 24, borderRadius: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rr-skel" style={{ height: 56, marginBottom: 12, borderRadius: 8 }} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {rows && rows.length === 0 && (
        <div className="rr-card rr-empty" style={{ padding: 48, textAlign: "center", borderRadius: 12 }}>
          <span className="rr-empty-icon" style={{ display: "inline-block", marginBottom: 12 }}><Icon.users size={36} /></span>
          <b style={{ fontSize: "1.1rem" }}>{lang === "hi" ? "कोई मरीज़ रिकॉर्ड नहीं है" : "No patients yet"}</b>
          <p style={{ color: "#64748B", margin: "8px 0 16px" }}>
            {lang === "hi" ? "डिस्चार्ज दस्तावेज़ अपलोड करते ही मरीज़ यहाँ दिखाई देगा।" : "A patient appears here as soon as you upload their discharge document."}
          </p>
          <Link href="/staff/upload" className="rr-btn rr-btn--primary">{t.newDischarge}</Link>
        </div>
      )}

      {rows && rows.length > 0 && shown.length === 0 && (
        <div className="rr-card rr-empty rr-empty--sm" style={{ padding: 32, textAlign: "center", borderRadius: 12 }}>
          <b>{q ? (lang === "hi" ? "कोई परिणाम नहीं मिला" : "No patients match your search") : (lang === "hi" ? "इस सूची में कोई नहीं है" : "Nobody in this view")}</b>
        </div>
      )}

      {/* Enhanced Smooth Patient Table */}
      {shown.length > 0 && (
        <div className="rr-table-wrap" style={{
          background: "#FFFFFF",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          border: "1px solid #E2E8F0",
          overflow: "visible",
        }}>
          <table className="rr-table hx-queue" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: "14px 18px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thPatient}</th>
                <th style={{ padding: "14px 14px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thPhone}</th>
                <th style={{ padding: "14px 14px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thPlanStatus}</th>
                <th style={{ padding: "14px 14px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thChecks}</th>
                <th style={{ padding: "14px 14px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thHelp}</th>
                <th style={{ padding: "14px 14px", textAlign: "left", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>{t.thAdded}</th>
                <th style={{ padding: "14px 18px", textAlign: "right", fontSize: "0.82rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", minWidth: 160 }}>
                  {lang === "hi" ? "त्वरित कार्य" : "Actions"}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className="rr-row"
                  tabIndex={0}
                  onClick={() => open(p.id)}
                  onKeyDown={(e) => e.key === "Enter" && open(p.id)}
                  style={{
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                    borderBottom: "1px solid #F1F5F9",
                    height: 68,
                  }}
                >
                  {/* Patient Info */}
                  <td style={{ padding: "12px 18px" }}>
                    <span className="rr-pt" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        className="cc-avatar cc-avatar--sm"
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: "#EFF6FF",
                          color: "#2563EB",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          border: "1px solid #BFDBFE",
                          flexShrink: 0,
                        }}
                      >
                        {initials(p.name || "P")}
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <b style={{ color: "#0F172A", fontSize: "0.95rem" }}>{p.name || "Patient"}</b>
                        <small style={{ color: "#64748B", fontSize: "0.78rem" }}>
                          {(p.language || "en").toUpperCase()} · {p.filename}
                        </small>
                        {(p as any).patient_slug && (
                          <span style={{ color: "#2563EB", fontSize: "0.72rem", fontWeight: 500 }}>
                            🔗 /p/demo/{(p as any).patient_slug}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>

                  {/* Phone */}
                  <td style={{ padding: "12px 14px", color: "#334155", fontSize: "0.88rem", fontWeight: 500 }}>
                    {p.phone ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ color: "#10B981" }}>●</span> {p.phone}
                      </span>
                    ) : (
                      <span style={{ color: "#94A3B8" }}>–</span>
                    )}
                  </td>

                  {/* Plan Status */}
                  <td style={{ padding: "12px 14px" }}>
                    <RunPill status={p.status} />
                  </td>

                  {/* Clinical Checks */}
                  <td style={{ padding: "12px 14px" }}>
                    {p.to_check === null ? (
                      <span style={{ color: "#94A3B8", fontSize: "0.82rem" }}>{lang === "hi" ? "संसाधित हो रहा है" : "Working"}</span>
                    ) : p.to_check > 0 ? (
                      <span className="rr-chip rr-chip--warn" style={{ padding: "4px 8px", borderRadius: 6, fontSize: "0.78rem" }}>
                        {p.to_check} {lang === "hi" ? "समीक्षा बाकी" : "to check"}
                      </span>
                    ) : (
                      <span className="rr-chip rr-chip--ok" style={{ padding: "4px 8px", borderRadius: 6, fontSize: "0.78rem" }}>
                        ✓ {lang === "hi" ? "सभी सहमत" : "All agreed"}
                      </span>
                    )}
                  </td>

                  {/* Patient Help Requests */}
                  <td style={{ padding: "12px 14px" }}>
                    {p.help_active > 0 ? (
                      <span
                        className={`hx-help-chip${p.help_critical_active ? " is-critical" : ""}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          background: p.help_critical_active ? "#FEF2F2" : "#FFFBEB",
                          color: p.help_critical_active ? "#DC2626" : "#D97706",
                          border: `1px solid ${p.help_critical_active ? "#FCA5A5" : "#FCD34D"}`,
                        }}
                      >
                        <Icon.bell size={13} />{p.help_active} {lang === "hi" ? "सक्रिय" : "open"}
                      </span>
                    ) : p.help_total > 0 ? (
                      <span style={{ color: "#64748B", fontSize: "0.82rem" }}>
                        {p.help_total} {lang === "hi" ? "निपटाए गए" : "resolved"}
                      </span>
                    ) : (
                      <span style={{ color: "#CBD5E1" }}>–</span>
                    )}
                  </td>

                  {/* Added time */}
                  <td style={{ padding: "12px 14px", color: "#64748B", fontSize: "0.82rem" }}>
                    {timeAgo(p.created_at)}
                  </td>

                  {/* Actions: Always Visible Call Button + 3-Dots Menu */}
                  <td
                    style={{ padding: "12px 18px", textAlign: "right", position: "relative" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      {/* Explicit Always-Visible Call Button */}
                      <button
                        type="button"
                        onClick={(e) => handleCall(e, p.phone, p.name)}
                        title={p.phone ? `Call ${p.name || "Patient"}: ${p.phone}` : "No phone number"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: p.phone ? "#F0FDF4" : "#F1F5F9",
                          color: p.phone ? "#16A34A" : "#94A3B8",
                          border: `1px solid ${p.phone ? "#BBF7D0" : "#E2E8F0"}`,
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: p.phone ? "pointer" : "not-allowed",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Icon.phone size={14} />
                        <span>{lang === "hi" ? "कॉल" : "Call"}</span>
                      </button>

                      {/* Explicit Always-Visible Delete Patient Icon Button */}
                      <button
                        type="button"
                        disabled={deletingId === p.id}
                        onClick={(e) => handleDelete(e, p)}
                        title={lang === "hi" ? `मरीज़ हटाएं: ${p.name || "Patient"}` : `Delete patient: ${p.name || "Patient"}`}
                        aria-label={lang === "hi" ? "मरीज़ हटाएं" : "Delete patient"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 32,
                          height: 32,
                          background: deletingId === p.id ? "#FEE2E2" : "#FEF2F2",
                          color: "#DC2626",
                          border: "1px solid #FECACA",
                          borderRadius: 6,
                          cursor: deletingId === p.id ? "not-allowed" : "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {deletingId === p.id ? (
                          <span style={{ fontSize: 11, fontWeight: 700 }}>…</span>
                        ) : (
                          <Icon.trash size={15} />
                        )}
                      </button>

                      {/* 3-Dots Menu Button */}
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === p.id ? null : p.id);
                          }}
                          aria-label="More options"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: "1px solid #E2E8F0",
                            background: openMenuId === p.id ? "#F1F5F9" : "#FFFFFF",
                            color: "#475569",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: "1.1rem",
                            fontWeight: 700,
                          }}
                        >
                          ⋮
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === p.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 36,
                              background: "#FFFFFF",
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                              borderRadius: 8,
                              minWidth: 200,
                              zIndex: 100,
                              padding: "6px 0",
                              textAlign: "left",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                open(p.id);
                              }}
                              style={{
                                width: "100%",
                                padding: "8px 14px",
                                background: "none",
                                border: "none",
                                textAlign: "left",
                                fontSize: "0.85rem",
                                color: "#1E293B",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: "pointer",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                            >
                              <Icon.file size={14} />
                              {lang === "hi" ? "डिस्चार्ज प्रोफ़ाइल देखें" : "View Discharge Profile"}
                            </button>

                            {p.phone && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  setOpenMenuId(null);
                                  handleCall(e, p.phone, p.name);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "8px 14px",
                                  background: "none",
                                  border: "none",
                                  textAlign: "left",
                                  fontSize: "0.85rem",
                                  color: "#16A34A",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  cursor: "pointer",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                              >
                                <Icon.phone size={14} />
                                {lang === "hi" ? `कॉल करें (${p.phone})` : `Call (${p.phone})`}
                              </button>
                            )}

                            <div style={{ height: 1, background: "#F1F5F9", margin: "4px 0" }} />

                            {/* Delete Discharge / Patient Option */}
                            <button
                              type="button"
                              disabled={deletingId === p.id}
                              onClick={(e) => handleDelete(e, p)}
                              style={{
                                width: "100%",
                                padding: "8px 14px",
                                background: "none",
                                border: "none",
                                textAlign: "left",
                                fontSize: "0.85rem",
                                color: "#DC2626",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                cursor: deletingId === p.id ? "wait" : "pointer",
                                fontWeight: 500,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                            >
                              <Icon.x size={14} />
                              {deletingId === p.id
                                ? (lang === "hi" ? "हटाया जा रहा है..." : "Deleting...")
                                : (lang === "hi" ? "डिस्चार्ज / मरीज़ हटाएं" : "Delete Discharge / Patient")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
