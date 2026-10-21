import type { HelpRequest } from "./types";

export type Phase = "sending" | "offline" | "sent" | "seen" | "calling" | "escalated" | "resolved";

/** What the patient should see, from what the care team has actually done. Nothing is shown that has not happened. */
export function derivePhase(r: HelpRequest): Phase {
  if (r.status === "resolved") return "resolved";
  if (r.status === "escalated") return "escalated";
  if (r.status === "acknowledged") return r.calls > 0 ? "calling" : "seen";
  return "sent";
}

export const isSimulated = (r: HelpRequest | null | undefined) =>
  !!r && [r.acknowledged_by, r.escalated_by, r.resolved_by].some((n) => /simulated/i.test(n ?? ""));

export function nurseName(r: HelpRequest | null | undefined): string {
  const n = (r?.acknowledged_by ?? "").trim();
  if (!n || /^care team$/i.test(n)) return "A member of the care team";
  return n;
}

export const SEND_TIMEOUT_MS = 7000;
export const retryDelay = (attempt: number) => Math.min(2000 * 2 ** Math.max(0, attempt - 1), 15000);
