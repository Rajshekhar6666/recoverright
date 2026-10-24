"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import type { ClinicalAnalyticsData, PatientAttentionItem, PatientProgressItem } from "@/lib/types";

interface Props {
  initialFilter?: "all" | "attention" | "approved";
  onSelectPatient?: (runId: string) => void;
  onOpenReviewQueue?: () => void;
}

export default function ClinicalAnalytics({ initialFilter = "all", onSelectPatient, onOpenReviewQueue }: Props) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [data, setData] = useState<ClinicalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention" | "approved">(initialFilter);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const res = await api.getClinicalAnalytics();
        if (!alive) return;
        setData(res);
        setError(null);
        setLoading(false);
        timer = setTimeout(load, 8000);
      } catch {
        if (!alive) return;
        setError(lang === "hi" ? "क्लिनिकल एनालिटिक्स लोड नहीं हो सका।" : "Unable to load clinical analytics.");
        setLoading(false);
        timer = setTimeout(load, 5000);
      }
    };

    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [lang]);

  const handleOpenPatient = (id: string, route?: string) => {
    if (onSelectPatient) {
      onSelectPatient(id);
    } else {
      router.push(route || `/staff/runs/${id}/review`);
    }
  };

  const filteredProgress = useMemo(() => {
    if (!data) return [];
    return data.care_plan_completion.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.procedure.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;
      if (filter === "attention") {
        return p.tasks_overdue > 0 || p.help_active > 0 || p.status === "needs_review";
      }
      if (filter === "approved") {
        return p.approved;
      }
      return true;
    });
  }, [data, search, filter]);

  if (loading && !data) {
    return (
      <div className="rr-analytics-loading">
        <div className="cc-kpis cc-kpis--5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rr-card rr-skel" style={{ height: 84 }} />
          ))}
        </div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="rr-card rr-skel" style={{ height: 260 }} />
          <div className="rr-card rr-skel" style={{ height: 260 }} />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rr-card rr-empty">
        <span className="rr-empty-icon rr-empty-icon--bad"><Icon.alert size={26} /></span>
        <b>{error}</b>
        <small>{lang === "hi" ? "API सर्वर से संपर्क जांचें।" : "Please check your connection to the API server."}</small>
      </div>
    );
  }

  const s = data!.summary;
  const tasks = data!.task_distribution;
  const docs = data!.document_stages;
  const totalTasks = tasks.total || 1;
  const totalDocs = s.documents_total || 1;

  return (
    <div className="rr-analytics-section">
      {/* 1. Operational Summary KPI Cards */}
      <div className="cc-kpis cc-kpis--5" style={{ marginBottom: 24 }}>
        {/* Total Patients */}
        <div className="rr-card cc-kpi">
          <span className="cc-kpi-ic cc-kpi-ic--blue">
            <Icon.users size={22} />
          </span>
          <div>
            <small>{lang === "hi" ? "कुल मरीज़" : "Total Patients"}</small>
            <b>{s.total_patients}</b>
          </div>
        </div>

        {/* Patients Requiring Attention */}
        <div
          className={`rr-card cc-kpi ${s.patients_requiring_attention > 0 ? "hx-kpi-link is-alert" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setFilter("attention")}
          title="Filter patients requiring clinical attention"
        >
          <span className="cc-kpi-ic cc-kpi-ic--red">
            <Icon.siren size={22} />
          </span>
          <div>
            <small>{t.patientsRequiringAttention}</small>
            <b>{s.patients_requiring_attention}</b>
          </div>
        </div>

        {/* Care Plans in Progress */}
        <div className="rr-card cc-kpi">
          <span className="cc-kpi-ic cc-kpi-ic--green">
            <Icon.shield size={22} />
          </span>
          <div>
            <small>{t.carePlansInProgress}</small>
            <b>{s.care_plans_in_progress}</b>
          </div>
        </div>

        {/* Average Care Plan Completion */}
        <div className="rr-card cc-kpi">
          <span className="cc-kpi-ic cc-kpi-ic--teal" style={{ background: "#ccfbf1", color: "#0f766e" }}>
            <Icon.check size={22} />
          </span>
          <div>
            <small>{t.avgCarePlanCompletion}</small>
            <b>{s.avg_care_plan_completion}%</b>
          </div>
        </div>

        {/* Pending & Overdue Tasks */}
        <div className="rr-card cc-kpi">
          <span className="cc-kpi-ic cc-kpi-ic--amber">
            <Icon.clock size={22} />
          </span>
          <div>
            <small>{t.pendingTasksCount}</small>
            <b>{s.pending_tasks + s.overdue_tasks}</b>
          </div>
        </div>
      </div>

      {/* 2. Interactive Charts Grid */}
      <div className="rr-analytics-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Horizontal Bar Chart: Care Plan Completion by Patient */}
        <div className="rr-card" style={{ padding: "18px 22px" }}>
          <div className="cc-panel-head" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
                {t.carePlanCompletionChart}
              </h2>
              <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
                {lang === "hi"
                  ? "मरीज़ों की दैनिक रिकवरी पूर्णता दर (वर्कस्पेस खोलने के लिए क्लिक करें)"
                  : "Daily recovery adherence rates per patient (click row to open workspace)"}
              </small>
            </div>
            {/* Filter buttons */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className={`rr-btn rr-btn--ghost rr-btn--sm ${filter === "all" ? "is-active" : ""}`}
                onClick={() => setFilter("all")}
                style={{ fontSize: "0.78rem", padding: "4px 8px" }}
              >
                {t.filterAllPatients}
              </button>
              <button
                className={`rr-btn rr-btn--ghost rr-btn--sm ${filter === "attention" ? "is-active" : ""}`}
                onClick={() => setFilter("attention")}
                style={{ fontSize: "0.78rem", padding: "4px 8px" }}
              >
                {t.filterAttentionOnly}
              </button>
            </div>
          </div>

          {filteredProgress.length === 0 ? (
            <div className="rr-empty rr-empty--sm" style={{ padding: 30 }}>
              <small>{lang === "hi" ? "कोई मरीज़ इस फ़िल्टर में नहीं मिला।" : "No patients match the selected filter."}</small>
            </div>
          ) : (
            <div className="rr-chart-bars" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {filteredProgress.slice(0, 7).map((p) => {
                const isOverdue = p.tasks_overdue > 0;
                const isComplete = p.completion_percentage === 100 && p.tasks_total > 0;
                const barColor = isComplete ? "#10b981" : isOverdue ? "#f59e0b" : "#0d9488";

                return (
                  <div
                    key={p.id}
                    className="rr-progress-bar-row"
                    onClick={() => handleOpenPatient(p.id)}
                    style={{
                      cursor: "pointer",
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#f8fafc")}
                    title={`Click to open ${p.name}'s dedicated workspace`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>{p.name}</strong>
                        <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: 8 }}>{p.procedure}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", color: "#475569", fontWeight: 600 }}>
                          {p.tasks_completed}/{p.tasks_total} {lang === "hi" ? "कार्य" : "tasks"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            color: barColor,
                            minWidth: 44,
                            textAlign: "right",
                          }}
                        >
                          {p.completion_percentage}%
                        </span>
                      </div>
                    </div>
                    {/* Visual Progress Bar Track */}
                    <div
                      style={{
                        width: "100%",
                        height: 7,
                        borderRadius: 4,
                        background: "#e2e8f0",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(p.completion_percentage, 3)}%`,
                          height: "100%",
                          borderRadius: 4,
                          background: barColor,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Task & Document Lifecycle Breakdowns */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Task Status Distribution */}
          <div className="rr-card" style={{ padding: "18px 20px" }}>
            <div className="cc-panel-head" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0 }}>
                {t.taskStatusDistribution}
              </h2>
              <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
                {tasks.total} {lang === "hi" ? "कुल कार्य" : "total tasks"}
              </small>
            </div>

            {/* Stacked Distribution Bar */}
            <div
              style={{
                width: "100%",
                height: 12,
                borderRadius: 6,
                background: "#e2e8f0",
                display: "flex",
                overflow: "hidden",
                marginBottom: 14,
              }}
            >
              <div
                style={{ width: `${(tasks.completed / totalTasks) * 100}%`, background: "#10b981" }}
                title={`Completed: ${tasks.completed}`}
              />
              <div
                style={{ width: `${(tasks.pending / totalTasks) * 100}%`, background: "#0ea5e9" }}
                title={`Pending: ${tasks.pending}`}
              />
              <div
                style={{ width: `${(tasks.overdue / totalTasks) * 100}%`, background: "#ef4444" }}
                title={`Overdue: ${tasks.overdue}`}
              />
              <div
                style={{ width: `${(tasks.snoozed / totalTasks) * 100}%`, background: "#94a3b8" }}
                title={`Snoozed: ${tasks.snoozed}`}
              />
            </div>

            {/* Legend & Exact Counts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.82rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                <span style={{ color: "#475569" }}>{lang === "hi" ? "पूर्ण" : "Completed"}:</span>
                <strong>{tasks.completed}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0ea5e9" }} />
                <span style={{ color: "#475569" }}>{lang === "hi" ? "बाकी" : "Pending"}:</span>
                <strong>{tasks.pending}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                <span style={{ color: "#475569" }}>{lang === "hi" ? "अतिदेय" : "Overdue"}:</span>
                <strong>{tasks.overdue}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#94a3b8" }} />
                <span style={{ color: "#475569" }}>{lang === "hi" ? "स्थगित" : "Snoozed"}:</span>
                <strong>{tasks.snoozed}</strong>
              </div>
            </div>
          </div>

          {/* Document Workflow Status */}
          <div className="rr-card" style={{ padding: "18px 20px" }}>
            <div className="cc-panel-head" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0 }}>
                {t.documentWorkflow}
              </h2>
              <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
                {s.documents_total} {lang === "hi" ? "डिस्चार्ज रिकॉर्ड" : "total documents"}
              </small>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Needs Review */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: docs.needs_review > 0 ? "#fef3c7" : "#f8fafc",
                  border: docs.needs_review > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0",
                  cursor: "pointer",
                }}
                onClick={() => onOpenReviewQueue ? onOpenReviewQueue() : router.push("/staff?tab=needs_review")}
                title="Open discharge review queue"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon.alert size={16} />
                  <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#92400e" }}>
                    {lang === "hi" ? "समीक्षा बाकी" : "Awaiting Clinician Review"}
                  </span>
                </div>
                <strong style={{ fontSize: "0.92rem", color: "#92400e" }}>{docs.needs_review}</strong>
              </div>

              {/* Approved */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "#f0fdf4",
                  border: "1px solid #dcfce7",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon.check size={16} />
                  <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#166534" }}>
                    {lang === "hi" ? "मंजूर एवं सक्रिय" : "Approved & Active"}
                  </span>
                </div>
                <strong style={{ fontSize: "0.92rem", color: "#166534" }}>{docs.approved}</strong>
              </div>

              {/* Processing */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon.spark size={16} />
                  <span style={{ fontSize: "0.84rem", fontWeight: 500, color: "#475569" }}>
                    {lang === "hi" ? "प्रसंस्करण जारी" : "Processing / Pipeline"}
                  </span>
                </div>
                <strong style={{ fontSize: "0.92rem", color: "#475569" }}>{docs.processing}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Actionable "Patients Requiring Attention" Triage List */}
      <div className="rr-card" style={{ padding: "18px 22px" }}>
        <div className="cc-panel-head" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.siren size={18} />
              {t.patientsRequiringAttention}
            </h2>
            <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
              {lang === "hi"
                ? "विलंबित कार्य, खुले मदद अनुरोध या समीक्षा बाकी वाले मरीज़ (त्वरित समाधान के लिए वर्कस्पेस खोलें)"
                : "Actionable triage for patients with overdue tasks, help requests, or pending review"}
            </small>
          </div>
          <span className="hx-tag" style={{ background: "#fee2e2", color: "#b91c1c", fontWeight: 700 }}>
            {data!.patients_requiring_attention.length} {lang === "hi" ? "मरीज़" : "patients"}
          </span>
        </div>

        {data!.patients_requiring_attention.length === 0 ? (
          <div className="rr-empty rr-empty--sm" style={{ padding: "24px 0" }}>
            <span className="rr-empty-icon rr-empty-icon--ok"><Icon.check size={24} /></span>
            <b>{lang === "hi" ? "सभी मरीज़ सुरक्षित स्थिति में हैं" : "All patients in good recovery status"}</b>
            <small>{lang === "hi" ? "कोई विलंबित कार्य या आपातकालीन अनुरोध नहीं है।" : "No overdue tasks or unresolved help requests."}</small>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data!.patients_requiring_attention.slice(0, 6).map((item) => {
              const isCrit = item.severity === "critical";
              const isHigh = item.severity === "high";

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: 6,
                    background: isCrit ? "#fef2f2" : isHigh ? "#fffbeb" : "#f8fafc",
                    border: isCrit ? "1px solid #fecaca" : isHigh ? "1px solid #fef3c7" : "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: isCrit ? "#ef4444" : isHigh ? "#f59e0b" : "#3b82f6",
                      }}
                    />
                    <div>
                      <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>{item.name}</strong>
                      <div style={{ fontSize: "0.78rem", color: isCrit ? "#b91c1c" : "#92400e", marginTop: 2 }}>
                        {item.primary_reason}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        background: isCrit ? "#fee2e2" : isHigh ? "#fef3c7" : "#e0f2fe",
                        color: isCrit ? "#b91c1c" : isHigh ? "#b45309" : "#0369a1",
                      }}
                    >
                      {item.severity}
                    </span>
                    <button
                      className="rr-btn rr-btn--primary rr-btn--sm"
                      onClick={() => handleOpenPatient(item.id, item.target_route)}
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                    >
                      {t.openWorkspaceAction} <Icon.chevron size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
