"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Opens the newest run. If there is none yet, waits and jumps in as soon as one starts. */
export default function LiveIndex() {
  const router = useRouter();
  const [msg, setMsg] = useState("Looking for a run…");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      try {
        const r = await api.listRuns();
        if (!alive) return;
        if (r.length) return router.replace(`/live/${r[0].run_id}`);
        setMsg("Nothing to watch yet. Upload a document in the care-team console and this page opens by itself.");
      } catch { if (alive) setMsg("Cannot reach the API. Is it running on port 8000?"); }
      timer = setTimeout(look, 2500);
    };
    void look();
    return () => { alive = false; clearTimeout(timer); };
  }, [router]);
  return <div className="tt tt--empty"><div><b style={{ fontSize: 22 }}>RecoverRight live theater</b><p style={{ color: "#8da6d6", marginTop: 8 }}>{msg}</p></div></div>;
}
