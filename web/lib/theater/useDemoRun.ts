"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_APPROVE_AFTER_MS, demoSchedule } from "./demo";
import type { Ev } from "./model";

/** Plays the SIMULATED demo run in real time. Only active when `enabled` (the /live/demo route). */
export function useDemoRun(enabled: boolean, speed = 1) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [approved, setApproved] = useState(false);
  const [round, setRound] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const restart = useCallback(() => setRound((r) => r + 1), []);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setEvents([]);
    setApproved(false);
    if (!enabled) return;
    const steps = demoSchedule();
    const start = Date.now();
    steps.forEach((s, i) => {
      timers.current.push(setTimeout(() => setEvents((prev) => [...prev, { seq: i + 1, ts: new Date(start + s.at / speed).toISOString(), type: s.type, payload: s.payload }]), s.at / speed));
    });
    const end = steps[steps.length - 1].at;
    timers.current.push(setTimeout(() => setApproved(true), (end + DEMO_APPROVE_AFTER_MS) / speed));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [enabled, speed, round]);

  return { events, approved, restart };
}
