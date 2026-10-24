"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LanguageProvider } from "@/lib/i18n";
import { demoPlan, planFromApprovedPlan, type PlanView } from "@/lib/patient";
import PatientHome from "./PatientHome";

type State =
  | { kind: "loading" }
  | { kind: "ready"; plan: PlanView }
  | { kind: "waiting" }
  | { kind: "missing" }
  | { kind: "offline"; retry: () => void };

/**
 * Loads the authorized, approved recovery plan for a patient token.
 * 
 * Safety invariants:
 * 1. Uses the safe patient endpoint GET /plans/{token} exclusively.
 * 2. Unapproved plans return 403; page automatically polls until clinical approval.
 * 3. Never leaks unverified model extractions or staff review blockers to patients.
 * 4. Caches approved plans to localStorage for resilient offline access.
 */
export default function PatientLoader({ token }: { token: string }) {
  return (
    <LanguageProvider>
      <PatientLoaderInner token={token} />
    </LanguageProvider>
  );
}

function PatientLoaderInner({ token }: { token: string }) {
  const [s, setS] = useState<State>(token === "demo" ? { kind: "ready", plan: demoPlan } : { kind: "loading" });

  useEffect(() => {
    if (token === "demo") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const load = () => {
      api.getPatientPlan(token)
        .then((res) => {
          if (!alive) return;
          const plan = planFromApprovedPlan(res);
          try {
            localStorage.setItem(`rr-pt-plan-${token}`, JSON.stringify(plan));
          } catch {
            /* ignore local storage failure */
          }
          setS({ kind: "ready", plan });
        })
        .catch((err: any) => {
          if (!alive) return;
          const status = err?.status;

          // 403: Plan exists but is pending clinical staff approval
          if (status === 403) {
            setS({ kind: "waiting" });
            timer = setTimeout(load, 3000);
            return;
          }

          // 404: Unknown or expired patient token
          if (status === 404) {
            setS({ kind: "missing" });
            return;
          }

          // Offline or network error: check for cached approved plan
          try {
            const cached = localStorage.getItem(`rr-pt-plan-${token}`);
            if (cached) {
              const parsed = JSON.parse(cached) as PlanView;
              setS({ kind: "ready", plan: parsed });
              return;
            }
          } catch {
            /* ignore cache parse failure */
          }

          setS({
            kind: "offline",
            retry: () => {
              setS({ kind: "loading" });
              load();
            },
          });
        });
    };

    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token]);

  if (s.kind === "ready") return <PatientHome plan={s.plan} token={token} />;

  return (
    <div className="pt" style={{ display: "grid", placeItems: "center", padding: 24, gridTemplateColumns: "1fr" }}>
      <div className="pt-card" style={{ maxWidth: 460, textAlign: "center", padding: "32px 24px" }}>
        {s.kind === "loading" && (
          <div>
            <div className="pt-spin" style={{ width: 32, height: 32, margin: "0 auto 16px", borderColor: "var(--line)", borderTopColor: "var(--pt)" }} />
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Loading your recovery plan…</h2>
            <small>Fetching your personalized instructions.</small>
          </div>
        )}

        {s.kind === "waiting" && (
          <div>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fff0d1", color: "#b86e00", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 24 }}>
              ⏳
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: "#12323a" }}>Your plan is being checked by clinical staff</h2>
            <p style={{ fontSize: 14, color: "#5f7a80", margin: "0 0 16px" }}>
              Your care team is actively reviewing your discharge instructions to verify every medication and guideline. This page will update automatically as soon as it is approved.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 99, background: "#f4f8f8", color: "#5f7a80", fontSize: 13 }}>
              <span className="pt-dotpulse" style={{ background: "var(--pt)" }} />
              Checking for approval…
            </div>
          </div>
        )}

        {s.kind === "missing" && (
          <div>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fde3e1", color: "#c8382d", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 24 }}>
              ✕
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: "#12323a" }}>We could not find this recovery plan</h2>
            <small style={{ fontSize: 14 }}>
              Please check your link, or ask your hospital care coordinator to send a new invitation link.
            </small>
          </div>
        )}

        {s.kind === "offline" && (
          <div>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#ebe5fb", color: "#6d4fc7", display: "grid", placeItems: "center", margin: "0 auto 16px", fontSize: 24 }}>
              ⚡
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: "#12323a" }}>Unable to reach the server</h2>
            <p style={{ fontSize: 14, color: "#5f7a80", margin: "0 0 16px" }}>
              Please check your internet connection and try again.
            </p>
            <button className="pt-btn pt-btn--solid" onClick={s.retry} style={{ width: "auto", margin: "0 auto" }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
