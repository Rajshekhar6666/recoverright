"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { Suspense, createContext, useContext, useState, type ReactNode } from "react";
import { HelpProvider, useHelp } from "@/lib/staffHelp";
import { initials } from "@/lib/time";
import { Icon } from "./icons";
import HelpBanner from "./help/HelpBanner";

/** The top-bar search text, shared with whichever page wants to filter by it. */
const SearchCtx = createContext("");
export const useSearch = () => useContext(SearchCtx);

const NAV = [
  { href: "/staff", label: "Dashboard", icon: Icon.grid, active: (p: string) => p === "/staff" || p.startsWith("/staff/runs") },
  { href: "/staff/upload", label: "New discharge", icon: Icon.upload, active: (p: string) => p.startsWith("/staff/upload") },
  { href: "/staff/patients", label: "Patients", icon: Icon.users, active: (p: string) => p.startsWith("/staff/patients") },
  { href: "/staff/help", label: "Help requests", icon: Icon.bell, active: (p: string) => p.startsWith("/staff/help"), badge: true },
];

function Nav({ path }: { path: string }) {
  const hp = useHelp();
  const waiting = hp.summary?.unacked ?? 0;
  return (
    <nav className="rr-nav" aria-label="Main">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`rr-nav-item${n.active(path) ? " is-active" : ""}`}>
          <n.icon size={18} />
          {n.label}
          {n.badge && waiting > 0 && <span className={`hx-nav-badge${hp.summary?.critical_unacked ? " is-critical" : ""}`} aria-label={`${waiting} waiting`}>{waiting}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** usePathname needs a Suspense boundary in production builds on dynamic routes. */
function ActiveNav() {
  return <Nav path={usePathname() ?? ""} />;
}

function Status() {
  const hp = useHelp();
  const ok = hp.conn === "ok";
  return (
    <div className={`hx-conn is-${hp.conn}`} role="status" title={ok ? "Connected to the API" : hp.conn === "connecting" ? "Connecting…" : (hp.error ?? "Cannot reach the API")}>
      <i aria-hidden="true" />{ok ? "API online" : hp.conn === "connecting" ? "Connecting" : "API offline"}
    </div>
  );
}

function User() {
  const hp = useHelp();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  return (
    <div className="cc-user">
      <span className="cc-avatar">{initials(hp.staffName)}</span>
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); hp.setStaffName(v); setEdit(false); }} className="hx-name-form">
          <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Your name" placeholder="Your name" autoFocus maxLength={80} onBlur={() => setEdit(false)} />
          <small>Recorded in the audit trail</small>
        </form>
      ) : (
        <button className="hx-name-btn" onClick={() => { setV(hp.staffName === "Care team" ? "" : hp.staffName); setEdit(true); }} title="Click to set your name. It is written into the audit trail of everything you do.">
          <b>{hp.staffName}</b><small>Nurse coordinator · edit</small>
        </button>
      )}
    </div>
  );
}

function SoundButton() {
  const hp = useHelp();
  return (
    <button className={`hx-icon-btn${hp.soundOn ? " is-on" : ""}`} onClick={() => void hp.toggleSound()} aria-pressed={hp.soundOn} title={hp.soundOn ? "Alert sound is on" : "Turn on the alert sound for new help requests"}>
      {hp.soundOn ? <Icon.volume size={18} /> : <Icon.volumeOff size={18} />}
      <span className="hx-sr">Alert sound {hp.soundOn ? "on" : "off"}</span>
    </button>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");
  return (
    <MotionConfig reducedMotion="user">
      <HelpProvider>
        <div className="rr">
          <aside className="rr-side">
            <Link href="/staff" className="rr-brand">
              <span className="rr-brand-mark"><Icon.heart size={19} /></span>
              <span>
                <b>RecoverRight</b>
                <small>From discharge to recovery</small>
              </span>
            </Link>
            <Suspense fallback={<Nav path="" />}>
              <ActiveNav />
            </Suspense>
            <div className="hx-side-links">
              <small>Present</small>
              <Link href="/live" target="_blank" rel="noreferrer"><Icon.pulse size={16} /> Live theater<Icon.external size={13} /></Link>
              <Link href="/p/demo" target="_blank" rel="noreferrer"><Icon.phone size={16} /> Patient app demo<Icon.external size={13} /></Link>
            </div>
            <div className="rr-side-foot">
              <p>Prototype with fictional data only. Nothing here is medical advice.</p>
            </div>
          </aside>
          <main className="rr-main">
            <Suspense fallback={null}><HelpBanner /></Suspense>
            <header className="cc-top">
              <label className="cc-search">
                <Icon.search size={17} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients, documents or requests" aria-label="Search patients, documents or requests" />
              </label>
              <div className="cc-top-right">
                <Status />
                <SoundButton />
                <User />
              </div>
            </header>
            <SearchCtx.Provider value={q}>{children}</SearchCtx.Provider>
          </main>
        </div>
      </HelpProvider>
    </MotionConfig>
  );
}
