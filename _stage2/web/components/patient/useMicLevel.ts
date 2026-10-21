"use client";
import { useEffect, useState } from "react";

/** A real loudness reading from the microphone (0 to 1), so the patient and the audience can SEE that it is hearing. */
export function useMicLevel(enabled: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    let raf = 0, stop = false, stream: MediaStream | null = null, ctx: AudioContext | null = null, last = 0;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } }).then((s) => {
      if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = (t: number) => {
        if (stop) return;
        if (t - last > 60) {
          last = t;
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => undefined);
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); void ctx?.close().catch(() => undefined); setLevel(0); };
  }, [enabled]);
  return level;
}
