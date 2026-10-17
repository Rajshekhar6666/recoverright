"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { dur } from "@/lib/motion";
import { timeAgo } from "@/lib/review";
import type { RunMeta } from "@/lib/types";
import RunPill from "./RunPill";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export default function StatusTable({ runs }: { runs: RunMeta[] }) {
  const router = useRouter();
  const open = (id: string) => router.push(`/staff/runs/${id}/review`);
  return (
    <div className="rr-table-wrap">
      <table className="rr-table">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Document</th>
            <th>Status</th>
            <th>Checks</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <motion.tr
              key={r.run_id}
              className="rr-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.03, duration: dur.base }}
              tabIndex={0}
              onClick={() => open(r.run_id)}
              onKeyDown={(e) => e.key === "Enter" && open(r.run_id)}
            >
              <td>
                <span className="rr-pt">
                  <span className="cc-avatar cc-avatar--sm">{initials(r.patient.name)}</span>
                  <span><b>{r.patient.name}</b><small>{r.patient.language.toUpperCase()}</small></span>
                </span>
              </td>
              <td className="rr-mute">{r.filename}</td>
              <td><RunPill status={r.status} /></td>
              <td>
                {r.counts ? (
                  <span className="rr-counts">
                    <span className="rr-chip rr-chip--ok">{r.counts.agreed} agreed</span>
                    {r.counts.review + r.counts.conflict + r.counts.rejected > 0 && (
                      <span className="rr-chip rr-chip--warn">
                        {r.counts.review + r.counts.conflict + r.counts.rejected} to check
                      </span>
                    )}
                  </span>
                ) : r.status === "failed" ? (
                  <span className="rr-mute">{r.error?.slice(0, 40)}</span>
                ) : (
                  <span className="rr-mute">Working</span>
                )}
              </td>
              <td className="rr-mute">{timeAgo(r.created_at)}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
