/**
 * Pixel control-room scene. Renders at a tiny internal resolution (384x216) that CSS scales up with
 * `image-rendering: pixelated`, which gives real pixel-art at almost no fill-rate cost.
 *
 * Honesty rule: nodes change state only through setNodes() (derived from real events / run status), and particles
 * are spawned only through emit() (derived from real events by effectsFor()). The only thing that moves on its own is
 * decoration with no meaning: faint background twinkle and the marching dashes on a link between two active stages.
 */
import { COLORS, type Effect, type NodeKey, type NodeState } from "./model";
import { PALETTE, REMAP_A, REMAP_B, SPRITES, drawSprite, drawText, type SpriteName } from "./pixel";

export const SCENE_W = 384;
export const SCENE_H = 216;

export const NODE_POS: Record<NodeKey, { x: number; y: number }> = {
  doc: { x: 34, y: 108 }, parse: { x: 94, y: 108 }, a: { x: 166, y: 58 }, b: { x: 166, y: 158 },
  ground: { x: 232, y: 108 }, recon: { x: 292, y: 108 }, human: { x: 350, y: 60 }, lock: { x: 350, y: 156 },
};
const SPRITE_OF: Record<NodeKey, SpriteName> = { doc: "doc", parse: "parse", a: "chip", b: "chip", ground: "shield", recon: "core", human: "nurse", lock: "lock" };
const LINKS: [NodeKey, NodeKey][] = [["doc", "parse"], ["parse", "a"], ["parse", "b"], ["a", "ground"], ["b", "ground"], ["ground", "recon"], ["recon", "human"], ["recon", "lock"], ["human", "lock"]];
const NODE_COLOR: Record<NodeState, string> = { idle: "#1f3a5c", active: "#2ee6ff", done: "#52f08a", failed: "#ff5d78", waiting: "#ffd34d" };
const MAX_PARTICLES = 420;
const ALL_NODES = Object.keys(NODE_POS) as NodeKey[];

interface Packet { kind: "packet"; from: NodeKey; to: NodeKey; t: number; speed: number; color: string; size: number; trail: [number, number][] }
interface Spark { kind: "spark"; x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; s: number; g: number }
interface Ring { kind: "ring"; node: NodeKey; life: number; max: number; color: string }
interface Pop { kind: "pop"; x: number; y: number; life: number; text: string; color: string }
type Particle = Packet | Spark | Ring | Pop;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pos = (n: NodeKey) => NODE_POS[n];

export class TheaterScene {
  readonly w = SCENE_W;
  readonly h = SCENE_H;
  private t = 0;
  private nodes = Object.fromEntries(ALL_NODES.map((n) => [n, "idle"])) as Record<NodeKey, NodeState>;
  private flash = Object.fromEntries(ALL_NODES.map((n) => [n, 0])) as Record<NodeKey, number>;
  private glitch = Object.fromEntries(ALL_NODES.map((n) => [n, 0])) as Record<NodeKey, number>;
  private shake = 0;
  private particles: Particle[] = [];
  private bg: HTMLCanvasElement | null = null;
  private stars: { x: number; y: number; p: number }[] = [];

  constructor(public reduced = false) {
    for (let i = 0; i < 46; i++) this.stars.push({ x: Math.floor(rnd(0, SCENE_W)), y: Math.floor(rnd(0, SCENE_H)), p: rnd(0, 6.28) });
  }

  setNodes(states: Record<NodeKey, NodeState>): void { this.nodes = { ...states }; }
  getParticleCount(): number { return this.particles.length; }
  /** Drops all in-flight particles (used when a replay jumps backwards). */
  reset(): void { this.particles = []; ALL_NODES.forEach((n) => { this.flash[n] = 0; this.glitch[n] = 0; }); this.shake = 0; }

  emit(effects: Effect[]): void {
    for (const e of effects) {
      if (this.reduced && e.kind !== "pop" && e.kind !== "ring") continue; // no flying particles for reduced motion
      if (this.particles.length >= MAX_PARTICLES && e.kind !== "pop") continue;
      switch (e.kind) {
        case "packet": {
          const inFlight = this.particles.filter((p) => p.kind === "packet").length;
          if (inFlight > 90) break;
          const a = pos(e.from);
          this.particles.push({ kind: "packet", from: e.from, to: e.to, t: 0, speed: rnd(0.9, 1.25), color: e.color, size: e.size ?? 2, trail: [[a.x, a.y]] });
          break;
        }
        case "burst": this.burst(e.at, e.color, e.n ?? 16); this.flash[e.at] = 1; break;
        case "ring": this.particles.push({ kind: "ring", node: e.at, life: 0, max: 0.9, color: e.color }); this.flash[e.at] = Math.max(this.flash[e.at], 0.7); break;
        case "pop": { const p = pos(e.at); this.particles.push({ kind: "pop", x: p.x, y: p.y - 24, life: 0, text: e.text, color: e.color }); break; }
        case "glitch": this.glitch[e.at] = 1.4; break;
        case "shake": this.shake = 0.35; break;
        case "confetti": for (let i = 0; i < 70; i++) this.particles.push({ kind: "spark", x: rnd(60, SCENE_W - 20), y: rnd(-20, 10), vx: rnd(-10, 10), vy: rnd(30, 80), life: 0, max: rnd(1.6, 2.8), color: [COLORS.ok, COLORS.warn, COLORS.info, COLORS.a, COLORS.b][i % 5], s: 2, g: 20 }); break;
      }
    }
  }

  private burst(at: NodeKey, color: string, n: number): void {
    const p = pos(at);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), v = rnd(24, 62);
      this.particles.push({ kind: "spark", x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.45, 0.9), color, s: Math.random() < 0.3 ? 2 : 1, g: 0 });
    }
  }

  update(dtRaw: number): void {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    this.t += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    for (const n of ALL_NODES) { this.flash[n] = Math.max(0, this.flash[n] - dt * 2.2); this.glitch[n] = Math.max(0, this.glitch[n] - dt); }
    const next: Particle[] = [];
    for (const p of this.particles) {
      switch (p.kind) {
        case "packet": {
          p.t += dt * p.speed * 1.15;
          const [x, y] = this.packetXY(p);
          p.trail.push([x, y]); if (p.trail.length > 6) p.trail.shift();
          if (p.t >= 1) { this.flash[p.to] = Math.max(this.flash[p.to], 0.6); this.burst(p.to, p.color, 4); } else next.push(p);
          break;
        }
        case "spark": p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; if (p.life < p.max) next.push(p); break;
        case "ring": p.life += dt; if (p.life < p.max) next.push(p); break;
        case "pop": p.life += dt; p.y -= dt * 14; if (p.life < 1.1) next.push(p); break;
      }
    }
    this.particles = next;
  }

  private packetXY(p: Packet): [number, number] {
    const a = pos(p.from), b = pos(p.to);
    const t = p.t < 0 ? 0 : p.t > 1 ? 1 : p.t;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(18, len * 0.16) * (a.y <= b.y ? 1 : -1);
    const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
    const u = 1 - t;
    return [u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y];
  }

  // ---------------------------------------------------------------- drawing
  private background(): HTMLCanvasElement | null {
    if (this.bg) return this.bg;
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas"); c.width = SCENE_W; c.height = SCENE_H;
    const g = c.getContext("2d"); if (!g) return null;
    g.fillStyle = "#050d1f"; g.fillRect(0, 0, SCENE_W, SCENE_H);
    for (let y = 0; y < SCENE_H; y += 12) { g.fillStyle = y % 48 === 0 ? "rgba(46,230,255,.10)" : "rgba(76,141,255,.045)"; g.fillRect(0, y, SCENE_W, 1); }
    for (let x = 0; x < SCENE_W; x += 12) { g.fillStyle = x % 48 === 0 ? "rgba(46,230,255,.10)" : "rgba(76,141,255,.045)"; g.fillRect(x, 0, 1, SCENE_H); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(5,13,31,${0.16 * (6 - i)})`; g.fillRect(i, i, SCENE_W - i * 2, 1); g.fillRect(i, SCENE_H - 1 - i, SCENE_W - i * 2, 1); g.fillRect(i, i, 1, SCENE_H - i * 2); g.fillRect(SCENE_W - 1 - i, i, 1, SCENE_H - i * 2); }
    this.bg = c; return c;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (this.shake > 0 && !this.reduced) ctx.translate(Math.round(rnd(-2, 2) * this.shake * 3), Math.round(rnd(-2, 2) * this.shake * 3));
    const bg = this.background();
    if (bg) ctx.drawImage(bg, 0, 0); else { ctx.fillStyle = "#050d1f"; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    if (!this.reduced) {
      for (const s of this.stars) { const a = 0.25 + 0.25 * Math.sin(this.t * 1.6 + s.p); ctx.fillStyle = `rgba(160,220,255,${a})`; ctx.fillRect(s.x, s.y, 1, 1); }
    }
    this.drawLinks(ctx);
    for (const n of ALL_NODES) this.drawNode(ctx, n);
    for (const p of this.particles) this.drawParticle(ctx, p);
    if (!this.reduced) { const y = Math.floor((this.t * 26) % (SCENE_H + 20)) - 10; ctx.fillStyle = "rgba(46,230,255,.045)"; ctx.fillRect(0, y, SCENE_W, 6); }
    ctx.restore();
  }

  private drawLinks(ctx: CanvasRenderingContext2D): void {
    for (const [f, t] of LINKS) {
      const a = pos(f), b = pos(t), len = Math.hypot(b.x - a.x, b.y - a.y);
      const live = (this.nodes[f] === "done" || this.nodes[f] === "active") && this.nodes[t] === "active";
      const lit = this.nodes[f] === "done" && (this.nodes[t] === "done" || this.nodes[t] === "waiting");
      const failed = this.nodes[f] === "failed" || this.nodes[t] === "failed";
      ctx.fillStyle = failed ? "#7a2536" : live ? "#2ee6ff" : lit ? "#1f7a56" : "#16304f";
      const off = live && !this.reduced ? Math.floor(this.t * 18) % 6 : 0;
      for (let d = off; d < len; d += 6) { const u = d / len; ctx.fillRect(Math.round(a.x + (b.x - a.x) * u), Math.round(a.y + (b.y - a.y) * u), 2, 2); }
    }
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: NodeKey): void {
    const p = pos(n), st = this.nodes[n], big = n === "recon";
    const sc = big ? 3 : 2, size = 16 * sc, half = size / 2;
    const col = NODE_COLOR[st];
    const pulse = st === "active" ? 0.5 + 0.5 * Math.sin(this.t * 5) : st === "waiting" ? (Math.sin(this.t * 3.2) > 0 ? 1 : 0.35) : 0;
    const x0 = Math.round(p.x - half), y0 = Math.round(p.y - half);
    // glow: stepped, pixel-style
    const glow = Math.max(this.flash[n], st === "active" ? 0.35 + 0.25 * pulse : st === "waiting" ? 0.25 * pulse : st === "done" ? 0.08 : st === "failed" ? 0.3 : 0);
    ctx.fillStyle = col;
    for (let i = 3; i >= 1; i--) { ctx.globalAlpha = glow * 0.12 * (4 - i); ctx.fillRect(x0 - i * 3, y0 - i * 3, size + i * 6, size + i * 6); }
    ctx.globalAlpha = 1;
    // pad
    const pad = 5;
    ctx.fillStyle = "#07152e"; ctx.fillRect(x0 - pad, y0 - pad, size + pad * 2, size + pad * 2);
    ctx.fillStyle = col; ctx.globalAlpha = st === "idle" ? 0.9 : 1;
    const bx = x0 - pad, by = y0 - pad, bw = size + pad * 2;
    ctx.fillRect(bx + 2, by, bw - 4, 1); ctx.fillRect(bx + 2, by + bw - 1, bw - 4, 1); ctx.fillRect(bx, by + 2, 1, bw - 4); ctx.fillRect(bx + bw - 1, by + 2, 1, bw - 4);
    ctx.fillRect(bx + 1, by + 1, 1, 1); ctx.fillRect(bx + bw - 2, by + 1, 1, 1); ctx.fillRect(bx + 1, by + bw - 2, 1, 1); ctx.fillRect(bx + bw - 2, by + bw - 2, 1, 1);
    ctx.globalAlpha = 1;
    // sprite (idle nodes are dimmed so the live ones stand out)
    const g = this.glitch[n] > 0 && !this.reduced;
    const jx = g ? Math.round(rnd(-2, 2)) : 0, jy = g ? Math.round(rnd(-1, 1)) : 0;
    const alpha = st === "idle" ? 0.38 : 1;
    const remap = n === "a" ? REMAP_A : n === "b" ? REMAP_B : undefined;
    drawSprite(ctx, SPRITES[SPRITE_OF[n]], x0 + jx, y0 + jy, sc, remap, alpha);
    if (n === "a" || n === "b") drawText(ctx, n.toUpperCase(), x0 + half + 1, y0 + sc * 5 + 1, 1, st === "idle" ? "#35557c" : "#ffffff", "center");
    if (g) { for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "rgba(255,93,120,.55)" : "rgba(46,230,255,.4)"; ctx.fillRect(x0, y0 + Math.floor(rnd(0, size)), size, 1); } }
    // state decoration
    if (st === "active" && !this.reduced) {
      for (let i = 0; i < 4; i++) { const a = this.t * 3 + i * 1.5708, r = half + 9; ctx.fillStyle = i === 0 ? "#fff" : col; ctx.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r), 2, 2); }
      if (n === "doc" || n === "parse") { const sy = y0 + Math.floor(((this.t * 0.9) % 1) * size); ctx.fillStyle = "rgba(46,230,255,.8)"; ctx.fillRect(x0 - 2, sy, size + 4, 1); ctx.fillStyle = "rgba(46,230,255,.25)"; ctx.fillRect(x0 - 2, sy - 2, size + 4, 2); }
    }
    if (st === "done") drawSprite(ctx, SPRITES.tick, x0 + size - 6, y0 - 12, 2);
    if (st === "failed") drawSprite(ctx, SPRITES.cross, x0 + size - 6, y0 - 12, 2);
    if (st === "waiting") {
      // amber "!" badge, blinking: this node is waiting for a person
      const bx = x0 + size - 4, by = y0 - 13;
      ctx.globalAlpha = pulse > 0.5 ? 1 : 0.45;
      ctx.fillStyle = "#050b18"; ctx.fillRect(bx - 1, by - 1, 13, 15);
      ctx.fillStyle = "#ffd34d"; ctx.fillRect(bx, by, 11, 13);
      drawText(ctx, "!", bx + 5, by + 3, 1, "#050b18", "center");
      ctx.globalAlpha = 1;
    }
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    switch (p.kind) {
      case "packet": {
        const n = p.trail.length;
        for (let i = 0; i < n; i++) { ctx.globalAlpha = ((i + 1) / n) * 0.7; ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.trail[i][0]), Math.round(p.trail[i][1]), p.size, p.size); }
        ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; const [x, y] = this.packetXY(p); ctx.fillRect(Math.round(x), Math.round(y), p.size, p.size);
        break;
      }
      case "spark": { const k = 1 - p.life / p.max; ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); ctx.globalAlpha = 1; break; }
      case "ring": {
        const q = pos(p.node), k = p.life / p.max, r = Math.round(14 + k * 26);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
        for (let a = 0; a < 40; a++) { const ang = (a / 40) * 6.2832; ctx.fillRect(Math.round(q.x + Math.cos(ang) * r), Math.round(q.y + Math.sin(ang) * r), 1, 1); }
        ctx.globalAlpha = 1; break;
      }
      case "pop": ctx.globalAlpha = Math.max(0, 1 - p.life / 1.1); drawText(ctx, p.text, Math.round(p.x), Math.round(p.y), 1, p.color, "center"); ctx.globalAlpha = 1; break;
    }
  }
}

export { PALETTE };
