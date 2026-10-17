"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import { Suspense, type ReactNode } from "react";
import { Icon } from "./icons";

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
  return (
    <MotionConfig reducedMotion="user">
      <div className="rr">
        <aside className="rr-side">
          <Link href="/staff" className="rr-brand">
            <span className="rr-brand-mark"><Icon.pulse size={18} /></span>
            <span>
              <b>RecoverRight</b>
              <small>Care team</small>
            </span>
          </Link>
          <Suspense fallback={<Nav path="" />}>
            <ActiveNav />
          </Suspense>
          <div className="rr-side-foot">
            <p>Prototype with fictional data only. Nothing here is medical advice.</p>
          </div>
        </aside>
        <main className="rr-main">{children}</main>
      </div>
    </MotionConfig>
  );
}
