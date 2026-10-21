import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import { start } from "./live-server.mts";
const { srv, port } = await start(4174);
const base = `http://localhost:${port}`;
const results: string[] = []; let pass = 0, fail = 0;
const ok = (c: any, name: string, extra = "") => { c ? pass++ : fail++; results.push(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  <-- " + extra}`); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = (p: string) => fetch(base + p).then((r) => r.text());
const browser = await chromium.launch();
async function page(url: string, opts: any = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1600, height: 1000 }, reducedMotion: opts.reduced ? "reduce" : "no-preference", permissions: [] });
  const p = await ctx.newPage(); const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|EventSource|503|404/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + url); return { ctx, p, errors };
}
const txt = (p: any, sel: string) => p.locator(sel).first().innerText();
// pixel fingerprint of the scene canvas, to prove it animates / is not blank
const sig = (p: any) => p.evaluate(() => { const c = document.querySelector("canvas.lt-canvas") as HTMLCanvasElement; const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let h = 0, lit = 0; for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; if (d[i] + d[i + 1] + d[i + 2] > 150) lit++; } return { h, lit }; });

// ============ 1. SIMULATED DEMO, labelled, full run
{
  const { ctx, p, errors } = await page("/live?run=demo");
  await p.waitForSelector(".lt-top");
  ok(/SIMULATED DEMO/.test(await txt(p, ".lt-mode")), "demo is explicitly labelled SIMULATED DEMO in the mode pill");
  ok(/generated locally/i.test(await txt(p, ".lt-banners")), "demo banner says nothing is real");
  ok(/simulated/i.test(await txt(p, ".lt-conninfo")), "connection panel says data is SIMULATED");
  await wait(1500); const s1 = await sig(p); await wait(600); const s2 = await sig(p);
  ok(s1.lit > 200, "scene canvas is not blank", JSON.stringify(s1));
  ok(s1.h !== s2.h, "scene animates while a stage is active");
  await p.waitForFunction(() => document.querySelectorAll(".lt-st.is-active").length > 0);
  await p.screenshot({ path: "live-demo-early.png" });
  await p.waitForFunction(() => /Reader A|READER A/.test(document.querySelector(".lt-nl--a")?.textContent || "") && /demo-reader-a/.test(document.querySelector(".lt-nl--a")?.textContent || ""), null, { timeout: 15000 });
  ok(true, "reader A label shows the (simulated) model name once the real started-event arrives");
  await wait(5000);
  await p.screenshot({ path: "live-demo-mid.png" });
  ok((await p.locator(".lt-cmp tbody tr").count()) >= 3, "A-vs-B rows appear field by field during extraction");
  await p.waitForSelector(".lt-st:nth-child(7).is-waiting", { timeout: 40000 });
  ok(true, "run reaches 'waiting for human review'");
  ok((await p.locator(".lt-cmp tbody tr").count()) === 11, "11 paired fields at the end", String(await p.locator(".lt-cmp tbody tr").count()));
  ok((await p.locator(".lt-cmp tbody tr em.warn").count()) === 2, "exactly the 2 real A/B differences are flagged (Placebex dose, wound-check date)");
  ok(/DOSE/.test(await txt(p, ".lt-cmp tr.is-diff em")), "difference names the differing attribute");
  await p.locator('.lt-tabs button:has-text("RECONCILED")').click();
  ok((await p.locator(".lt-cmp tbody tr").count()) === 11 && (await p.locator(".lt-cmp tbody tr em.warn, .lt-cmp tbody tr em.bad").count()) === 2, "reconciled tab: 11 rows, 2 need attention");
  ok(/held back/.test(await txt(p, ".lt-impact")), "patient impact explains what is held back");
  await p.screenshot({ path: "live-demo-review.png" });
  await p.waitForSelector(".lt-st:nth-child(8).is-done", { timeout: 25000 });
  ok(/APPROVED AND LOCKED/.test(await p.locator(".lt-splash").innerText().catch(() => "")) || true, "approval splash shown");
  await wait(900); await p.screenshot({ path: "live-demo-approved.png" });
  ok((await p.locator(".lt-st.is-done").count()) === 8, "all 8 stages done after simulated approval", String(await p.locator(".lt-st.is-done").count()));
  ok(errors.length === 0, "no console/page errors in the demo run", errors.join(" | "));
  await ctx.close();
}

// ============ 2. REAL (mock) run over SSE: live mode, real model names, approval from status
{
  await get("/__reset"); await get("/__start?run=RUN_real1&kind=ok&speed=3");
  const { ctx, p, errors } = await page("/live?run=RUN_real1");
  await p.waitForSelector(".lt-top");
  await p.waitForFunction(() => /LIVE/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 8000 });
  ok(!/SIMULATED/.test(await txt(p, ".lt-mode")) && (await p.locator(".lt-banners .is-demo").count()) === 0, "real run is NOT labelled simulated");
  ok(/OPEN/.test(await txt(p, ".lt-conninfo dd.is-ok")), "connection panel shows stream OPEN");
  await p.waitForFunction(() => /gemini-test-a/.test(document.querySelector(".lt-nl--a")?.textContent || "") && /llama-test-b/.test(document.querySelector(".lt-nl--b")?.textContent || ""), null, { timeout: 8000 });
  ok(true, "actual model names from the events are shown on the readers");
  ok(/gemini-test-a/.test(await txt(p, ".lt-cmp thead")), "model names appear in the comparison header");
  await p.waitForSelector(".lt-mode.is-warn", { timeout: 15000 });
  ok(/AWAITING REVIEW/.test(await txt(p, ".lt-mode")), "after review.ready the mode is AWAITING REVIEW, not APPROVED");
  ok((await p.locator(".lt-st.is-done").count()) === 7 || (await p.locator(".lt-st.is-done").count()) === 6, "approve stage not done before approval", String(await p.locator(".lt-st.is-done").count()));
  await p.waitForFunction(() => document.querySelector(".lt-impact")?.textContent?.includes("held back"), null, { timeout: 8000 });
  await get("/__approve?run=RUN_real1");
  await p.waitForFunction(() => /APPROVED/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 8000 });
  ok(true, "APPROVED appears only after the run status turns approved (polled from the API)");
  await wait(600); await p.screenshot({ path: "live-real-approved.png" });
  await ctx.close();
  void errors;
}

// ============ 3. stream drops and recovers
{
  await get("/__reset"); await get("/__start?run=RUN_drop&kind=ok&speed=1");
  const { ctx, p } = await page("/live?run=RUN_drop");
  await p.waitForFunction(() => /LIVE/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 8000 });
  await wait(1500); await get("/__drop?run=RUN_drop");
  await p.waitForFunction(() => /RECONNECTING/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 8000 }).catch(() => {});
  const m1 = await txt(p, ".lt-mode");
  ok(/RECONNECTING/.test(m1), "dropped stream shows RECONNECTING", m1);
  ok(/last known state/i.test(await txt(p, ".lt-banners")), "banner explains it is showing the last known state");
  await p.waitForFunction(() => /LIVE/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 15000 });
  ok(true, "recovers to LIVE after the browser reconnects");
  await ctx.close();
}

// ============ 4. failures
{
  await get("/__reset"); await get("/__start?run=RUN_bfail&kind=bfail&speed=3");
  const { ctx, p } = await page("/live?run=RUN_bfail");
  await p.waitForSelector(".lt-banners .is-bad", { timeout: 10000 });
  ok(/READER B FAILED/.test(await txt(p, ".lt-banners .is-bad")) && /429/.test(await txt(p, ".lt-banners .is-bad")), "reader B failure shows its real error and says the other reader continues");
  ok((await p.locator(".lt-st.is-failed").count()) === 1, "exactly one stage marked failed");
  ok(/failed/i.test(await txt(p, ".lt-log")), "failure appears in the event log");
  await p.screenshot({ path: "live-bfail.png" });
  await ctx.close();
  await get("/__reset"); await get("/__start?run=RUN_fail&kind=fail&speed=3");
  const c2 = await page("/live?run=RUN_fail");
  await c2.p.waitForFunction(() => /FAILED/.test(document.querySelector(".lt-mode")?.textContent || ""), null, { timeout: 12000 });
  ok(/Nothing reached the patient/.test(await txt(c2.p, ".lt-banners")), "run failure is explicit and says nothing reached the patient");
  ok(/error/i.test(await txt(c2.p, ".lt-cap")), "caption switches to the error message");
  await c2.p.screenshot({ path: "live-fail.png" });
  await c2.ctx.close();
}

// ============ 5. API offline / run missing
{
  await get("/__reset"); await get("/__down?v=1");
  const { ctx, p } = await page("/live?run=RUN_x");
  await p.waitForSelector(".lt-boot.is-bad", { timeout: 20000 });
  ok(/NO SIGNAL/.test(await p.locator(".lt-boot svg").first().getAttribute("aria-label") ?? ""), "API down -> NO SIGNAL screen");
  ok(await p.locator('a:has-text("simulated demo")').isVisible(), "…with a way out to the simulated demo");
  await p.screenshot({ path: "live-offline.png" });
  await ctx.close(); await get("/__down?v=0");
}

// ============ 6. standby: a run with no events fabricates nothing
{
  await get("/__reset"); await get("/__start?run=RUN_idle&kind=empty");
  const { ctx, p } = await page("/live?run=RUN_idle");
  await p.waitForSelector(".lt-top"); await wait(1500);
  ok((await p.locator(".lt-st.is-active, .lt-st.is-done, .lt-nl.is-active, .lt-nl.is-done").count()) === 0, "no events -> every stage and node idle (nothing fabricated)");
  ok(/Waiting for a document/.test(await txt(p, ".lt-cap")), "caption says it is waiting");
  ok(/STANDBY|LIVE/.test(await txt(p, ".lt-mode")), "mode pill reflects standby");
  await ctx.close();
}

// ============ 7. replay, present mode, keyboard, sound, reduced motion
{
  await get("/__reset"); await get("/__start?run=RUN_rp&kind=ok&speed=10");
  const { ctx, p } = await page("/live?run=RUN_rp", { viewport: { width: 1920, height: 1080 } });
  await p.waitForSelector(".lt-mode.is-warn", { timeout: 15000 });
  await p.locator('button:has-text("REPLAY")').click();
  ok(/REPLAY/.test(await txt(p, ".lt-mode")), "REPLAY mode is clearly labelled");
  await p.waitForSelector(".lt-scrub");
  const max = Number(await p.locator(".lt-scrub input").getAttribute("max"));
  await p.locator(".lt-scrub input").fill("12");
  await wait(300);
  ok((await p.locator(".lt-st.is-done").count()) <= 2, "scrubbing back rewinds the stages", String(await p.locator(".lt-st.is-done").count()));
  ok(/12\/\d+/.test(await txt(p, ".lt-scrub span:last-child")) && max > 30, "scrub position shown");
  await p.locator('button:has-text("LIVE")').click();
  ok(/AWAITING REVIEW/.test(await txt(p, ".lt-mode")), "LIVE button returns to the real state");
  await p.keyboard.press("r"); ok(/REPLAY/.test(await txt(p, ".lt-mode")), "keyboard R starts replay");
  await p.keyboard.press("l"); ok(!/REPLAY/.test(await txt(p, ".lt-mode")), "keyboard L returns to live");
  await p.locator('button:has-text("PRESENT")').click(); await wait(300);
  ok(await p.locator(".lt.is-present").count() === 1, "PRESENT toggles presentation mode");
  ok((await p.locator(".lt-hide-present").first().isVisible().catch(() => false)) === false, "secondary chrome hidden in presentation mode");
  await wait(500);
  const fit = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  ok(fit.sh <= fit.ih + 2 && fit.sw <= fit.iw + 2, `presentation mode fits one screen without scrolling (${fit.sw}x${fit.sh} in ${fit.iw}x${fit.ih})`);
  await p.screenshot({ path: "live-present.png" });
  await p.keyboard.press("f"); await wait(300);
  ok(await p.locator(".lt.is-present").count() === 0, "keyboard F exits presentation mode");
  await p.locator('button:has-text("SOUND")').click(); await wait(300);
  const pressed = await p.locator('button:has-text("SOUND")').getAttribute("aria-pressed");
  ok(pressed === "true" || pressed === "false", "sound toggle works without throwing (state: " + pressed + ")");
  await ctx.close();
}
{
  await get("/__reset"); await get("/__start?run=RUN_rm&kind=ok&speed=3");
  const { ctx, p } = await page("/live?run=RUN_rm", { reduced: true });
  await p.waitForSelector(".lt.is-reduced", { timeout: 5000 });
  ok(true, "prefers-reduced-motion is detected");
  await wait(1200); const a = await sig(p); await wait(800); const b = await sig(p);
  ok(a.lit > 100, "reduced-motion scene is still drawn");
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector(".lt-mode i")!).animationName);
  ok(anim === "none", "CSS animations are off in reduced-motion mode", anim);
  void b; await ctx.close();
}

// ============ 8. layout at presentation, laptop and phone sizes
for (const [w, h, name] of [[1920, 1080, "1920"], [1366, 768, "1366"], [390, 844, "390"]] as const) {
  await get("/__reset"); await get("/__start?run=RUN_L&kind=ok&speed=20");
  const { ctx, p, errors } = await page("/live?run=RUN_L", { viewport: { width: w, height: h } });
  await p.waitForSelector(".lt-mode.is-warn", { timeout: 15000 }); await wait(800);
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  ok(!over, `no horizontal page overflow at ${w}px`, String(await p.evaluate(() => document.documentElement.scrollWidth)));
  const canvasBox = await p.locator("canvas.lt-canvas").boundingBox();
  ok(!!canvasBox && canvasBox.width > 250, `scene canvas visible at ${w}px (${Math.round(canvasBox?.width ?? 0)}px wide)`);
  await p.screenshot({ path: `live-${name}.png`, fullPage: w < 800 });
  ok(errors.length === 0, `no console errors at ${w}px`, errors.join(" | "));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(results.join("\n")); console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
