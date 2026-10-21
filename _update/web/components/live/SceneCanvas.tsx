"use client";
import { useEffect, useRef, useState } from "react";
import { COLORS, approvalEffects, effectsFor, type Effect, type Ev, type NodeKey, type NodeState } from "@/lib/theater/model";
import { NODE_POS, SCENE_H, SCENE_W, TheaterScene } from "@/lib/theater/scene";

export interface NodeLabel { title: string; sub: string; state: NodeState }
interface Props {
  nodes: Record<NodeKey, NodeState>;
  events: Ev[];
  approved: boolean;
  reduced: boolean;
  labels: Record<NodeKey, NodeLabel>;
  /** A short description of what the scene currently shows, for screen readers. */
  summary: string;
  /** Presentation mode: the scene must fit the available height as well as the width. */
  fitHeight?: boolean;
  onNewEvent?: (e: Ev) => void;
}

const JUMP = 40; // more than this many new events at once = a replay jump or first load: set state, do not fire 100 effects

/**
 * Hosts the pixel scene. It spawns effects ONLY for events that are new since the last render,
 * never for a state it merely loaded, and resets cleanly when a replay scrubs backwards.
 */
export default function SceneCanvas({ nodes, events, approved, reduced, labels, summary, fitHeight, onNewEvent }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TheaterScene | null>(null);
  const queue = useRef<Effect[][]>([]);
  const lastSeq = useRef(-1);
  const lastLen = useRef(0);
  const wasApproved = useRef(false);
  const dirty = useRef(true);
  const cb = useRef(onNewEvent); cb.current = onNewEvent;
  const [size, setSize] = useState({ w: SCENE_W * 2, h: SCENE_H * 2 });

  if (!scene.current) scene.current = new TheaterScene(reduced);

  // size: integer multiples of the internal resolution keep every pixel square and crisp
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const w = (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || SCENE_W;
      const hAvail = fitHeight ? el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) : Infinity;
      const ratio = Math.min(w / SCENE_W, hAvail / SCENE_H); // how many times the internal resolution fits
      const k = ratio >= 2 ? Math.floor(ratio) : 0;
      setSize(k ? { w: SCENE_W * k, h: SCENE_H * k } : { w: Math.max(160, Math.floor(SCENE_W * ratio)), h: Math.max(90, Math.floor(SCENE_H * ratio)) });
      dirty.current = true;
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el); window.addEventListener("resize", fit);
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, [fitHeight]);

  useEffect(() => { if (scene.current) scene.current.reduced = reduced; dirty.current = true; }, [reduced]);
  useEffect(() => { scene.current?.setNodes(nodes); dirty.current = true; }, [nodes]);

  // events -> effects (only the new ones)
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const last = events.length ? events[events.length - 1].seq : -1;
    const rewound = events.length < lastLen.current || (events.length > 0 && last < lastSeq.current);
    if (rewound) { s.reset(); queue.current = []; }
    const fresh = events.filter((e) => e.seq > (rewound ? -1 : lastSeq.current));
    if (rewound || fresh.length > JUMP) { /* load state silently */ }
    else for (const e of fresh) { queue.current.push(effectsFor(e)); cb.current?.(e); }
    lastSeq.current = last; lastLen.current = events.length; dirty.current = true;
  }, [events]);

  useEffect(() => {
    if (approved && !wasApproved.current) queue.current.push(approvalEffects());
    wasApproved.current = approved; dirty.current = true;
  }, [approved]);

  // render loop
  useEffect(() => {
    const c = canvas.current, g = c?.getContext("2d");
    if (!c || !g) return;
    let raf = 0, prev = performance.now(), popAt = 0, drawn = prev, work = 0, slow = false;
    const frame = (now: number) => {
      const s = scene.current!;
      const dt = (now - prev) / 1000; prev = now;
      if (!s.reduced && queue.current.length && now - popAt > 45) { s.emit(queue.current.shift()!); popAt = now; }
      if (s.reduced) {
        if (dirty.current) { s.update(0); s.draw(g); dirty.current = false; }
      } else if (!slow || now - drawn >= 32) {
        // Adaptive limiter: if update+draw itself keeps costing more than ~9 ms (a weak machine), draw at 30 fps
        // instead of stuttering. Pixel art reads fine at 30 fps; the simulation time (dt) stays correct.
        const t = performance.now();
        s.update(Math.max(dt, (now - drawn) / 1000)); s.draw(g);
        work = work * 0.9 + (performance.now() - t) * 0.1; drawn = now;
        if (work > 9) slow = true; else if (work < 4) slow = false;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="lt-scene" ref={wrap}>
      <div className="lt-scene-box" style={{ width: size.w, height: size.h }}>
        <canvas ref={canvas} width={SCENE_W} height={SCENE_H} className="lt-canvas" role="img" aria-label={summary} />
        {(Object.keys(NODE_POS) as NodeKey[]).map((k) => (
          <div key={k} className={`lt-nl is-${labels[k].state} lt-nl--${k}`} style={{ left: `${(NODE_POS[k].x / SCENE_W) * 100}%`, top: `${((NODE_POS[k].y + (k === "recon" ? 31 : 25)) / SCENE_H) * 100}%` }}>
            <b>{labels[k].title}</b>
            {labels[k].sub && <small>{labels[k].sub}</small>}
          </div>
        ))}
        <span className="lt-corner lt-corner--tl" /><span className="lt-corner lt-corner--tr" /><span className="lt-corner lt-corner--bl" /><span className="lt-corner lt-corner--br" />
      </div>
    </div>
  );
}
export { COLORS };
