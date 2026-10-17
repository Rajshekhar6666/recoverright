"use client";
import { useEffect, useState } from "react";
import { API } from "./api";
import type { ApiEvent } from "./types";

/** Live pipeline events for one run (Server-Sent Events). The REST status stays the source of truth. */
export function useRunEvents(runId: string, active: boolean): ApiEvent[] {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  useEffect(() => {
    if (!active) return;
    const seen = new Set<number>();
    const es = new EventSource(`${API}/runs/${runId}/events`);
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as ApiEvent;
        if (seen.has(ev.seq)) return;
        seen.add(ev.seq);
        setEvents((prev) => [...prev, ev]);
        if (ev.type === "review.ready" || ev.type === "run.failed") es.close();
      } catch {
        /* ignore a malformed event */
      }
    };
    es.onerror = () => {
      /* the browser reconnects on its own */
    };
    return () => es.close();
  }, [runId, active]);
  return events;
}
