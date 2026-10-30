"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { spring } from "@/lib/motion";
import { Icon } from "./icons";

const OK = [".docx", ".pdf", ".txt", ".text", ".md", ".rtf", ".csv", ".png", ".jpg", ".jpeg", ".webp"];

export default function UploadZone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!OK.some((e) => f.name.toLowerCase().endsWith(e))) {
      setErr("Please upload a .docx, .pdf, .txt, .md, or image file (.png, .jpg).");
      return;
    }
    setErr(null);
    onFile(f);
  };

  return (
    <div>
      <motion.div
        className={`rr-drop${over ? " is-over" : ""}${file ? " has-file" : ""}`}
        animate={{ scale: over ? 1.012 : 1 }}
        transition={spring}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <input ref={input} type="file" accept=".docx,.pdf,.txt,.md,.rtf,.csv,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => take(e.target.files?.[0])} />
        <AnimatePresence mode="wait" initial={false}>
          {file ? (
            <motion.div key="file" className="rr-drop-file" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span className="rr-drop-icon"><Icon.file size={22} /></span>
              <span>
                <b>{file.name}</b>
                <small>{(file.size / 1024).toFixed(0)} KB · ready to process</small>
              </span>
              <button type="button" className="rr-icon-btn" aria-label="Remove file"
                onClick={(e) => { e.stopPropagation(); onFile(null); }}>
                <Icon.x size={16} />
              </button>
            </motion.div>
          ) : (
            <motion.div key="empty" className="rr-drop-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="rr-drop-icon"><Icon.upload size={24} /></span>
              <b>Drop any discharge summary or clinical report here</b>
              <small>or click to browse · DOCX, PDF, TXT, MD, or scanned photos (.jpg, .png)</small>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {err && <p className="rr-error">{err}</p>}
    </div>
  );
}
