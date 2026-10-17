"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/staff/icons";
import UploadZone from "@/components/staff/UploadZone";
import { api } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import { LANGS } from "@/lib/review";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ patient_name: "", language: "en", phone: "", guardian_name: "", guardian_phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

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
    <motion.div className="rr-page rr-page--narrow" {...fadeUp}>
      <h1 className="rr-title">New discharge</h1>
      <p className="rr-sub">Use fictional documents only. Real patient data must never go through this prototype.</p>
      <form className="rr-form" onSubmit={submit}>
        <UploadZone file={file} onFile={setFile} />
        <div className="rr-card rr-form-card">
          <h2>Patient</h2>
          <div className="rr-grid2">
            <label className="rr-label">Name<input className="rr-input" value={f.patient_name} onChange={set("patient_name")} placeholder="Jane Example" /></label>
            <label className="rr-label">Plan language
              <select className="rr-input" value={f.language} onChange={set("language")}>
                {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <label className="rr-label">Patient phone (WhatsApp)<input className="rr-input" value={f.phone} onChange={set("phone")} placeholder="+91…" /></label>
            <label className="rr-label">Guardian name<input className="rr-input" value={f.guardian_name} onChange={set("guardian_name")} /></label>
            <label className="rr-label">Guardian phone<input className="rr-input" value={f.guardian_phone} onChange={set("guardian_phone")} /></label>
          </div>
        </div>
        {error && <p className="rr-error">{error}</p>}
        <div className="rr-actions rr-actions--end">
          <button type="submit" className="rr-btn rr-btn--primary rr-btn--lg" disabled={!file || busy}>
            {busy ? "Uploading…" : <>Process document <Icon.arrow size={16} /></>}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
