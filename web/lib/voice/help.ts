/**
 * Sending a help alert to the care team.
 *
 * Rule: the UI may say "sent" ONLY when this function returns ok:true, which requires a real HTTP 2xx
 * response from the backend. Anything else (offline, timeout, 404, 500, network error) is a failure
 * and the UI must say that help has NOT been sent.
 *
 * Backend contract (NOT verified against your API, which was not in the ZIP; see README "Backend changes"):
 *   POST {API}{NEXT_PUBLIC_HELP_PATH || "/help"}   Content-Type: application/json
 *   body: HelpPayload     success: any 2xx
 */
export type HelpSource = "voice" | "button" | "test";

export interface HelpPayload {
  token: string;
  patient_name: string;
  heard: string;
  severity: "critical" | "concern";
  label: string;
  source: HelpSource;
  demo: boolean;
  client_time: string;
}

export type HelpStatus =
  | { kind: "idle" }
  | { kind: "sending"; attempt: number }
  | { kind: "sent"; at: number }
  | { kind: "failed"; reason: string; attempts: number };

export interface HelpConfig {
  base: string;
  path?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  isOnline?: () => boolean;
}

export type HelpResult = { ok: true; at: number } | { ok: false; reason: string };

export async function sendHelpRequest(payload: HelpPayload, cfg: HelpConfig): Promise<HelpResult> {
  if (cfg.isOnline && !cfg.isOnline()) return { ok: false, reason: "This device is offline." };
  const f = cfg.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!f) return { ok: false, reason: "Network requests are not available here." };
  const url = `${cfg.base.replace(/\/$/, "")}${cfg.path ?? "/help"}`;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), cfg.timeoutMs ?? 8000);
  try {
    const res = await f(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl?.signal });
    if (res.ok) return { ok: true, at: Date.now() };
    return { ok: false, reason: res.status === 404 ? "The hospital system has no help-request endpoint (404)." : `The hospital system answered with an error (${res.status}).` };
  } catch (e) {
    const aborted = (e as { name?: string } | null)?.name === "AbortError";
    return { ok: false, reason: aborted ? "The hospital system did not answer in time." : "Could not reach the hospital system." };
  } finally {
    clearTimeout(timer);
  }
}

/** A number is dialable if it has enough digits and is not a placeholder like +91 00000 00000. */
export function dialable(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 && !/0{7,}$/.test(digits); // "+91 00000 00000": real country code, placeholder number
}
