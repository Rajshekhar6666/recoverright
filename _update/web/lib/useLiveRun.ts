"use client";
import { useEffect, useState } from "react";
import { API } from "./api";
import type { ApiEvent } from "./types";

export type Conn = "connecting" | "open" | "retrying" | "closed";

/**
 * Every pipeline event of one run, in real time (Server-Sent Events), plus the connection state.
 * Extended (backward compatible): also reports when the last event arrived and how many times the stream
 * had to reconnect, and can be switched off (`enabled=false`) for the simulated demo.
 */
export function useLiveRun(runId: string, enabled = true): { events: ApiEvent[]; conn: Conn; lastEventAt: number; reconnects: number } {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");
  const [lastEventAt, setLastEventAt] = useState(0);
  const [reconnects, setReconnects] = useState(0);
  useEffect(() => {
    setEvents([]);
    setLastEventAt(0);
    setReconnects(0);
    if (!enabled) { setConn("closed"); return; }
    setConn("connecting");
    const seen = new Set<number>();
    const es = new EventSource(`${API}/runs/${runId}/events`);
    es.onopen = () => setConn("open");
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as ApiEvent;
        if (seen.has(ev.seq)) return;
        seen.add(ev.seq);
        setLastEventAt(Date.now());
        setEvents((prev) => [...prev, ev].sort((a, b) => a.seq - b.seq));
        if (ev.type === "run.failed") { es.close(); setConn("closed"); }
      } catch { /* ignore a malformed event */ }
    };
    es.onerror = () => {
      if (es.readyState === 2) setConn("closed");      // the browser gave up (e.g. the run does not exist)
      else { setConn("retrying"); setReconnects((n) => n + 1); } // the browser reconnects by itself
    };
    return () => es.close();
  }, [runId, enabled]);
  return { events, conn, lastEventAt, reconnects };
}
