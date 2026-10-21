"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { isSimulated, nurseName } from "@/lib/helpJourney";
import { EMERGENCY_NUMBER } from "@/lib/patientConfig";
import type { Journey } from "./useHelpJourney";

type StepState = "done" | "active" | "wait" | "bad";
function Step({ state, title, sub }: { state: StepState; title: string; sub?: string }) {
  return (
    <li className={`pt-step is-${state}`}>
      <i>{state === "done" ? <Icon.check size={16} /> : state === "bad" ? <Icon.x size={16} /> : state === "active" ? <span className="pt-spin" /> : null}</i>
      <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
    </li>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function HelpJourney({ j, phone, onRetry, onOkay, onClose }: {
  j: Journey; phone: string; onRetry: () => void; onOkay: () => void; onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [min, setMin] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { try { navigator.vibrate?.([300, 150, 300]); } catch { /* not supported */ } }, [j.clientId]);

  const waited = Math.max(0, Math.round((now - j.startedAt) / 1000));
  const r = j.request;
  const sim = isSimulated(r) || j.sim !== null;
  const phase = j.sim === "calling" ? "calling" : j.sim === "seen" ? "seen" : j.phase;
  const reached = !!r;
  const seen = ["seen", "calling", "escalated", "resolved"].includes(phase);
  const calling = phase === "calling" || (phase === "resolved" && (r?.calls ?? 0) > 0);
  const name = j.sim ? "Nurse Anita (simulated)" : nurseName(r);
  const slow = phase === "sent" && waited > (j.severity === "critical" ? 45 : 120);
  const showAlt = phase === "offline" || slow || more;
  const sms = phone ? `sms:${phone}?body=${encodeURIComponent(`I need help. ${j.heard === "button" ? "" : `I said: ${j.heard}`}`)}` : "";
  const tone = phase === "offline" ? "bad" : seen ? "good" : "red";

  if (min && phase !== "offline") {
    return (
      <button className={`pt-jbar is-${tone}`} onClick={() => setMin(false)} aria-label="Open the help request status">
        <Icon.alert size={18} />
        <span>{phase === "resolved" ? "The care team marked your request as handled" : seen ? `${name} has seen your request${calling ? " and is calling you" : ""}` : "Alert sent. Waiting for a nurse…"}</span>
        <em>Open</em>
      </button>
    );
  }

  return (
    <div className={`pt-alert is-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="pt-j-h">
      <div className="pt-j">
        <span className="pt-alert-ic"><Icon.alert size={36} /></span>
        <h2 id="pt-j-h">
          {phase === "offline" ? "We cannot reach your care team" : phase === "sending" ? "Alerting your care team…" : phase === "resolved" ? "Handled by your care team" : seen ? `${name} has seen your request` : "Your care team has been alerted"}
        </h2>
        {j.heard !== "button" && <p className="pt-j-heard">I heard: “{j.heard}”</p>}
        {sim && <p className="pt-simtag">SIMULATED NURSE · DEMO ONLY · no real person is responding</p>}
        {j.lostLink && phase !== "offline" && <p className="pt-j-warn">Connection lost. Still trying to reach the hospital…</p>}

        <ol className="pt-steps">
          <Step state={reached ? "done" : phase === "offline" ? "bad" : "active"} title={reached ? "Care team alerted" : phase === "offline" ? "Could not send the alert" : "Sending the alert"}
            sub={phase === "offline" ? `${j.error || "No answer from the hospital"}. Trying again automatically (attempt ${j.attempts + 1}).` : reached ? `Received at the hospital${waited ? ` ${mmss(waited)} ago` : ""}` : undefined} />
          <Step state={seen ? "done" : reached ? "active" : "wait"} title={seen ? `${name} has seen your request` : "Waiting for a nurse"}
            sub={!seen && reached ? `Waiting ${mmss(waited)}. Stay where you are.` : undefined} />
          <Step state={phase === "resolved" ? (calling ? "done" : "wait") : calling ? "active" : "wait"} title={calling ? "A nurse is calling you" : "Phone call"}
            sub={calling ? "Please answer your phone." : seen ? "The nurse may call you next." : undefined} />
          {phase === "escalated" && <Step state="active" title="An on-call clinician has been informed" sub="The care team passed your request up." />}
          {phase === "resolved" && <Step state="done" title={r?.resolution_label ?? "Handled"} sub={r?.resolved_by ? `By ${r.resolved_by}` : undefined} />}
        </ol>

        {showAlt && (
          <div className="pt-alt">
            <b>{phase === "offline" ? "Other ways to get help now" : "More ways to get help"}</b>
            {phase === "offline" && <button className="pt-btn pt-btn--solid" onClick={onRetry}><Icon.refresh size={18} /> Try again now</button>}
            {phone ? <a className="pt-btn pt-btn--light" href={`tel:${phone}`}><Icon.phone size={18} /> Call your care team</a> : <p className="pt-j-warn">No care-team number is on your plan.</p>}
            {sms && <a className="pt-btn pt-btn--light" href={sms}><Icon.chat size={18} /> Text your care team</a>}
            <a className="pt-btn pt-btn--emerg" href={`tel:${EMERGENCY_NUMBER}`}><Icon.siren size={18} /> Call emergency services ({EMERGENCY_NUMBER})</a>
          </div>
        )}
        {!showAlt && (
          <div className="pt-j-row">
            {phone && <a className="pt-btn pt-btn--light" href={`tel:${phone}`}><Icon.phone size={18} /> Call care team</a>}
            <button className="pt-btn pt-btn--ghost" onClick={() => setMore(true)}>More ways to get help</button>
          </div>
        )}

        <p className="pt-alert-sub">If this is an emergency, call {EMERGENCY_NUMBER} now. Sit down and stay where you are.</p>
        <div className="pt-j-row">
          {phase !== "resolved" && phase !== "offline" && <button className="pt-btn pt-btn--ghost" onClick={() => setMin(true)}>Minimise</button>}
          {phase !== "resolved" && phase !== "sending" && <button className="pt-btn pt-btn--ghost" onClick={() => { onOkay(); setMin(true); }}>I’m okay now</button>}
          {(phase === "resolved" || phase === "offline") && <button className="pt-btn pt-btn--ghost" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}
