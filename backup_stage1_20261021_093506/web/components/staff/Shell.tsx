"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { Suspense, createContext, useContext, useState, type ReactNode } from "react";
import { Icon } from "./icons";

/** The top-bar search text, shared with whichever page wants to filter by it. */
const SearchCtx = createContext("");
export const useSearch = () => useContext(SearchCtx);

const NAV = [
  { href: "/staff", label: "Dashboard", icon: Icon.grid, active: (p: string) => p === "/staff" || p.startsWith("/staff/runs") },
  { href: "/staff/upload", label: "New discharge", icon: Icon.upload, active: (p: string) => p.startsWith("/staff/upload") },
  { href: "/staff/help", label: "Help requests", icon: Icon.bell, active: (p: string) => p.startsWith("/staff/help") },
];

function Nav({ path }: { path: string }) {
  return (
    <nav className="rr-nav" aria-label="Main">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`rr-nav-item${n.active(path) ? " is-active" : ""}`}>
          <n.icon size={18} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** usePathname needs a Suspense boundary in production builds on dynamic routes. */
function ActiveNav() {
  return <Nav path={usePathname() ?? ""} />;
}

export default function Shell({ children }: { children: ReactNode }) {
  const [q, setQ] = useState("");
  return (
    <MotionConfig reducedMotion="user">
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
          <div className="rr-side-foot">
            <p>Prototype with fictional data only. Nothing here is medical advice.</p>
          </div>
        </aside>
        <main className="rr-main">
          <header className="cc-top">
            <label className="cc-search">
              <Icon.search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patients or documents" aria-label="Search patients or documents" />
            </label>
            <div className="cc-top-right">
              <div className="cc-user">
                <span className="cc-avatar">CT</span>
                <div><b>Care team</b><small>Nurse coordinator</small></div>
              </div>
            </div>
          </header>
          <SearchCtx.Provider value={q}>{children}</SearchCtx.Provider>
        </main>
      </div>
    </MotionConfig>
  );
}
