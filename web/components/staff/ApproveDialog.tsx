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
  onApprove: (by: string) => Promise<void>;
}) {
  const { open, accepted, removed, onClose, onApprove } = props;
  const [by, setBy] = useState("Nurse");
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
            <label className="rr-label">
              Approved by
              <input className="rr-input" value={by} onChange={(e) => setBy(e.target.value)} />
            </label>
            <div className="rr-actions rr-actions--end">
              <button className="rr-btn rr-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="rr-btn rr-btn--primary" disabled={busy || !by.trim()}
                onClick={async () => { setBusy(true); try { await onApprove(by.trim()); } finally { setBusy(false); } }}>
                <Icon.lock size={16} /> Approve and lock
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
