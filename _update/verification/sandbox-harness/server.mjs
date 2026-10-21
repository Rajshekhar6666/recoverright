import http from "node:http"; import fs from "node:fs";
export function start(port = 4173) {
  const state = { helpStatus: 201, posts: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (u.pathname === "/help" && req.method === "POST") {
      let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { try { state.posts.push(JSON.parse(b)); } catch { state.posts.push({ raw: b }); } res.writeHead(state.helpStatus, { ...cors, "Content-Type": "application/json" }); res.end("{}"); }); return;
    }
    if (u.pathname === "/__set") { state.helpStatus = Number(u.searchParams.get("status")); res.writeHead(200, cors); return res.end("ok"); }
    if (u.pathname === "/__reset") { state.posts = []; res.writeHead(200, cors); return res.end("ok"); }
    if (u.pathname === "/__posts") { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); return res.end(JSON.stringify(state.posts)); }
    const f = { "/": "index.html", "/patient.js": "patient.js", "/patient.css": "patient.css", "/live.js": "live.js", "/live.css": "live.css" }[u.pathname];
    if (u.pathname === "/p") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><link rel=stylesheet href=/patient.css><div id=root></div><script src=/patient.js></script>'); }
    if (u.pathname === "/live") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#050d1f"><link rel=stylesheet href=/live.css><div id=root></div><script src=/live.js></script>'); }
    if (f && fs.existsSync(f)) { res.writeHead(200, { "Content-Type": f.endsWith(".css") ? "text/css" : f.endsWith(".js") ? "text/javascript" : "text/html" }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404, cors); res.end("nope");
  });
  return new Promise((r) => srv.listen(port, () => r({ srv, state, port })));
}
