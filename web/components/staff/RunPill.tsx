import type { RunStatus } from "@/lib/types";

const MAP: Record<RunStatus, { label: string; tone: string; live?: boolean }> = {
  queued: { label: "Queued", tone: "mute", live: true },
  processing: { label: "Processing", tone: "info", live: true },
  needs_review: { label: "Needs review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

export default function RunPill({ status }: { status: RunStatus }) {
  const m = MAP[status];
  return (
    <span className={`rr-pill rr-pill--${m.tone}`}>
      <i className={`rr-dot${m.live ? " is-live" : ""}`} />
      {m.label}
    </span>
  );
}
