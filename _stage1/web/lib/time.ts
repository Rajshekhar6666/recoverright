/** Small time helpers for the care-team console. All inputs are ISO strings from the API (UTC). */
import type { HelpRequest } from "./types";

export const ms = (iso?: string | null): number => (iso ? new Date(iso).getTime() : NaN);

export function mmss(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "just now", "42 s", "5 min", "3 h", "2 d": short and scannable. */
export function age(totalMs: number): string {
  const s = Math.max(0, Math.floor(totalMs / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export function clockTime(iso?: string | null): string {
  const t = ms(iso);
  return isFinite(t) ? new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
}

export function dayTime(iso?: string | null): string {
  const t = ms(iso);
  if (!isFinite(t)) return "";
  const d = new Date(t), today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? clockTime(iso) : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${clockTime(iso)}`;
}

export type SlaTone = "ok" | "warn" | "bad" | "done";
export interface Sla { tone: SlaTone; label: string; ratio: number; elapsedMs: number; overdue: boolean }

/**
 * Response-time state of a request. While nobody has acknowledged it: a countdown to the target
 * (green below half, amber to the target, red once overdue). After that: how long the response took.
 */
export function sla(h: HelpRequest, nowMs: number): Sla {
  const created = ms(h.created_at), target = h.sla_seconds * 1000;
  if (h.acknowledged_at) {
    const took = Math.max(0, ms(h.acknowledged_at) - created);
    return { tone: "done", label: `answered in ${mmss(took)}`, ratio: Math.min(1, took / target), elapsedMs: took, overdue: took > target };
  }
  const elapsed = Math.max(0, nowMs - created), ratio = elapsed / target;
  const overdue = ratio >= 1;
  return {
    tone: overdue ? "bad" : ratio >= 0.5 ? "warn" : "ok",
    label: overdue ? `overdue by ${mmss(elapsed - target)}` : `waiting ${mmss(elapsed)} · target ${mmss(target)}`,
    ratio: Math.min(1.5, ratio), elapsedMs: elapsed, overdue,
  };
}

export const initials = (n: string): string => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

/** A number is callable if it has enough digits and is not a placeholder such as +91 00000 00000. */
export function dialable(phone?: string | null): boolean {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 6 && !/0{7,}$/.test(d);
}
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, "")}`;
