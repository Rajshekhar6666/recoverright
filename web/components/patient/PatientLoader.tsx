"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { demoPlan, planFromReview, type PlanView } from "@/lib/patient";
import PatientHome from "./PatientHome";

type State = { kind: "loading" } | { kind: "ready"; plan: PlanView } | { kind: "waiting" } | { kind: "missing" };

/** Until the secure-link step exists, the token is the run id. Only approved plans are shown, and the page waits for approval by itself. */
export default function PatientLoader({ token }: { token: string }) {
  const [s, setS] = useState<State>(token === "demo" ? { kind: "ready", plan: demoPlan } : { kind: "loading" });

  useEffect(() => {
    if (token === "demo") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => api.getReview(token)
      .then((d) => {
        if (!alive) return;
        if (d.run.approved) setS({ kind: "ready", plan: planFromReview(d) });
        else { setS({ kind: "waiting" }); timer = setTimeout(load, 3000); }
      })
      .catch(() => alive && setS({ kind: "missing" }));
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [token]);

  if (s.kind === "ready") return <PatientHome plan={s.plan} token={token} />;
  return (
    <div className="pt" style={{ display: "grid", placeItems: "center", padding: 24, gridTemplateColumns: "1fr" }}>
      <div className="pt-card" style={{ maxWidth: 420, textAlign: "center" }}>
        {s.kind === "loading" && <p>Loading your plan…</p>}
        {s.kind === "waiting" && <><h2>Your plan is not ready yet</h2><small>Your care team is still checking it. This page opens your plan by itself the moment it is approved.</small></>}
        {s.kind === "missing" && <><h2>We could not find this plan</h2><small>Check the link, or ask your care team to send it again.</small></>}
      </div>
    </div>
  );
}
