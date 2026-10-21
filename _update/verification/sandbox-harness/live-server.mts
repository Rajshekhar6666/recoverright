import http from "node:http"; import fs from "node:fs";
import * as demoMod from "/home/claude/out/web/lib/theater/demo";
const D: any = (demoMod as any).default ?? demoMod;
const demoSchedule = D.demoSchedule as () => any[]; const DEMO_RECON = D.DEMO_RECON as any[];

type Run = { meta: any; events: any[]; clients: Set<http.ServerResponse>; timers: NodeJS.Timeout[]; seq: number };
export function start(port = 4174) {
  const runs: Record<string, Run> = {}; let down = false;
  const send = (r: Run, type: string, payload: any = {}) => { const ev = { seq: ++r.seq, ts: new Date().toISOString(), type, payload }; r.events.push(ev); for (const c of r.clients) c.write(`data: ${JSON.stringify(ev)}\n\n`); };
  function begin(id: string, kind: string, speed = 3) {
    const r: Run = { meta: { run_id: id, filename: `${id}_discharge.pdf`, created_at: new Date().toISOString(), status: "processing", counts: null }, events: [], clients: new Set(), timers: [], seq: 0 };
    runs[id] = r;
    if (kind === "empty") return r; // a run that exists but has emitted no events yet
    const MODELS = { a: "gemini-test-a", b: "llama-test-b" };
    for (const s of demoSchedule()) {
      if (kind === "bfail" && (s.type === "extract.b.field" || s.type === "extract.b.done")) continue;
      if (kind === "fail" && s.at > 6000) continue;
      const payload = s.type.endsWith(".started") ? { model: s.type.includes(".a.") ? MODELS.a : MODELS.b } : s.payload;
      r.timers.push(setTimeout(() => {
        send(r, s.type, payload);
        if (s.type === "review.ready") r.meta.status = "needs_review";
      }, s.at / speed));
    }
    if (kind === "bfail") r.timers.push(setTimeout(() => send(r, "extract.b.failed", { error: "429 rate limit exceeded for llama-test-b" }), 4500 / speed));
    if (kind === "fail") r.timers.push(setTimeout(() => { send(r, "extract.a.failed", { error: "model returned invalid JSON after 4 attempts" }); send(r, "run.failed", { error: "both readers failed" }); r.meta.status = "failed"; }, 7000 / speed));
    return r;
  }
  const review = (id: string) => ({ run: { ...runs[id].meta, approved: runs[id].meta.status === "approved", counts: { agreed: 9, review: 1, conflict: 1, rejected: 0 } },
    fields: DEMO_RECON.map((f) => ({ field: { field_id: f.id, category: f.category, status: f.status === "agreed" ? "agreed" : "review", block_id: "b8", attrs: { summary: f.final }, opinions: [{ voter: "A", quote: "q", trusted: true }, { voter: "B", quote: "q", trusted: true }], issues: f.issues }, decision: null })) });
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x"); const p = u.pathname;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (p === "/__start") { begin(u.searchParams.get("run")!, u.searchParams.get("kind") || "ok", Number(u.searchParams.get("speed") || 3)); res.writeHead(200, cors); return res.end("ok"); }
    if (p === "/__approve") { runs[u.searchParams.get("run")!].meta.status = "approved"; res.writeHead(200, cors); return res.end("ok"); }
    if (p === "/__down") { down = u.searchParams.get("v") === "1"; res.writeHead(200, cors); return res.end("ok"); }
    if (p === "/__drop") { const r = runs[u.searchParams.get("run")!]; for (const c of r.clients) c.destroy(); r.clients.clear(); res.writeHead(200, cors); return res.end("ok"); }
    if (p === "/__reset") { for (const r of Object.values(runs)) { r.timers.forEach(clearTimeout); r.clients.forEach((c) => c.destroy()); } for (const k of Object.keys(runs)) delete runs[k]; down = false; res.writeHead(200, cors); return res.end("ok"); }
    if (p.startsWith("/runs")) {
      if (down) { res.writeHead(503, cors); return res.end("down"); }
      const parts = p.split("/").filter(Boolean);
      if (parts.length === 1) { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify(Object.values(runs).map((r) => r.meta).reverse())); }
      const r = runs[parts[1]]; if (!r) { res.writeHead(404, cors); return res.end("no such run"); }
      if (parts[2] === "events") {
        res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": hi\n\n"); for (const e of r.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
        r.clients.add(res); req.on("close", () => r.clients.delete(res)); return;
      }
      if (parts[2] === "review") { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify(review(parts[1]))); }
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify(r.meta));
    }
    if (p === "/live") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#050d1f"><link rel=stylesheet href=/live.css><div id=root></div><script>window.__API__=location.origin</script><script src=/live.js></script>'); }
    const f = ({ "/live.js": "live.js", "/live.css": "live.css" } as any)[p];
    if (f && fs.existsSync(f)) { res.writeHead(200, { "Content-Type": f.endsWith(".css") ? "text/css" : "text/javascript" }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404, cors); res.end("nope");
  });
  return new Promise<{ srv: http.Server; port: number }>((r) => srv.listen(port, () => r({ srv, port })));
}
