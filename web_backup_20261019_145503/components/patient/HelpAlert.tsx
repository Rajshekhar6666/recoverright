"use client";
import { useEffect } from "react";
import { Icon } from "@/components/staff/icons";

export default function HelpAlert({ heard, phone, onClose }: { heard: string; phone: string; onClose: () => void }) {
  useEffect(() => { try { navigator.vibrate?.([300, 150, 300, 150, 300]); } catch { /* not supported */ } }, []);
  return (
    <div className="pt-alert" role="alertdialog" aria-modal="true" aria-labelledby="pt-alert-h">
      <div>
        <span className="pt-alert-ic"><Icon.alert size={40} /></span>
        <h2 id="pt-alert-h">Are you feeling unwell?</h2>
        <p>I heard: “{heard}”</p>
        {phone ? <a className="pt-btn pt-btn--red pt-alert-btn" href={`tel:${phone}`}><Icon.phone size={22} /> Call my care team</a>
          : <p className="pt-alert-warn">No care-team number is on this plan.</p>}
        <p className="pt-alert-sub">If this is an emergency, call your local emergency number now. Sit down and stay where you are.</p>
        <button className="pt-btn pt-btn--line pt-alert-btn" onClick={onClose}>I’m okay</button>
      </div>
    </div>
  );
}
