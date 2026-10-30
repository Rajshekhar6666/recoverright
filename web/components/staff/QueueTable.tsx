"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/review";
import { initials } from "@/lib/time";
import type { RunMeta } from "@/lib/types";
import { Icon } from "./icons";
import RunPill from "./RunPill";

export interface RunHelp { active: number; critical: number }

/** The dashboard work queue: one row per discharge plan, with the quick actions a nurse reaches for. */
export default function QueueTable({ runs, help }: { runs: RunMeta[]; help: Record<string, RunHelp> }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const open = (id: string) => router.push(`/staff/runs/${id}/review`);

  const handleDelete = async (e: React.MouseEvent, runId: string, name: string) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to delete the record for ${name || "this patient"}?`);
    if (!confirmed) return;
    setDeletingId(runId);
    try {
      await api.deletePatient(runId);
      window.location.reload();
    } catch {
      alert("Failed to delete record.");
    } finally {
      setDeletingId(null);
    }
  };
  return (
    <div className="rr-table-wrap">
      <table className="rr-table hx-queue">
        <thead>
          <tr><th>Patient</th><th>Status</th><th>Checks</th><th>Help</th><th>Created</th><th><span className="hx-sr">Actions</span></th></tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const h = help[r.run_id];
            const toCheck = r.counts ? r.counts.review + r.counts.conflict + r.counts.rejected : 0;
            return (
              <tr key={r.run_id} className="rr-row" tabIndex={0} onClick={() => open(r.run_id)} onKeyDown={(e) => e.key === "Enter" && open(r.run_id)}>
                <td>
                  <span className="rr-pt">
                    <span className="cc-avatar cc-avatar--sm">{initials(r.patient?.name || "P")}</span>
                    <span><b>{r.patient?.name || "Patient"}</b><small>{(r.patient?.language || "en").toUpperCase()} · {r.filename}</small></span>
                  </span>
                </td>
                <td><RunPill status={r.status} /></td>
                <td>
                  {r.counts ? (
                    <span className="rr-counts">
                      <span className="rr-chip rr-chip--ok">{r.counts.agreed} agreed</span>
                      {toCheck > 0 && <span className="rr-chip rr-chip--warn">{toCheck} to check</span>}
                    </span>
                  ) : r.status === "failed" ? <span className="rr-mute">{r.error?.slice(0, 40)}</span> : <span className="rr-mute">Working</span>}
                </td>
                <td>{h?.active ? <span className={`hx-help-chip${h.critical ? " is-critical" : ""}`}><Icon.bell size={13} />{h.active} open</span> : <span className="rr-mute">–</span>}</td>
                <td className="rr-mute">{timeAgo(r.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <span className="hx-rowtools">
                    <Link href={`/staff/patients/${r.run_id}`} title="Patient record" aria-label={`Patient record for ${r.patient?.name || "Patient"}`}><Icon.user size={16} /></Link>
                    <Link href={`/live/${r.run_id}`} target="_blank" title="Watch in the live theater" aria-label={`Live theater for ${r.patient?.name || "Patient"}`}><Icon.pulse size={16} /></Link>
                      <button
                        type="button"
                        disabled={deletingId === r.run_id}
                        onClick={(e) => handleDelete(e, r.run_id, r.patient?.name || "")}
                        title={`Delete record: ${r.patient?.name || "Patient"}`}
                        aria-label={`Delete ${r.patient?.name || "Patient"}`}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "3px 4px",
                          cursor: deletingId === r.run_id ? "not-allowed" : "pointer",
                          color: "#dc2626",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 4,
                          transition: "background 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        {deletingId === r.run_id ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>…</span>
                        ) : (
                          <Icon.trash size={15} />
                        )}
                      </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
