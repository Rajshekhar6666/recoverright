"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PixelIcon, PixelText } from "@/components/live/Pixel";
import { api } from "@/lib/api";

/** Opens the newest run. If there is none yet, waits and jumps in as soon as one starts. Never a dead end: the simulated demo is always one click away. */
export default function LiveIndex() {
  const router = useRouter();
  const [state, setState] = useState<"looking" | "empty" | "down">("looking");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      try {
        const r = await api.listRuns();
        if (!alive) return;
        if (r.length) return router.replace(`/live/${r[0].run_id}`);
        setState("empty");
      } catch { if (alive) setState("down"); }
      if (alive) { setTries((n) => n + 1); timer = setTimeout(look, 2500); }
    };
    void look();
    return () => { alive = false; clearTimeout(timer); };
  }, [router]);
  const tone = state === "down" ? "#ff5d78" : "#2ee6ff";
  return (
    <div className="lt lt--center">
      <div className={`lt-boot${state === "down" ? " is-bad" : ""}`} role="status" aria-live="polite">
        <PixelIcon name={state === "down" ? "shield" : "doc"} scale={6} dim={state === "down"} />
        <PixelText text={state === "down" ? "NO SIGNAL" : state === "empty" ? "STANDBY" : "SCANNING"} px={4} color={tone} />
        <div className="lt-bar"><i /></div>
        <p>
          {state === "looking" && "Looking for a run…"}
          {state === "empty" && "No run yet. Upload a document in the care-team console and this page opens by itself."}
          {state === "down" && "Cannot reach the API. Is it running on port 8000? Retrying every few seconds."}
          {tries > 0 && <small style={{ display: "block", marginTop: 6 }}>checked {tries} time{tries === 1 ? "" : "s"}</small>}
        </p>
        <div className="lt-actions"><Link href="/live/demo" className="lt-btn is-demo">Open the simulated demo</Link><Link href="/staff" className="lt-btn">Care-team console</Link></div>
      </div>
    </div>
  );
}
