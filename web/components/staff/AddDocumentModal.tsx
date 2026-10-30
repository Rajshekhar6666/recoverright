"use client";

import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Icon } from "./icons";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  patientName: string;
  patientPhone?: string;
  guardianName?: string;
  guardianPhone?: string;
  language?: string;
  onUploaded: (newRunId: string) => void;
}

export default function AddDocumentModal({
  open,
  onClose,
  patientName,
  patientPhone = "",
  guardianName = "",
  guardianPhone = "",
  language = "en",
  onUploaded,
}: Props) {
  const { t, lang: appLang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("discharge_summary");
  const [name, setName] = useState(patientName);
  const [phone, setPhone] = useState(patientPhone);
  const [gName, setGName] = useState(guardianName);
  const [gPhone, setGPhone] = useState(guardianPhone);
  const [lang, setLang] = useState(language);
  const [file, setFile] = useState<File | null>(null);

  // Fallback mode toggle
  const [manualMode, setManualMode] = useState(false);
  const [manualProcedure, setManualProcedure] = useState("");
  const [manualMedication, setManualMedication] = useState("");
  const [manualWarning, setManualWarning] = useState("");
  const [manualFollowUp, setManualFollowUp] = useState("");

  // States
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [successRunId, setSuccessRunId] = useState<string | null>(null);

  const DOC_TYPES = [
    { id: "discharge_summary", label: appLang === "hi" ? "अस्पताल डिस्चार्ज सारांश" : "Hospital Discharge Summary" },
    { id: "operative_report", label: appLang === "hi" ? "ऑपरेशन एवं प्रक्रिया नोट" : "Operative & Procedure Note" },
    { id: "progress_note", label: appLang === "hi" ? "चिकित्सीय प्रगति नोट" : "Clinical Progress Note" },
    { id: "prescription", label: appLang === "hi" ? "दवा पर्ची (प्रिस्क्रिप्शन)" : "Prescription & Medication Order" },
    { id: "lab_report", label: appLang === "hi" ? "जाँच एवं लैब रिपोर्ट" : "Diagnostic & Lab Report" },
  ];

  if (!open) return null;

  const handleFileChange = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase();
    const ok = [".docx", ".pdf", ".txt", ".text", ".md", ".rtf", ".csv", ".png", ".jpg", ".jpeg", ".webp"];
    if (!ok.some((e) => ext.endsWith(e))) {
      setValidationError(appLang === "hi" ? "अमान्य फ़ाइल प्रारूप। कृपया .docx, .pdf, .txt, या .jpg/.png दस्तावेज़ चुनें।" : "Invalid file format. Please upload a .docx, .pdf, .txt, or image document.");
      return;
    }
    setValidationError(null);
    setFile(f);
  };

  const loadSampleDocument = () => {
    // Generate a synthetic clinical discharge document file blob for demonstration
    const content = `HOSPITAL DISCHARGE SUMMARY (CLINICAL DEMO)
Patient: ${name || "Demo Patient"} | DOB: 14/05/1992 | Sex: Female
Phone: ${phone || "+91 98765 43210"}
Procedure Performed: Laparoscopic Appendectomy for uncomplicated acute appendicitis.
Admission Date: 2026-10-20 | Discharge Date: 2026-10-23
Vital Signs at Discharge: BP 120/78 mmHg, HR 72 bpm, SpO2 98%, Temp 98.6 F, Pain 2/10.

Discharge Medications:
1. Paracetamol | 500 mg | Every 6 hours | 5 days | Oral
2. Amoxicillin-Clavulanate | 625 mg | Twice daily | 5 days | Oral with meals
3. Pantoprazole | 40 mg | Once daily before breakfast | 7 days | Oral

Activity & Wound Care Instructions:
- Keep surgical laparoscopic incisions clean and dry.
- No heavy lifting (> 5 kg) for 2 weeks. Normal gentle ambulation encouraged.

Red Flag Warning Signs:
- Report fever above 101 F, worsening lower abdominal pain, persistent nausea, or wound redness immediately.

Follow-Up Care:
- Surgical OPD review in 7 days with Dr. Arvind Rao.`;

    const blob = new Blob([content], { type: "text/plain" });
    const sampleFile = new File([blob], `${docType}_${(name || "patient").toLowerCase().replace(/\s+/g, "_")}.txt`, {
      type: "text/plain",
    });
    setFile(sampleFile);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError(appLang === "hi" ? "मरीज़ का नाम आवश्यक है।" : "Patient name is required.");
      return;
    }

    if (!manualMode && !file) {
      setValidationError(appLang === "hi" ? "कृपया अपलोड करने के लिए .docx या .pdf फ़ाइल चुनें।" : "Please select or drop a .docx or .pdf file to upload.");
      return;
    }

    setBusy(true);
    setProgressStage(appLang === "hi" ? "फ़ाइल एवं मरीज़ का विवरण सत्यापित हो रहा है…" : "Validating file and patient association…");

    try {
      let uploadFile = file;

      // In manual mode, synthesize a structured text file from the manual entries
      if (manualMode || !uploadFile) {
        setProgressStage(appLang === "hi" ? "मैन्युअल प्रविष्टियों का संकलन किया जा रहा है…" : "Compiling manual clinical entries…");
        const manualContent = `MANUAL CLINICAL ENTRY (${DOC_TYPES.find((d) => d.id === docType)?.label})
Patient: ${name}
Phone: ${phone}
Primary Condition / Procedure: ${manualProcedure || "Post-Surgical Review"}
Medications Prescribed: ${manualMedication || "Paracetamol 500 mg TDS"}
Warning Signs: ${manualWarning || "Fever > 101 F, severe wound pain"}
Follow-Up: ${manualFollowUp || "OPD review in 7 days"}`;

        const blob = new Blob([manualContent], { type: "application/pdf" });
        uploadFile = new File([blob], `manual_entry_${Date.now()}.pdf`, { type: "application/pdf" });
      }

      await new Promise((r) => setTimeout(r, 400));
      setProgressStage(appLang === "hi" ? "दस्तावेज़ बैकएंड स्टोरेज में अपलोड हो रहा है…" : "Uploading document to backend storage…");

      const form = new FormData();
      form.append("file", uploadFile);
      form.append("patient_name", name);
      form.append("language", lang);
      form.append("phone", phone);
      form.append("guardian_name", gName);
      form.append("guardian_phone", gPhone);
      form.append("use_cache", "true");

      const res = await api.createRun(form);
      setProgressStage(appLang === "hi" ? "चिकित्सीय निष्कर्षण एवं समीक्षा कार्ड निर्माण जारी है…" : "Running clinical extraction & entity reconciliation…");
      await new Promise((r) => setTimeout(r, 600));

      setSuccessRunId(res.run_id);
      setProgressStage(appLang === "hi" ? "दस्तावेज़ सफलतापूर्वक संसाधित और लिंक हो गया!" : "Document successfully processed and linked!");

      setTimeout(() => {
        onUploaded(res.run_id);
        onClose();
      }, 1000);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : (appLang === "hi" ? "अपलोड विफल रहा।" : "Failed to upload and process document."));
      setBusy(false);
    }
  };

  return (
    <div className="rr-overlay" onClick={onClose}>
      <motion.div
        className="rr-modal pt-upload-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <header className="pt-modal-head">
          <div className="pt-modal-title">
            <span className="rr-modal-icon">
              <Icon.upload size={22} />
            </span>
            <div>
              <h2>{t.addDocumentTitle}</h2>
              <p className="rr-mute">{t.addDocumentSub(name || (appLang === "hi" ? "इस मरीज़" : "this patient"))}</p>
            </div>
          </div>
          <button type="button" className="rr-icon-btn" onClick={onClose} aria-label={t.close}>
            <Icon.x size={18} />
          </button>
        </header>

        {validationError && (
          <div className="rr-error" role="alert">
            <Icon.alert size={16} /> {validationError}
          </div>
        )}

        {busy ? (
          <div className="pt-upload-busy">
            <div className="rr-proc">
              <span className="rr-spin" style={{ width: 32, height: 32, margin: "0 auto 16px", display: "block" }} />
              <h3>{t.processingDocument}</h3>
              <p className="rr-mute">{progressStage}</p>
              <div className="rr-bar" style={{ height: 6, margin: "16px 0" }}>
                <motion.i
                  initial={{ width: "15%" }}
                  animate={{ width: successRunId ? "100%" : "75%" }}
                  transition={{ duration: 1.2 }}
                />
              </div>
              <small>{t.processingSub}</small>
            </div>
          </div>
        ) : (
          <form className="rr-form" onSubmit={handleSubmit}>
            {/* Patient Association confirmation */}
            <div className="pt-association-banner">
              <div className="pt-assoc-label">{t.patientAssociation}</div>
              <div className="pt-assoc-val">
                <b>{name}</b> {phone && <span>· {phone}</span>}
              </div>
            </div>

            {/* Document Type Selector */}
            <div className="rr-label">
              <span>{t.documentType} *</span>
              <select className="rr-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Workflow Mode Tabs: Automated vs Manual Fallback */}
            <div className="pt-mode-toggle">
              <button
                type="button"
                className={`pt-mode-btn ${!manualMode ? "is-active" : ""}`}
                onClick={() => setManualMode(false)}
              >
                <Icon.file size={14} /> {t.uploadFileTab}
              </button>
              <button
                type="button"
                className={`pt-mode-btn ${manualMode ? "is-active" : ""}`}
                onClick={() => setManualMode(true)}
              >
                <Icon.edit size={14} /> {t.manualEntryTab}
              </button>
            </div>

            {!manualMode ? (
              <>
                {/* File Dropzone */}
                <div
                  className={`rr-drop ${dragOver ? "is-over" : ""} ${file ? "has-file" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFileChange(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf"
                    hidden
                    onChange={(e) => handleFileChange(e.target.files?.[0])}
                  />

                  {file ? (
                    <div className="rr-drop-file">
                      <span className="rr-drop-icon">
                        <Icon.file size={22} />
                      </span>
                      <div>
                        <b>{file.name}</b>
                        <small>{(file.size / 1024).toFixed(0)} KB · {appLang === "hi" ? "समीक्षा के लिए तैयार" : "Ready to verify"}</small>
                      </div>
                      <button
                        type="button"
                        className="rr-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                      >
                        <Icon.x size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="rr-drop-empty">
                      <span className="rr-drop-icon">
                        <Icon.upload size={22} />
                      </span>
                      <b>{t.dropDocumentPrompt}</b>
                      <small>{t.dropDocumentSub}</small>
                    </div>
                  )}
                </div>

                <div className="pt-sample-loader">
                  <button
                    type="button"
                    className="rr-btn rr-btn--ghost rr-btn--sm"
                    onClick={loadSampleDocument}
                  >
                    <Icon.spark size={14} /> {t.loadSampleDocument}
                  </button>
                  <small className="rr-mute">{t.loadSampleSub}</small>
                </div>
              </>
            ) : (
              <div className="pt-manual-fields">
                <div className="rr-label">
                  <span>{t.manualProcedureLabel}</span>
                  <input
                    className="rr-input"
                    placeholder={appLang === "hi" ? "उदा. लैप्रोस्कोपिक एपेंडेक्टॉमी" : "e.g. Laparoscopic Appendectomy"}
                    value={manualProcedure}
                    onChange={(e) => setManualProcedure(e.target.value)}
                  />
                </div>
                <div className="rr-label">
                  <span>{t.manualMedicationLabel}</span>
                  <input
                    className="rr-input"
                    placeholder={appLang === "hi" ? "उदा. Paracetamol 500mg, Amoxicillin 625mg" : "e.g. Paracetamol 500mg, Amoxicillin 625mg"}
                    value={manualMedication}
                    onChange={(e) => setManualMedication(e.target.value)}
                  />
                </div>
                <div className="rr-label">
                  <span>{t.manualWarningLabel}</span>
                  <input
                    className="rr-input"
                    placeholder={appLang === "hi" ? "उदा. बुखार > 101 F, घाव में तेज़ दर्द" : "e.g. Fever > 101 F, severe wound pain"}
                    value={manualWarning}
                    onChange={(e) => setManualWarning(e.target.value)}
                  />
                </div>
                <div className="rr-label">
                  <span>{t.manualFollowUpLabel}</span>
                  <input
                    className="rr-input"
                    placeholder={appLang === "hi" ? "उदा. 7 दिनों में ओपीडी समीक्षा" : "e.g. OPD Clinic in 7 days"}
                    value={manualFollowUp}
                    onChange={(e) => setManualFollowUp(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="rr-actions rr-actions--end" style={{ marginTop: 20 }}>
              <button type="button" className="rr-btn rr-btn--ghost" onClick={onClose}>
                {t.cancel}
              </button>
              <button type="submit" className="rr-btn rr-btn--primary">
                <Icon.upload size={15} /> {t.uploadAndOpenReview}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
