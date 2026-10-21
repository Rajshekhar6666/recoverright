"use client";
import { useEffect, useState } from "react";
import { API } from "./api";
import type { ApiEvent } from "./types";

export type Conn = "connecting" | "open" | "retrying";

/** Every pipeline event of one run, in real time (Server-Sent Events), plus the connection state. */
export function useLiveRun(runId: string): { events: ApiEvent[]; conn: Conn } {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");
  useEffect(() => {
    setEvents([]);
    setConn("connecting");
    const seen = new Set<number>();
    const es = new EventSource(`${API}/runs/${runId}/events`);
    es.onopen = () => setConn("open");
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as ApiEvent;
        if (seen.has(ev.seq)) return;
        seen.add(ev.seq);
        setEvents((prev) => [...prev, ev].sort((a, b) => a.seq - b.seq));
        if (ev.type === "run.failed") es.close();
      } catch { /* ignore a malformed event */ }
    };
    es.onerror = () => setConn("retrying"); // the browser reconnects by itself
    return () => es.close();
  }, [runId]);
  return { events, conn };
}
