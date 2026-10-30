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

const SAMPLE_CLINICAL_TEXTS = {
  cardiac: `DISCHARGE SUMMARY
Patient Name: Rajesh Patel | Age: 58 | Sex: Male
Discharge Date: 2026-10-28
Admitting Diagnosis: Coronary Artery Disease, Unstable Angina
Procedure Performed: Percutaneous Coronary Intervention (PCI) with drug-eluting stent to LAD

DISCHARGE MEDICATIONS:
1. Aspirin | 75 mg | Once daily with breakfast | Ongoing | Oral
2. Clopidogrel | 75 mg | Once daily after dinner | 12 months | Oral
3. Atorvastatin | 80 mg | Once daily at bedtime | Ongoing | Oral
4. Metoprolol Succinate | 25 mg | Once daily in morning | Ongoing | Oral
5. Pantoprazole | 40 mg | Once daily before breakfast | 30 days | Oral

ACTIVITY & RECOVERY:
- Avoid lifting anything heavier than 5 kg (11 lbs) for 1 week.
- No driving for 48 hours. Light walking for 15-20 minutes daily encouraged.
- Radial puncture site: keep clean and dry. Bandage may be removed after 24 hours.

DIETARY GUIDELINES:
- Low-sodium, heart-healthy cardiac diet (< 2 g sodium/day).
- Strict avoidance of grapefruit and grapefruit juice with atorvastatin.

WARNING SIGNS (SEEK EMERGENCY CARE):
- Chest pain, pressure, heaviness, or shortness of breath.
- Bleeding, swelling, or severe pain at wrist catheter entry site.
- Dizziness, faintness, or irregular rapid heartbeat.

FOLLOW-UP APPOINTMENT:
- Cardiology OPD clinic visit in 14 days with Dr. Mehta.
- Radial site dressing check in 48 hours at local health center.
Emergency Contact: Cardiac Helpline +91 98200 12345`,

  ortho: `HOSPITAL DISCHARGE SUMMARY
Patient Name: Sunita Devi | Age: 64 | Sex: Female
Admission: 2026-10-22 | Discharge: 2026-10-26
Primary Procedure: Right Total Knee Arthroplasty (TKA) for severe osteoarthritis

DISCHARGE MEDICATIONS:
1. Paracetamol | 1000 mg | Every 8 hours as needed for pain | 7 days | Oral
2. Tramadol | 50 mg | Every 12 hours for moderate-to-severe pain only | 5 days | Oral
3. Enoxaparin | 40 mg | Once daily subcutaneous injection | 14 days | Subcutaneous
4. Cefuroxime Axetil | 500 mg | Twice daily with meals | 5 days | Oral
5. Pantoprazole | 40 mg | Once daily before breakfast | 14 days | Oral

WOUND CARE & MOBILITY:
- Keep right knee surgical dressing clean, dry, and intact until staple removal.
- Showering permitted after day 5 with waterproof dressing; do not soak in bath.
- Ambulate with walker or crutches as instructed by physical therapy.
- Complete quad sets, ankle pumps, and heel slides 3 times daily.

RED FLAG WARNING SIGNS:
- Calf swelling, tenderness, or warmth (deep vein thrombosis sign).
- Fever above 101 F or chills.
- Increasing redness, heat, foul drainage, or gaping along knee incision.
- Sudden shortness of breath or chest pain (pulmonary embolism - call 108/emergency).

FOLLOW-UP CARE:
- Orthopedic OPD visit in 12 days for wound evaluation and staple removal.
- Home physiotherapy starting on post-discharge day 2.
Hospital Helpline: +91 98111 22334`,

  laparoscopy: `DISCHARGE INSTRUCTIONS
Patient Name: Ananya Roy | Age: 31 | Sex: Female
Discharge Date: 2026-10-29
Procedure: Laparoscopic Cholecystectomy for symptomatic cholelithiasis

MEDICATIONS:
1. Ibuprofen | 400 mg | Every 8 hours with food for pain | 3 days | Oral
2. Paracetamol | 500 mg | Every 6 hours as needed | 5 days | Oral
3. Pantoprazole | 40 mg | Once daily before breakfast | 7 days | Oral

WOUND CARE:
- Laparoscopic incision sites with Dermabond glue. Keep clean and dry.
- Glue will peel off naturally in 7-10 days; do not scrub or pick at incisions.
- Light shower after 48 hours. Pat dry gently.

ACTIVITY & DIET:
- No heavy lifting (> 10 lbs) for 2 weeks. Normal walking is encouraged.
- Low-fat, bland diet for the first 1-2 weeks. Avoid fried and spicy foods.

EMERGENCY SIGNS:
- Fever over 101 F, chills, worsening abdominal distension or severe pain.
- Yellowing of eyes/skin (jaundice).
- Persistent nausea or vomiting unable to tolerate liquids.

FOLLOW-UP:
- Surgical OPD review in 7 days with Dr. Sharma.
Helpline: +91 98450 99887`,
};

export default function UploadPage() {
  const router = useRouter();
  const [intakeMode, setIntakeMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
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

  const loadPreset = (key: keyof typeof SAMPLE_CLINICAL_TEXTS, name: string) => {
    setPastedText(SAMPLE_CLINICAL_TEXTS[key]);
    setIntakeMode("paste");
    setF((prev) => ({ ...prev, patient_name: name }));
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
    if (intakeMode === "file" && !file) {
      setError("Please select or drop a document file (.docx, .pdf, .txt, .md, .png, .jpg).");
      return;
    }
    if (intakeMode === "paste" && !pastedText.trim()) {
      setError("Please enter or paste clinical notes / discharge text.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (intakeMode === "file" && file) {
        form.append("file", file);
      } else {
        form.append("raw_text", pastedText.trim());
      }
      Object.entries(f).forEach(([k, v]) => form.append(k, v || (k === "patient_name" ? "Demo Patient" : "")));
      const { run_id } = await api.createRun(form);
      router.push(`/staff/runs/${run_id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload and processing failed");
      setBusy(false);
    }
  };

  return (
    <motion.div className="rr-page" {...fadeUp} style={{ maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="rr-title">Discharge Intake &amp; Document Processing</h1>
          <p className="rr-sub">Upload any clinical file, paste raw discharge notes, or launch an interactive presentation case.</p>
        </div>
      </div>

      {notice && (
        <div className="rr-card" style={{ background: "rgba(34, 197, 94, 0.1)", borderColor: "rgba(34, 197, 94, 0.3)", padding: 12, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "#15803d", fontSize: "0.9rem" }}>{notice}</p>
        </div>
      )}

      {/* PRIMARY SECTION: PROCESS NEW DISCHARGE DOCUMENT */}
      <section className="rr-card" style={{ padding: 24, marginBottom: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.upload size={20} /> Process New Patient Document
            </h2>
            <small style={{ color: "var(--muted, #666)" }}>
              Accepts .docx, .pdf, .txt, .md, scanned photos (.jpg, .png), or pasted clinical notes
            </small>
          </div>
          {/* Intake Mode Switcher */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.05)", borderRadius: 8, padding: 3, gap: 4 }}>
            <button
              type="button"
              className={`rr-btn rr-btn--sm ${intakeMode === "file" ? "rr-btn--primary" : "rr-btn--ghost"}`}
              style={{ borderRadius: 6 }}
              onClick={() => { setIntakeMode("file"); setError(null); }}
            >
              <Icon.file size={14} /> Upload File
            </button>
            <button
              type="button"
              className={`rr-btn rr-btn--sm ${intakeMode === "paste" ? "rr-btn--primary" : "rr-btn--ghost"}`}
              style={{ borderRadius: 6 }}
              onClick={() => { setIntakeMode("paste"); setError(null); }}
            >
              <Icon.edit size={14} /> Paste Clinical Notes
            </button>
          </div>
        </div>

        <form className="rr-form" onSubmit={submit}>
          {intakeMode === "file" ? (
            <div>
              <UploadZone file={file} onFile={setFile} />
              <div style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--muted, #666)" }}>
                💡 <b>Supported formats:</b> Word (.docx), PDF (.pdf), Plain Text (.txt, .md), and Scanned Photos (.jpg, .png).
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label className="rr-label" style={{ margin: 0 }}>
                  Paste Discharge Summary, EHR Note, or Prescription Text:
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="rr-btn rr-btn--ghost rr-btn--sm"
                    style={{ fontSize: "0.76rem", padding: "3px 8px" }}
                    onClick={() => loadPreset("cardiac", "Rajesh Patel")}
                  >
                    + Cardiac Stent
                  </button>
                  <button
                    type="button"
                    className="rr-btn rr-btn--ghost rr-btn--sm"
                    style={{ fontSize: "0.76rem", padding: "3px 8px" }}
                    onClick={() => loadPreset("ortho", "Sunita Devi")}
                  >
                    + Knee Surgery
                  </button>
                  <button
                    type="button"
                    className="rr-btn rr-btn--ghost rr-btn--sm"
                    style={{ fontSize: "0.76rem", padding: "3px 8px" }}
                    onClick={() => loadPreset("laparoscopy", "Ananya Roy")}
                  >
                    + Laparoscopy
                  </button>
                </div>
              </div>
              <textarea
                className="rr-input"
                rows={9}
                placeholder="Paste the hospital discharge text, doctor's orders, medications, wound care, or red flag symptoms here…"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                style={{ fontFamily: "inherit", fontSize: "0.86rem", width: "100%", lineHeight: 1.5 }}
              />
            </div>
          )}

          {/* Patient Details Form */}
          <div className="rr-card rr-form-card" style={{ marginTop: 16, background: "rgba(0,0,0,0.015)" }}>
            <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>Patient &amp; Plan Configuration</h3>
            <div className="rr-grid2">
              <label className="rr-label">
                Patient Name
                <input
                  className="rr-input"
                  value={f.patient_name}
                  onChange={set("patient_name")}
                  placeholder="e.g. Ramesh Patel"
                />
              </label>
              <label className="rr-label">
                Plan Language
                <select className="rr-input" value={f.language} onChange={set("language")}>
                  {LANGS.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rr-label">
                Patient Phone (for SMS &amp; Companion App)
                <input className="rr-input" value={f.phone} onChange={set("phone")} placeholder="+91 98765 43210" />
              </label>
              <label className="rr-label">
                Guardian / Caregiver Name
                <input className="rr-input" value={f.guardian_name} onChange={set("guardian_name")} placeholder="Optional caregiver name" />
              </label>
              <label className="rr-label">
                Guardian Phone
                <input className="rr-input" value={f.guardian_phone} onChange={set("guardian_phone")} placeholder="+91 98765 00000" />
              </label>
            </div>
          </div>

          {error && <p className="rr-error" style={{ marginTop: 12 }}>{error}</p>}

          <div className="rr-actions rr-actions--end" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="rr-btn rr-btn--primary rr-btn--lg"
              disabled={busy || (intakeMode === "file" && !file) || (intakeMode === "paste" && !pastedText.trim())}
            >
              {busy ? (
                <>
                  <Icon.pulse size={18} /> Processing Document with AI Pipeline…
                </>
              ) : (
                <>
                  Process Document &amp; Review Plan <Icon.arrow size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* SECONDARY SECTION: 4 PRE-LOADED SYNTHETIC DEMO CASES */}
      <section style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 28, marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.shield size={18} /> Pre-Loaded Synthetic Demo Cases (Jury &amp; Hackathon)
            </h2>
            <small style={{ color: "var(--muted, #666)" }}>Instant presentation benchmarks demonstrating clinical reconciliation</small>
          </div>
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            disabled={resetting}
            onClick={() => void resetAllDemos()}
            title="Reset all 4 demo cases to initial unapproved state"
          >
            <Icon.pulse size={14} /> {resetting ? "Resetting…" : "Reset 4 demo cases"}
          </button>
        </div>

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

      {/* TERTIARY SECTION: BATCH IMPORT SECTION */}
      <section style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 24 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Batch Import Patients (JSON)</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted, #666)", marginBottom: 12 }}>
          Paste a JSON array of patient records to import multiple patients at once. Each record must have at least a <code>name</code> field.
        </p>
        <form className="rr-form" onSubmit={submitBatch}>
          <textarea
            className="rr-input"
            rows={5}
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
