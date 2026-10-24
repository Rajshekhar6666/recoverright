import type { RunStatus } from "@/lib/types";

const MAP: Record<string, { label: string; tone: string; live?: boolean }> = {
  queued: { label: "Queued", tone: "mute", live: true },
  processing: { label: "Processing", tone: "info", live: true },
  needs_review: { label: "Needs review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  reapproved: { label: "Approved (revised)", tone: "ok" },
  unlocked_for_revision: { label: "Revision", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
};

export default function RunPill({ status }: { status?: RunStatus | string | null }) {
  const key = status ? String(status).toLowerCase() : "";
  const m = MAP[key] || {
    label: key ? key.replace(/_/g, " ") : "Draft",
    tone: key === "approved" || key === "reapproved" ? "ok" : "mute",
  };
  return (
    <span className={`rr-pill rr-pill--${m.tone}`}>
      <i className={`rr-dot${m.live ? " is-live" : ""}`} />
      {m.label}
    </span>
  );
}
