"use client";
import { useState } from "react";
import { Icon } from "@/components/staff/icons";
import { ApiError } from "@/lib/api";
import { useHelp } from "@/lib/staffHelp";
import { dialable, mmss, sla, telHref } from "@/lib/time";
import type { HelpRequest, HelpSeverity, HelpStatus } from "@/lib/types";

export const STATUS_LABEL: Record<HelpStatus, string> = { open: "Waiting", acknowledged: "In progress", escalated: "Escalated", resolved: "Resolved" };

export function SeverityBadge({ s }: { s: HelpSeverity }) {
  return <span className={`hx-sev hx-sev--${s}`}>{s === "critical" ? "Critical" : "Concern"}</span>;
}

export function StatusBadge({ s }: { s: HelpStatus }) {
  return <span className={`hx-st hx-st--${s}`}><i />{STATUS_LABEL[s]}</span>;
}

export function SourceTags({ h }: { h: HelpRequest }) {
  return (
    <>
      <span className="hx-tag">{h.source === "voice" ? "Voice" : h.source === "button" ? "Button" : "Test"}</span>
      {h.demo && <span className="hx-tag hx-tag--demo">Demo plan</span>}
    </>
  );
}

/** Countdown to the response target while nobody has answered; the measured response time afterwards. */
export function SlaMeter({ h, now }: { h: HelpRequest; now: number }) {
  const s = sla(h, now);
  return (
    <div className={`hx-sla hx-sla--${s.tone}`} role="timer" aria-label={s.label}>
      <div className="hx-sla-bar"><i style={{ width: `${Math.min(100, s.ratio * 100)}%` }} /></div>
      <span>{s.label}</span>
    </div>
  );
}

/** What the patient said, quoted. */
export function Heard({ h }: { h: HelpRequest }) {
  return <p className="hx-heard">{h.source === "button" ? <em>Pressed the help button</em> : <>“{h.heard}”</>}{h.label && <small>{h.label}</small>}</p>;
}

type Mode = null | "resolve" | "escalate" | "note";

/** All the things a nurse can do with a request. `compact` shows only Acknowledge (dashboard / banner). */
export function HelpActions({ h, compact = false, onActed }: { h: HelpRequest; compact?: boolean; onActed?: () => void }) {
  const hp = useHelp();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try { await fn(); setMode(null); setNote(""); setReason(""); onActed?.(); }
    catch (e) { setErr(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  };

  if (h.status === "resolved" && compact) return null;
  const canAck = h.status === "open";
  if (compact) return (
    <div className="hx-actions hx-actions--compact">
      {canAck && <button className="rr-btn rr-btn--primary rr-btn--sm" disabled={!!busy} onClick={() => run("ack", () => hp.act(h.id, "acknowledge"))}><Icon.check size={15} /> {busy ? "…" : "Acknowledge"}</button>}
      {err && <small className="hx-err">{err}</small>}
    </div>
  );

  const p = h.patient;
  const callBtn = (target: "patient" | "guardian", phone: string | undefined, who: string) => {
    const ok = dialable(phone);
    const label = `Call ${target === "patient" ? "patient" : who || "guardian"}`;
    if (!ok || h.status === "resolved") return (
      <span className="rr-btn rr-btn--ghost is-off" aria-disabled="true" title={!phone ? "No phone number on file" : "Placeholder number: it cannot be dialled"}><Icon.phone size={16} /> {label}</span>
    );
    return (
      <a className="rr-btn rr-btn--ghost" href={telHref(phone!)} onClick={() => { onActed?.(); void hp.act(h.id, "call", { target }).catch(() => undefined); }}>
        <Icon.phone size={16} /> {label}<small>{phone}</small>
      </a>
    );
  };

  return (
    <div className="hx-actions">
      {h.status !== "resolved" && (
        <div className="hx-call-row">
          {callBtn("patient", p?.phone, p?.name ?? "")}
          {p?.guardian_phone ? callBtn("guardian", p.guardian_phone, p.guardian_name) : null}
          {!p && <small className="hx-hint">{h.demo ? "Demo plan: no patient record, so no phone number." : "This request is not linked to a patient record."}</small>}
        </div>
      )}
      {mode === null && (
        <div className="hx-btn-row">
          {canAck && <button className="rr-btn rr-btn--primary" disabled={!!busy} onClick={() => run("ack", () => hp.act(h.id, "acknowledge"))}><Icon.check size={16} /> Acknowledge</button>}
          {(h.status === "open" || h.status === "acknowledged") && <button className="rr-btn rr-btn--ghost" onClick={() => setMode("escalate")}><Icon.siren size={16} /> Escalate</button>}
          {h.status !== "resolved" && <button className="rr-btn rr-btn--ghost" onClick={() => setMode("resolve")}><Icon.shield size={16} /> Resolve</button>}
          <button className="rr-btn rr-btn--ghost" onClick={() => setMode("note")}><Icon.edit size={16} /> Add note</button>
        </div>
      )}
      {mode === "escalate" && (
        <form className="hx-form" onSubmit={(e) => { e.preventDefault(); void run("esc", () => hp.act(h.id, "escalate", { note })); }}>
          <label>Escalate to the on-call clinician<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (optional)" rows={2} /></label>
          <div className="hx-btn-row"><button className="rr-btn rr-btn--danger" disabled={!!busy}>{busy ? "…" : "Confirm escalation"}</button><button type="button" className="rr-btn rr-btn--ghost" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {mode === "resolve" && (
        <form className="hx-form" onSubmit={(e) => { e.preventDefault(); if (reason) void run("res", () => hp.act(h.id, "resolve", { resolution: reason, note })); }}>
          <label>How was it resolved?
            <select value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="">Choose a reason…</option>
              {Object.entries(hp.resolutions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Note (optional)<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What was done" /></label>
          <div className="hx-btn-row"><button className="rr-btn rr-btn--primary" disabled={!reason || !!busy}>{busy ? "…" : "Mark resolved"}</button><button type="button" className="rr-btn rr-btn--ghost" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {mode === "note" && (
        <form className="hx-form" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run("note", () => hp.act(h.id, "note", { note })); }}>
          <label>Add a note to the history<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus /></label>
          <div className="hx-btn-row"><button className="rr-btn rr-btn--primary" disabled={!note.trim() || !!busy}>{busy ? "…" : "Save note"}</button><button type="button" className="rr-btn rr-btn--ghost" onClick={() => setMode(null)}>Cancel</button></div>
        </form>
      )}
      {err && <p className="hx-err" role="alert">{err}</p>}
    </div>
  );
}

export const waitText = (h: HelpRequest, now: number) => mmss(sla(h, now).elapsedMs);
