"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, api } from "@/lib/api";
import { SEND_TIMEOUT_MS, derivePhase, retryDelay, type Phase } from "@/lib/helpJourney";
import type { HelpRequest, HelpSeverity, HelpSource } from "@/lib/types";

export interface Journey {
  clientId: string;
  phase: Phase;
  request: HelpRequest | null;
  severity: HelpSeverity;
  heard: string;
  startedAt: number;
  attempts: number;
  lostLink: boolean;
  error: string;
  /** a local, clearly labelled demo nurse (only when there is no hospital to answer) */
  sim: null | "seen" | "calling";
}

interface Opts { token: string; patientName: string; demo: boolean; pretendOffline: boolean; simulateNurse: boolean }

async function createHelp(body: Record<string, unknown>): Promise<{ id: string; item: HelpRequest }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/help`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error(`The hospital answered with an error (${res.status})`);
    return (await res.json()) as { id: string; item: HelpRequest };
  } finally { clearTimeout(t); }
}

/** Sends a help request, keeps retrying if the hospital cannot be reached (same client_id, so staff are never paged twice), and follows it until it is resolved. */
export function useHelpJourney(o: Opts) {
  const [j, setJ] = useState<Journey | null>(null);
  const cur = useRef<Journey | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  cur.current = j;

  const patch = useCallback((id: string, f: (j: Journey) => Journey) => setJ((p) => (p && p.clientId === id ? f(p) : p)), []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; if (poll.current) clearInterval(poll.current); poll.current = null; };

  const follow = useCallback((clientId: string, helpId: string) => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        if (opts.current.pretendOffline) throw new Error("offline (demo)");
        const r = await api.getHelp(helpId);
        patch(clientId, (p) => ({ ...p, request: r, phase: derivePhase(r), lostLink: false }));
        if (r.status === "resolved" && poll.current) { clearInterval(poll.current); poll.current = null; }
      } catch { patch(clientId, (p) => ({ ...p, lostLink: true })); }
    }, 2000);
  }, [patch]);

  const attempt = useCallback(async (clientId: string) => {
    const p = cur.current;
    if (!p || p.clientId !== clientId) return;
    const { token, patientName, demo, pretendOffline } = opts.current;
    try {
      if (pretendOffline) throw new Error("The hospital cannot be reached (demo: offline switch is on)");
      const res = await createHelp({ token, patient_name: patientName, heard: p.heard, severity: p.severity, label: p.severity === "critical" ? "Patient asked for help" : "Patient may be unwell", source: p.heard === "button" ? "button" : "voice", demo, client_id: clientId, client_time: new Date().toISOString() });
      patch(clientId, (x) => ({ ...x, request: res.item, phase: derivePhase(res.item), error: "", lostLink: false }));
      follow(clientId, res.id);
    } catch (e) {
      const n = (cur.current?.attempts ?? 0) + 1;
      patch(clientId, (x) => ({ ...x, phase: "offline", attempts: n, error: e instanceof Error && e.name !== "AbortError" ? e.message : "The hospital did not answer in time" }));
      timers.current.push(setTimeout(() => void attempt(clientId), retryDelay(n)));
    }
  }, [follow, patch]);

  const start = useCallback((heard: string, severity: HelpSeverity, source: HelpSource = "voice"): boolean => {
    const p = cur.current;
    if (p && p.phase !== "resolved" && !(p.severity === "concern" && severity === "critical")) return false; // one live request at a time; a worse one may replace a milder one
    clearTimers();
    const clientId = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const next: Journey = { clientId, phase: "sending", request: null, severity, heard: source === "button" ? "button" : heard, startedAt: Date.now(), attempts: 0, lostLink: false, error: "", sim: null };
    cur.current = next;
    setJ(next);
    void attempt(clientId);
    return true;
  }, [attempt]);

  const retry = useCallback(() => { const p = cur.current; if (p && !p.request) { clearTimers(); void attempt(p.clientId); } }, [attempt]);
  const note = useCallback(async (text: string) => {
    const r = cur.current?.request;
    if (r) { try { await api.helpAction(r.id, "note", "Patient", { note: text }); } catch { /* best effort */ } }
  }, []);
  const close = useCallback(() => { clearTimers(); setJ(null); }, []);

  // A clearly labelled demo nurse. With a hospital: it acts through the real inbox under the name "SIMULATED NURSE (demo)". Without one: only a local, labelled banner.
  useEffect(() => {
    if (!j || !o.simulateNurse || !o.demo || j.phase === "resolved") return;
    const id = j.clientId;
    const t: ReturnType<typeof setTimeout>[] = [];
    if (!j.request) {
      t.push(setTimeout(() => patch(id, (p) => (p.request ? p : { ...p, sim: "seen" })), 10000));
      t.push(setTimeout(() => patch(id, (p) => (p.request ? p : { ...p, sim: "calling" })), 20000));
    } else if (j.request.status === "open") {
      const hid = j.request.id;
      t.push(setTimeout(() => void api.helpAction(hid, "acknowledge", "SIMULATED NURSE (demo)", { note: "Simulated response: demo only" }).catch(() => undefined), 10000));
      t.push(setTimeout(() => void api.helpAction(hid, "call", "SIMULATED NURSE (demo)", { target: "patient", note: "Simulated call: demo only" }).catch(() => undefined), 20000));
    }
    return () => t.forEach(clearTimeout);
  }, [j?.clientId, j?.request?.id, j?.request?.status, j?.phase, o.simulateNurse, o.demo, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, []);
  return { journey: j, start, retry, note, close };
}
