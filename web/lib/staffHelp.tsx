"use client";
/**
 * Live help-request state for the whole care-team console (one poll, shared by the banner, the dashboard and the inbox).
 *  - polls /help every 2.5 s (10 s when the tab is hidden), and backs off when the API is down;
 *  - measures the client/server clock offset, so response-time countdowns are right even if the clocks differ;
 *  - notices NEW open requests (not the ones that were already there on first load) and can play an alert sound;
 *  - remembers the staff member's name (written into the audit trail of every action).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { ms } from "@/lib/time";
import type { HelpActionName, HelpRequest, HelpSummary } from "@/lib/types";
import { playAlarm, unlockAudio } from "@/lib/voice/speak";

export type HelpConn = "connecting" | "ok" | "down";
interface Ctx {
  items: HelpRequest[];
  summary: HelpSummary | null;
  resolutions: Record<string, string>;
  conn: HelpConn;
  error: string | null;
  /** Server time in ms, ticking every second (corrected for clock offset). */
  now: number;
  /** Increments each time a brand-new open request arrives (drives the banner flash). */
  arrivals: number;
  staffName: string;
  setStaffName: (n: string) => void;
  soundOn: boolean;
  soundBlocked: boolean;
  toggleSound: () => Promise<void>;
  refresh: () => Promise<void>;
  act: (id: string, action: HelpActionName, extra?: { note?: string; resolution?: string; target?: "patient" | "guardian" }) => Promise<HelpRequest>;
}

const HelpCtx = createContext<Ctx | null>(null);
export const useHelp = (): Ctx => {
  const c = useContext(HelpCtx);
  if (!c) throw new Error("useHelp must be used inside <HelpProvider>");
  return c;
};

const NAME_KEY = "rr-staff-name", SOUND_KEY = "rr-staff-sound";

export function HelpProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<HelpRequest[]>([]);
  const [summary, setSummary] = useState<HelpSummary | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [conn, setConn] = useState<HelpConn>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [arrivals, setArrivals] = useState(0);
  const [staffName, setName] = useState("Care team");
  const [soundOn, setSoundOn] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const soundRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    try {
      // Hydrate browser-only preferences after mount to keep server and initial client renders identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(localStorage.getItem(NAME_KEY) || "Care team");
      const s = localStorage.getItem(SOUND_KEY) === "1";
      setSoundOn(s);
      soundRef.current = s;
    } catch { /* storage blocked */ }
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), 1000);
    const unlock = () => { unlockAudio(); setSoundBlocked(false); };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => { clearInterval(id); window.removeEventListener("pointerdown", unlock); };
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await api.listHelp("all", true);
      if (!alive.current) return;
      setItems(r.items); setSummary(r.summary); setResolutions(r.resolutions);
      const off = ms(r.summary.server_time) - Date.now();
      if (isFinite(off)) setOffset(off);
      setConn("ok"); setError(null);
      // arrivals: open requests we have not seen before (the first load only seeds the set)
      const open = r.items.filter((i) => i.status === "open");
      if (seen.current === null) seen.current = new Set(r.items.map((i) => i.id));
      else {
        const fresh = open.filter((i) => !seen.current!.has(i.id));
        r.items.forEach((i) => seen.current!.add(i.id));
        if (fresh.length) {
          setArrivals((n) => n + fresh.length);
          if (soundRef.current) void playAlarm(fresh.some((f) => f.severity === "critical") ? "critical" : "concern").then((ok) => setSoundBlocked(!ok));
        }
      }
    } catch (e) {
      if (!alive.current) return;
      setConn("down");
      setError(e instanceof Error ? e.message : "Cannot reach the API.");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const loop = async () => {
      await load();
      if (!alive.current) return;
      timer.current = setTimeout(loop, document.visibilityState === "hidden" ? 10000 : 2500);
    };
    void loop();
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer.current); void loop(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { alive.current = false; clearTimeout(timer.current); document.removeEventListener("visibilitychange", wake); };
  }, [load]);

  const setStaffName = useCallback((n: string) => {
    const v = n.trim().slice(0, 80) || "Care team";
    setName(v);
    try { localStorage.setItem(NAME_KEY, v); } catch { /* ignore */ }
  }, []);

  const toggleSound = useCallback(async () => {
    const next = !soundRef.current;
    soundRef.current = next; setSoundOn(next);
    try { localStorage.setItem(SOUND_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    if (next) { unlockAudio(); setSoundBlocked(!(await playAlarm("concern"))); } else setSoundBlocked(false);
  }, []);

  const act: Ctx["act"] = useCallback(async (id, action, extra = {}) => {
    const updated = await api.helpAction(id, action, staffName, extra);
    setItems((cur) => cur.map((i) => (i.id === id ? updated : i)));
    void load(); // pull fresh ordering and summary numbers
    return updated;
  }, [staffName, load]);

  const value = useMemo<Ctx>(() => ({
    items, summary, resolutions, conn, error, now: tick + offset, arrivals, staffName, setStaffName, soundOn, soundBlocked, toggleSound, refresh: load, act,
  }), [items, summary, resolutions, conn, error, tick, offset, arrivals, staffName, setStaffName, soundOn, soundBlocked, toggleSound, load, act]);

  return <HelpCtx.Provider value={value}>{children}</HelpCtx.Provider>;
}
