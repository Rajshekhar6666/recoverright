"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/staff/icons";
import type { HelpStatus } from "@/lib/voice/help";
import type { Severity } from "@/lib/voice/phrases";

export interface HelpAlertProps {
  heard: string;
  label: string;
  severity: Severity;
  source: "voice" | "button" | "test";
  phone: string;
  /** False for empty or placeholder numbers: the call button is replaced by an honest explanation. */
  phoneDialable: boolean;
  demo: boolean;
  status: HelpStatus;
  openedAt: number;
  /** The person tried to close while the care team had not been notified. */
  confirmClose: boolean;
  soundBlocked: boolean;
  emergencyNumber?: string;
  onRetry: () => void;
  onClose: () => void;
}

const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const clockTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Full-screen emergency view. It only says "sent" when the backend really answered 2xx. */
export default function HelpAlert(p: HelpAlertProps) {
  const root = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => { try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* not supported */ } }, []);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - p.openedAt), 1000);
    return () => clearInterval(id);
  }, [p.openedAt]);

  // Focus the safest action on open and keep keyboard focus inside the dialog.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>("[data-first]") ?? el).focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = Array.from(el.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener("keydown", trap);
    return () => { el.removeEventListener("keydown", trap); prev?.focus?.(); };
  }, []);

  const s = p.status;
  const critical = p.severity === "critical";
  const phoneLine = p.phone.replace(/[^\d+]/g, "");

  return (
    <div className={`pt-alert${critical ? " is-critical" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="pt-alert-h" aria-describedby="pt-alert-d" ref={root} tabIndex={-1}>
      <div>
        <span className="pt-alert-ic"><Icon.alert size={40} /></span>
        <h2 id="pt-alert-h">{critical ? "This sounds serious" : "Are you feeling unwell?"}</h2>
        <p id="pt-alert-d">I heard: “{p.heard}” <small className="pt-alert-tag">{p.source === "voice" ? "voice" : p.source === "test" ? "test phrase" : "button"} · {mmss(elapsed)}</small></p>

        {/* The truth about whether the care team has been told. */}
        <div className={`pt-alert-status is-${s.kind}`} role="status" aria-live="assertive">
          {s.kind === "sending" && <><i className="pt-spin-w" /> <span>Alerting your care team{s.attempt > 1 ? ` (attempt ${s.attempt})` : ""}…</span></>}
          {s.kind === "sent" && <><Icon.check size={20} /> <span><b>Your care team was alerted</b> at {clockTime(s.at)}.{p.demo ? " (Demo plan)" : ""}</span></>}
          {s.kind === "failed" && <><Icon.x size={20} /> <span><b>Help has NOT been sent.</b> {s.reason} Call your care team now.</span></>}
          {s.kind === "idle" && <span>Not sent yet.</span>}
        </div>
        {s.kind === "failed" && <button className="pt-btn pt-btn--line pt-alert-btn pt-alert-retry" onClick={p.onRetry}><Icon.replay size={20} /> Try sending the alert again</button>}

        {p.phoneDialable
          ? <a data-first className="pt-btn pt-btn--red pt-alert-btn" href={`tel:${phoneLine}`}><Icon.phone size={22} /> Call my care team</a>
          : <p className="pt-alert-warn">{p.demo ? "Demo plan: this is a placeholder number, so no call can be placed." : "No care-team number is on this plan."}</p>}
        {p.emergencyNumber && <a className="pt-btn pt-btn--red pt-alert-btn" href={`tel:${p.emergencyNumber}`}><Icon.phone size={22} /> Call emergency services ({p.emergencyNumber})</a>}

        <p className="pt-alert-sub">If this is an emergency, call your local emergency number now. Sit down and stay where you are.</p>
        {p.soundBlocked && <p className="pt-alert-sub">Sound is blocked by this browser. Tap anywhere once to allow alarms.</p>}

        {p.confirmClose && <p className="pt-alert-warn" role="alert">Your care team has not been notified yet. Call them, send the alert again, or tap again to close anyway.</p>}
        <button className="pt-btn pt-btn--line pt-alert-btn" onClick={p.onClose} data-first={p.phoneDialable ? undefined : ""}>{p.confirmClose ? "Close anyway" : "I’m okay"}</button>
      </div>
    </div>
  );
}
