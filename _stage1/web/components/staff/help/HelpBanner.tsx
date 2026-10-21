"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/staff/icons";
import { useHelp } from "@/lib/staffHelp";
import { sla } from "@/lib/time";

/**
 * Sticky red bar on EVERY staff page while any patient is waiting for a nurse. It cannot be dismissed:
 * it goes away only when the request is acknowledged, so a request can never be missed by looking at another page.
 */
export default function HelpBanner() {
  const hp = useHelp();
  const path = usePathname() ?? "";
  const [busy, setBusy] = useState(false);
  const waiting = hp.items.filter((h) => h.status === "open");
  if (!waiting.length || path.startsWith("/staff/help")) return null;
  const top = waiting[0];
  const s = sla(top, hp.now);
  return (
    <div className={`hx-banner hx-banner--${top.severity}`} role="alert" key={`${hp.arrivals}`}>
      <span className="hx-banner-ic"><Icon.siren size={22} /></span>
      <div className="hx-banner-text">
        <b>{waiting.length === 1 ? "A patient is waiting for help" : `${waiting.length} patients are waiting for help`}</b>
        <span><strong>{top.patient_name}</strong> {top.source === "button" ? "pressed the help button" : `“${top.heard}”`} · {s.label}</span>
      </div>
      <div className="hx-banner-actions">
        <button className="rr-btn rr-btn--sm hx-banner-btn" disabled={busy} onClick={() => { setBusy(true); void hp.act(top.id, "acknowledge").catch(() => undefined).finally(() => setBusy(false)); }}>
          <Icon.check size={15} /> Acknowledge
        </button>
        <Link href={`/staff/help?open=${top.id}`} className="rr-btn rr-btn--sm hx-banner-btn hx-banner-btn--ghost">Open</Link>
      </div>
    </div>
  );
}
