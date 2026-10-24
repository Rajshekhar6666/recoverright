"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { dur } from "@/lib/motion";
import { Icon } from "./icons";

export default function ApproveDialog(props: {
  open: boolean;
  accepted: number;
  removed: number;
  onClose: () => void;
  onApprove: (by: string, role?: string, note?: string) => Promise<void>;
}) {
  const { open, accepted, removed, onClose, onApprove } = props;
  const [by, setBy] = useState("Anita Singh");
  const [role, setRole] = useState("Registered Nurse");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="rr-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="rr-modal" role="dialog" aria-modal="true" aria-label="Approve plan"
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
            transition={{ duration: dur.base, ease: [0.22, 1, 0.36, 1] }} onClick={(e) => e.stopPropagation()}>
            <span className="rr-modal-icon"><Icon.shield size={22} /></span>
            <h2>Approve this recovery plan?</h2>
            <ul className="rr-modal-list">
              <li><b>{accepted}</b> items will be part of the patient&apos;s plan</li>
              <li><b>{removed}</b> items were removed by staff</li>
              <li>The plan is <b>locked</b> after approval and every decision is kept in the audit log</li>
            </ul>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="rr-label">
                Clinician Name
                <input className="rr-input" placeholder="e.g. Anita Singh" value={by} onChange={(e) => setBy(e.target.value)} />
              </label>
              <label className="rr-label">
                Clinical Role
                <select className="rr-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="Registered Nurse">Registered Nurse</option>
                  <option value="Attending Physician">Attending Physician</option>
                  <option value="Care Coordinator">Care Coordinator</option>
                  <option value="Clinical Pharmacist">Clinical Pharmacist</option>
                </select>
              </label>
            </div>
            <label className="rr-label" style={{ marginTop: 8 }}>
              Clinical / Handover Note (optional)
              <input className="rr-input" placeholder="e.g. Confirmed medication reconciliation with hospital record" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="rr-actions rr-actions--end" style={{ marginTop: 16 }}>
              <button className="rr-btn rr-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="rr-btn rr-btn--primary" disabled={busy || !by.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onApprove(by.trim(), role, note.trim() || undefined);
                  } finally {
                    setBusy(false);
                  }
                }}>
                <Icon.lock size={16} /> Approve and lock
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
