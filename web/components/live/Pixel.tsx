"use client";
import { useEffect, useRef } from "react";
import { PALETTE, SPRITES, REMAP_A, REMAP_B, drawSprite, textRects, type SpriteName } from "@/lib/theater/pixel";

/** Pixel-font text as crisp SVG. `px` is the size of one font pixel. Screen readers get `label` (or the text itself). */
export function PixelText({ text, px = 3, color = "currentColor", label, className }: { text: string; px?: number; color?: string; label?: string; className?: string }) {
  const { w, h, pts } = textRects(text);
  return (
    <svg className={className} role="img" aria-label={label ?? text} width={w * px} height={h * px} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" style={{ display: "block" }}>
      {pts.map(([x, y], i) => <rect key={i} x={x} y={y} width={1} height={1} fill={color} />)}
    </svg>
  );
}

/** A pixel sprite drawn on a small canvas (aria-hidden: always paired with a text label). */
export function PixelIcon({ name, scale = 3, who, dim = false }: { name: SpriteName; scale?: number; who?: "a" | "b"; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rows = SPRITES[name];
  useEffect(() => {
    const c = ref.current, g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    drawSprite(g, rows, 0, 0, scale, who === "a" ? REMAP_A : who === "b" ? REMAP_B : undefined, dim ? 0.4 : 1);
  }, [rows, scale, who, dim]);
  return <canvas ref={ref} aria-hidden="true" width={rows[0].length * scale} height={rows.length * scale} style={{ imageRendering: "pixelated", display: "block" }} />;
}

export { PALETTE };
