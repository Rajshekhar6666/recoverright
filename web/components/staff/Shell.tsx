"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { Suspense, createContext, useContext, useState, type ReactNode } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { HelpProvider, useHelp } from "@/lib/staffHelp";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { initials } from "@/lib/time";
import { Icon } from "./icons";
import HelpBanner from "./help/HelpBanner";

/** The top-bar search text, shared with whichever page wants to filter by it. */
const SearchCtx = createContext("");
export const useSearch = () => useContext(SearchCtx);

function Nav({ path }: { path: string }) {
  const hp = useHelp();
  const { t, lang } = useLanguage();
  const waiting = hp.summary?.unacked ?? 0;

  const NAV = [
    { href: "/staff", label: t.navPatients, icon: Icon.grid, active: (p: string) => p === "/staff" || p.startsWith("/staff/runs") || p.startsWith("/staff/patients") },
    { href: "/staff/upload", label: t.newDischarge, icon: Icon.upload, active: (p: string) => p.startsWith("/staff/upload") },
    { href: "/staff/help", label: t.navHelpInbox, icon: Icon.bell, active: (p: string) => p.startsWith("/staff/help"), badge: true },
  ];

  return (
    <nav className="rr-nav" aria-label="Main">
      {NAV.map((n, i) => (
        <Link key={`${n.href}-${i}`} href={n.href} className={`rr-nav-item${n.active(path) ? " is-active" : ""}`}>
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
  const { lang } = useLanguage();
  const ok = hp.conn === "ok";
  const label = ok
    ? (lang === "hi" ? "API ऑनलाइन" : "API online")
    : hp.conn === "connecting"
    ? (lang === "hi" ? "कनेक्ट हो रहा है…" : "Connecting…")
    : (lang === "hi" ? "API ऑफ़लाइन" : "API offline");

  return (
    <div className={`hx-conn is-${hp.conn}`} role="status" title={ok ? "Connected to the API" : hp.conn === "connecting" ? "Connecting…" : (hp.error ?? "Cannot reach the API")}>
      <i aria-hidden="true" />{label}
    </div>
  );
}

function User() {
  const hp = useHelp();
  const { lang } = useLanguage();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState("");
  return (
    <div className="cc-user">
      <span className="cc-avatar">{initials(hp.staffName)}</span>
      {edit ? (
        <form onSubmit={(e) => { e.preventDefault(); hp.setStaffName(v); setEdit(false); }} className="hx-name-form">
          <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Your name" placeholder="Your name" autoFocus maxLength={80} onBlur={() => setEdit(false)} />
          <small>{lang === "hi" ? "ऑडिट ट्रेल में दर्ज किया जाएगा" : "Recorded in the audit trail"}</small>
        </form>
      ) : (
        <button className="hx-name-btn" onClick={() => { setV(hp.staffName === "Care team" ? "" : hp.staffName); setEdit(true); }} title="Click to set your name. It is written into the audit trail of everything you do.">
          <b>{hp.staffName}</b><small>{lang === "hi" ? "नर्स समन्वयक" : "Nurse coordinator"}</small>
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

function ShellInner({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");
  const { t, lang } = useLanguage();

  return (
    <div className="rr">
      <aside className="rr-side">
        <Link href="/staff" className="rr-brand">
          <span className="rr-brand-mark">
            <img src="/logo.png" alt="RecoverRight" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain" }} />
          </span>
          <span>
            <b>RecoverRight</b>
            <small>{lang === "hi" ? "डिस्चार्ज से स्वास्थ्य लाभ तक" : "From discharge to recovery"}</small>
          </span>
        </Link>
        <Suspense fallback={<Nav path="" />}>
          <ActiveNav />
        </Suspense>
        <div className="hx-side-links">
          <small>{lang === "hi" ? "डेमो एवं प्रस्तुति" : "Present"}</small>
          <Link href="/live" target="_blank" rel="noreferrer"><Icon.pulse size={16} /> {t.navLiveTheater}<Icon.external size={13} /></Link>
          <Link href="/p/demo" target="_blank" rel="noreferrer"><Icon.phone size={16} /> {lang === "hi" ? "मरीज़ ऐप डेमो" : "Patient app demo"}<Icon.external size={13} /></Link>
        </div>
        <div className="rr-side-foot">
          <p>{lang === "hi" ? "काल्पनिक डेटा पर आधारित प्रोटोटाइप।" : "Prototype with fictional data only. Nothing here is medical advice."}</p>
        </div>
      </aside>
      <main className="rr-main">
        <Suspense fallback={null}><HelpBanner /></Suspense>
        <header className="cc-top">
          <label className="cc-search">
            <Icon.search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.navSearchPlaceholder} aria-label={t.navSearchPlaceholder} />
          </label>
          <div className="cc-top-right">
            <LanguageSwitcher />
            <Status />
            <SoundButton />
            <User />
          </div>
        </header>
        <SearchCtx.Provider value={q}>{children}</SearchCtx.Provider>
      </main>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <HelpProvider>
          <ShellInner>{children}</ShellInner>
        </HelpProvider>
      </LanguageProvider>
    </MotionConfig>
  );
}
