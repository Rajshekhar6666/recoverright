import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import { start } from "./live-server.mts";
const { srv, port } = await start(4175);
const b = await chromium.launch(); 
for (const [w, h, label] of [[1920, 1080, "1920x1080 (present size)"], [1366, 768, "1366x768 (laptop)"]] as const) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  await p.goto(`http://localhost:${port}/live?run=demo`); await p.waitForSelector(".lt-top");
  await new Promise((r) => setTimeout(r, 7000)); // mid-extraction: the busiest part of the run
  const r: any = await p.evaluate(`new Promise((res) => {
    const dts = []; let last = performance.now(); const t0 = last; const lt = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(e.duration))).observe({ entryTypes: ["longtask"] }); } catch (e) {}
    const f = (now) => { dts.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(f); else { dts.sort((a, b) => a - b);
      res({ frames: dts.length, avg: dts.reduce((a, b) => a + b, 0) / dts.length, p95: dts[Math.floor(dts.length * 0.95)], max: dts[dts.length - 1], longTasks: lt.length, longMax: Math.max(0, ...lt),
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, nodes: document.querySelectorAll("*").length }); } };
    requestAnimationFrame(f);
  })`);
  console.log(label, JSON.stringify({ fps: Math.round(1000 / r.avg), avgFrameMs: +r.avg.toFixed(1), p95FrameMs: +r.p95.toFixed(1), worstFrameMs: +r.max.toFixed(1), longTasks: r.longTasks, longestTaskMs: Math.round(r.longMax), jsHeapMB: r.heapMB, domNodes: r.nodes }));
  await ctx.close();
}
await b.close(); srv.close();
