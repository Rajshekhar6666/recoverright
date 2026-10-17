"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function LiveIndex() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    api.listRuns()
      .then((r) => (r.length ? router.replace(`/live/${r[0].run_id}`) : setEmpty(true)))
      .catch(() => setEmpty(true));
  }, [router]);
  return (
    <div className="rr-page">
      {empty ? (
        <div className="rr-card rr-empty">
          <b>Nothing to watch yet</b>
          <small>Upload a discharge document and its processing shows up here.</small>
          <Link href="/staff/upload" className="rr-btn rr-btn--primary">New discharge</Link>
        </div>
      ) : <div className="rr-skel" style={{ height: 160 }} />}
    </div>
  );
}
