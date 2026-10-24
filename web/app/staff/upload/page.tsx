"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import UploadZone from "@/components/staff/UploadZone";
import { api } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { LANGS } from "@/lib/review";

interface DemoCaseMeta {
  id: string;
  title: string;
  badge: string;
  badge_color: string;
  patient_name: string;
  age: number;
  procedure: string;
  summary: string;
  teaching_point: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [demoCases, setDemoCases] = useState<DemoCaseMeta[]>([]);
  const [loadingCase, setLoadingCase] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ patient_name: "", language: "en", phone: "", guardian_name: "", guardian_phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [batchJson, setBatchJson] = useState("");
  const [batchResult, setBatchResult] = useState<{ imported: any[]; failed: any[] } | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    api.listDemoCases()
      .then((d) => setDemoCases(d.cases))
      .catch(() => {});
  }, []);

  const selectDemoCase = async (caseId: string) => {
    setLoadingCase(caseId);
    setError(null);
    try {
      const res = await api.loadDemoCase(caseId);
      router.push(`/staff/runs/${res.run_id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo case");
      setLoadingCase(null);
    }
  };

  const resetAllDemos = async () => {
    setResetting(true);
    try {
      await api.resetDemo();
      setNotice("All 4 demo cases have been reset to pristine review state.");
      setTimeout(() => setNotice(null), 3500);
    } catch (err) {
      setError("Failed to reset demo cases");
    } finally {
      setResetting(false);
    }
  };

  const submitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBatchBusy(true);
    setBatchError(null);
    setBatchResult(null);
    try {
      const records = JSON.parse(batchJson);
      if (!Array.isArray(records)) throw new Error("Input must be a JSON array of patient records");
      const result = await api.batchImportPatients(records);
      setBatchResult(result);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch import failed");
    } finally {
      setBatchBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      Object.entries(f).forEach(([k, v]) => form.append(k, v || (k === "patient_name" ? "Demo Patient" : "")));
      const { run_id } = await api.createRun(form);
      router.push(`/staff/runs/${run_id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  };

  return (
    <motion.div className="rr-page" {...fadeUp} style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="rr-title">Discharge Intake &amp; Live Demos</h1>
          <p className="rr-sub">Select a synthetic presentation case or upload a custom fictional document.</p>
        </div>
        <button
          type="button"
          className="rr-btn rr-btn--ghost rr-btn--sm"
          disabled={resetting}
          onClick={() => void resetAllDemos()}
          title="Reset all 4 demo cases to initial unapproved state"
        >
          <Icon.pulse size={14} /> {resetting ? "Resetting…" : "Reset all 4 demo cases"}
        </button>
      </div>

      {notice && (
        <div className="rr-card" style={{ background: "rgba(34, 197, 94, 0.1)", borderColor: "rgba(34, 197, 94, 0.3)", padding: 12, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "#15803d", fontSize: "0.9rem" }}>{notice}</p>
        </div>
      )}

      {/* 4 DEMO CASES GRID */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon.shield size={18} /> Select Fictional Demo Case (Hackathon / Jury Presentation)
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
          {demoCases.map((c) => {
            const isLoading = loadingCase === c.id;
            return (
              <div
                key={c.id}
                className="rr-card"
                style={{
                  padding: 16,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.15s ease",
                  border: isLoading ? "2px solid var(--accent, #3b82f6)" : undefined,
                }}
                onClick={() => void selectDemoCase(c.id)}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <b style={{ fontSize: "1rem" }}>{c.title}</b>
                    <span className={`rr-chip rr-chip--${c.badge_color || "ok"}`} style={{ fontSize: "0.75rem" }}>
                      {c.badge}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 8px 0", fontSize: "0.88rem", color: "var(--muted, #666)" }}>
                    <b>{c.patient_name}</b> ({c.age}y) · {c.procedure}
                  </p>
                  <p style={{ fontSize: "0.84rem", margin: "6px 0", lineHeight: 1.4 }}>{c.summary}</p>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <small style={{ color: "var(--muted, #666)", fontSize: "0.78rem" }}>{c.teaching_point}</small>
                  <span className="rr-btn rr-btn--ghost rr-btn--sm">
                    {isLoading ? "Loading…" : <>Launch <Icon.arrow size={13} /></>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MANUAL UPLOAD FORM */}
      <section style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 24 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Or Upload Custom Document (.docx / .pdf)</h2>
        <form className="rr-form" onSubmit={submit}>
          <UploadZone file={file} onFile={setFile} />
          <div className="rr-card rr-form-card" style={{ marginTop: 14 }}>
            <h2>Patient Details</h2>
            <div className="rr-grid2">
              <label className="rr-label">Name<input className="rr-input" value={f.patient_name} onChange={set("patient_name")} placeholder="Jane Example" /></label>
              <label className="rr-label">Plan language
                <select className="rr-input" value={f.language} onChange={set("language")}>
                  {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
              <label className="rr-label">Patient phone<input className="rr-input" value={f.phone} onChange={set("phone")} placeholder="+91…" /></label>
              <label className="rr-label">Guardian name<input className="rr-input" value={f.guardian_name} onChange={set("guardian_name")} /></label>
              <label className="rr-label">Guardian phone<input className="rr-input" value={f.guardian_phone} onChange={set("guardian_phone")} /></label>
            </div>
          </div>
          {error && <p className="rr-error">{error}</p>}
          <div className="rr-actions rr-actions--end" style={{ marginTop: 14 }}>
            <button type="submit" className="rr-btn rr-btn--primary rr-btn--lg" disabled={!file || busy}>
              {busy ? "Uploading…" : <>Process document <Icon.arrow size={16} /></>}
            </button>
          </div>
        </form>
      </section>

      {/* BATCH IMPORT SECTION */}
      <section style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 24, marginTop: 24 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Batch Import Patients (JSON)</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted, #666)", marginBottom: 12 }}>
          Paste a JSON array of patient records to import multiple patients at once. Each record must have at least a <code>name</code> field.
        </p>
        <form className="rr-form" onSubmit={submitBatch}>
          <textarea
            className="rr-input"
            rows={6}
            placeholder={`[\n  { "name": "Neha Verma", "phone": "+91 98765 11111", "language": "en" },\n  { "name": "Ravi Kumar", "phone": "+91 98765 22222", "procedure": "Knee Surgery" }\n]`}
            value={batchJson}
            onChange={(e) => setBatchJson(e.target.value)}
            style={{ fontFamily: "monospace", fontSize: "0.82rem", width: "100%", minWidth: 0 }}
          />
          {batchError && <p className="rr-error">{batchError}</p>}
          <div className="rr-actions rr-actions--end" style={{ marginTop: 10 }}>
            <button type="submit" className="rr-btn rr-btn--primary" disabled={!batchJson.trim() || batchBusy}>
              {batchBusy ? "Importing…" : <><Icon.upload size={15} /> Import batch</>}
            </button>
          </div>
        </form>
        {batchResult && (
          <div className="rr-card" style={{ marginTop: 14 }}>
            <p style={{ margin: "0 0 8px 0" }}>
              <b style={{ color: "#15803d" }}>{batchResult.imported.length} imported</b>
              {batchResult.failed.length > 0 && <>, <b style={{ color: "#b91c1c" }}>{batchResult.failed.length} failed</b></>}
            </p>
            {batchResult.imported.map((p: any, i: number) => (
              <div key={i} style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                ✅ <b>{p.patient_name}</b> — <a href={p.dashboard_url} target="_blank" rel="noreferrer">{p.dashboard_url}</a>
              </div>
            ))}
            {batchResult.failed.map((f: any, i: number) => (
              <div key={i} style={{ fontSize: "0.85rem", color: "#b91c1c", marginBottom: 4 }}>
                ❌ {f.patient_name || `Record ${f.index + 1}`}: {f.reason}
              </div>
            ))}
          </div>
        )}
      </section>
    </motion.div>
  );
}
