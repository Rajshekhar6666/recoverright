import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
const PORT = 4180, base = `http://localhost:${PORT}`;
const srv = spawn("python3", ["dev_server.py", String(PORT)], { cwd: "/home/claude/h2", stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.on("data", (d) => String(d).includes("dev server on") && r()));
let pass = 0, fail = 0; const out = [];
const ok = (c, name, extra = "") => { c ? pass++ : fail++; out.push(`${c ? "PASS" : "FAIL"}  ${name}${c ? "" : "  <-- " + extra}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (p) => fetch(base + p).then((r) => r.json());
const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const getJ = (p) => fetch(base + p).then((r) => r.json());
const alert = (o = {}) => post("/help", { token: "run_anita", heard: "I can't breathe", severity: "critical", label: "trouble breathing", source: "voice", ...o }).then((r) => r.json());
const browser = await chromium.launch();
async function open(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1500, height: 950 } });
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|503|404|409/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + path); await page.waitForSelector(".rr-side");
  return { ctx, page, errors };
}
const txt = (p, s) => p.locator(s).first().innerText();
const reset = () => ctl("/__reset");
async function section(name, fn) { try { await fn(); } catch (e) { fail++; out.push(`FAIL  [${name}] crashed: ${String(e.message).split("\n")[0].slice(0, 160)}`); } console.log("done:", name); }

await section('1. empty state', async () => {
{
  await reset();
  const { ctx, page, errors } = await open("/staff");
  await page.waitForSelector(".hx-conn.is-ok");
  ok(true, "dashboard loads and the API pill turns green");
  ok((await page.locator(".hx-banner").count()) === 0, "no alert banner when nobody is waiting");
  ok((await page.locator(".hx-nav-badge").count()) === 0, "no nav badge when nobody is waiting");
  ok((await page.locator(".hx-attn").count()) === 0, "no 'needs attention' panel when nobody is waiting");
  ok(/^0$/.test((await txt(page, ".hx-kpi-link b")).trim()), "Help waiting KPI shows 0");
  await page.waitForFunction(() => document.querySelectorAll(".hx-queue tbody tr").length === 4);
  ok(true, "work queue lists the 4 seeded patients");
  await page.screenshot({ path: "st-dashboard-calm.png" });
  await page.goto(base + "/staff/help"); await page.waitForSelector(".hx-stats");
  await page.waitForSelector(".hx-empty");
  ok(/All clear/.test(await txt(page, ".hx-empty")) && /patient app/.test(await txt(page, ".hx-empty")), "inbox empty state says 'All clear' and tells you how to test");
  ok(errors.length === 0, "no console errors (StrictMode)", errors.join(" | ")); await ctx.close();
}


});
await section('2. a patient asks for help: it appears everywhere, live', async () => {
{
  await reset();
  const { ctx, page, errors } = await open("/staff");
  await page.waitForSelector(".hx-conn.is-ok");
  const made = await alert();
  ok(made.status === "open" && made.item.patient.guardian_phone === "+919800000001", "patient alert stored with the patient's record attached (real Python core)");
  await page.waitForSelector(".hx-banner", { timeout: 8000 });
  ok(/Anita Singh/.test(await txt(page, ".hx-banner")) && /can't breathe/.test(await txt(page, ".hx-banner")), "banner appears within one poll with who and what was said");
  ok(await page.locator(".hx-banner--critical").count() === 1, "critical alerts get the red banner");
  ok((await txt(page, ".hx-nav-badge")).trim() === "1" && (await page.locator(".hx-nav-badge.is-critical").count()) === 1, "sidebar badge shows 1 and is marked critical");
  ok(/^1$/.test((await txt(page, ".hx-kpi-link b")).trim()), "KPI card shows 1 waiting");
  ok(/Needs attention now/.test(await txt(page, ".hx-attn")) && /Anita Singh/.test(await txt(page, ".hx-attn")), "dashboard 'needs attention' panel lists the patient");
  ok(await page.locator(".hx-queue .hx-help-chip.is-critical").count() === 1, "patient row in the work queue carries a critical help chip");
  await page.screenshot({ path: "st-dashboard-alert.png" });
  // the banner must follow the nurse to other pages
  await page.locator('a.rr-nav-item:has-text("Patients")').click(); await page.waitForSelector(".hx-queue");
  ok(await page.locator(".hx-banner").isVisible(), "banner is still there on the Patients page (every page)");
  await page.goto(base + "/staff/runs/run_anita/review"); await page.waitForSelector(".hx-banner", { timeout: 8000 });
  await wait(1500);
  ok(await page.locator(".hx-banner").isVisible() && (await page.locator("text=Placebex").count()) > 0, "banner shows over the existing review screen, which still renders its data");
  ok(errors.length === 0, "no console errors across pages", errors.join(" | ")); await ctx.close();
}


});
await section('3. acknowledge from the banner', async () => {
{
  await reset();
  const { ctx, page } = await open("/staff");
  await page.waitForSelector(".hx-conn.is-ok");
  const a = await alert();
  await page.waitForSelector(".hx-banner", { timeout: 8000 });
  const vis = await page.locator('.hx-banner button:has-text("Acknowledge")').evaluate((b) => { const s = getComputedStyle(b); return { c: s.color, bg: s.backgroundColor, w: b.textContent.trim() }; });
  ok(vis.c !== vis.bg && vis.w === "Acknowledge", "REGRESSION: banner Acknowledge button text is visible (text colour differs from background)", JSON.stringify(vis));
  await page.locator('.hx-banner button:has-text("Acknowledge")').click();
  await page.waitForSelector(".hx-banner", { state: "detached", timeout: 6000 });
  ok(true, "Acknowledge in the banner makes the banner go away");
  const srv1 = await getJ(`/help/${a.id}`);
  ok(srv1.status === "acknowledged" && srv1.acknowledged_by === "Care team" && srv1.acknowledged_at, "backend recorded who acknowledged and when", JSON.stringify(srv1.status));
  await page.waitForFunction(() => !document.querySelector(".hx-nav-badge"), null, { timeout: 6000 });
  ok(true, "nav badge clears once acknowledged");
  await ctx.close();
}


});
await section('4. inbox workflow: call, escalate, resolve', async () => {
{
  await reset();
  const { ctx, page, errors } = await open("/staff/help");
  await page.waitForSelector(".hx-conn.is-ok");
  const a = await alert(); const b = await alert({ token: "run_priya", heard: "I feel dizzy", severity: "concern", label: "feeling dizzy" });
  await page.waitForSelector(".hx-row", { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll(".hx-row").length === 2, null, { timeout: 8000 });
  ok(/Anita/.test(await txt(page, ".hx-row")), "most urgent (critical) request is listed first");
  ok(/Anita Singh/.test(await txt(page, ".hx-card")) && /can't breathe/.test(await txt(page, ".hx-heard")), "detail panel shows the patient and the exact words");
  ok((await page.locator('a:has-text("Call patient")').getAttribute("href")) === "tel:+919876543210", "'Call patient' dials the patient's real number");
  ok((await page.locator('a:has-text("Call Ravi Singh")').count()) === 1, "'Call' button for the guardian appears");
  await page.locator('a:has-text("Call patient")').click({ modifiers: [], noWaitAfter: true }).catch(() => {});
  await page.waitForFunction(async (id) => (await (await fetch(`http://localhost:4180/help/${id}`)).json()).calls === 1, a.id, { timeout: 6000 });
  const afterCall = await getJ(`/help/${a.id}`);
  ok(afterCall.calls === 1 && afterCall.status === "acknowledged", "clicking Call logs the call and acknowledges the request", JSON.stringify([afterCall.calls, afterCall.status]));
  await page.waitForSelector(".hx-timeline li:has-text('Called the patient')", { timeout: 6000 });
  ok(true, "the call appears in the history timeline");
  await page.locator('.hx-btn-row button:has-text("Escalate")').click();
  await page.locator('.hx-form textarea').fill("Chest pain, needs a doctor");
  await page.locator('button:has-text("Confirm escalation")').click();
  await page.waitForSelector(".hx-card .hx-st--escalated", { timeout: 6000 });
  ok((await getJ(`/help/${a.id}`)).status === "escalated", "escalation saved with the reason");
  await page.locator('.hx-btn-row button:has-text("Resolve")').click();
  ok(await page.locator('button:has-text("Mark resolved")').isDisabled(), "'Mark resolved' stays disabled until a reason is chosen");
  await page.locator(".hx-form select").selectOption("emergency");
  await page.locator(".hx-form textarea").fill("Ambulance dispatched");
  await page.locator('button:has-text("Mark resolved")').click();
  await page.waitForSelector(".hx-card .hx-st--resolved", { timeout: 6000 });
  const fin = await getJ(`/help/${a.id}`);
  ok(fin.status === "resolved" && fin.resolution === "emergency" && /Ambulance/.test(fin.timeline.at(-1).note), "resolved with reason and note stored", JSON.stringify(fin.status));
  ok((await page.locator('button:has-text("Acknowledge")').count()) === 0 && (await page.locator('.hx-btn-row button:has-text("Resolve")').count()) === 0, "a resolved request offers no more state changes");
  await page.locator('.hx-tabs button:has-text("Resolved")').click();
  ok((await page.locator(".hx-row").count()) === 1, "it moves to the Resolved tab");
  await page.locator('.hx-tabs button:has-text("Needs action")').click();
  ok(/Priya/.test(await txt(page, ".hx-row")), "the other request is still waiting");
  await page.screenshot({ path: "st-inbox.png" });
  ok(errors.length === 0, "no console errors in the inbox flow", errors.join(" | ")); await ctx.close();
}


});
await section('5. deep link, demo patient, placeholder numbers, hide-tests', async () => {
{
  await reset();
  const demo = await alert({ token: "demo", heard: "help", severity: "concern", patient_name: "Priya", source: "test", demo: true });
  const ph = await alert({ token: "run_demoph", heard: "I need help", severity: "concern" });
  const { ctx, page } = await open(`/staff/help?open=${demo.id}`);
  await page.waitForSelector(".hx-card", { timeout: 8000 });
  ok(/Priya/.test(await txt(page, ".hx-card")) && /Demo plan/.test(await txt(page, ".hx-card")), "?open=<id> deep link selects that request, shows the Demo-plan tag");
  ok((await page.locator('a:has-text("Call patient")').count()) === 0 && /no patient record/i.test(await txt(page, ".hx-call-row")), "demo requests have no phone number: call is disabled with the reason");
  await page.locator(".hx-tabs button:has-text('All')").click();
  await page.locator(".hx-row", { hasText: "Demo Placeholder" }).click();
  ok((await page.locator('a:has-text("Call patient")').count()) === 0 && (await page.locator('.rr-btn.is-off:has-text("Call patient")').count()) === 1, "placeholder number +91 00000 00000 is never dialable");
  const before = await page.locator(".hx-row").count();
  await page.locator('.hx-check input').check();
  ok((await page.locator(".hx-row").count()) === before - 1, "'Hide test alerts' removes test requests", `${before} -> ${await page.locator(".hx-row").count()}`);
  void ph; await ctx.close();
}


});
await section('6. idempotent retries and duplicates never double-page', async () => {
{
  await reset();
  const r1 = await alert({ client_id: "k-1" }); const r2 = await alert({ client_id: "k-1" }); const r3 = await alert();
  ok(r1.id === r2.id && r2.duplicate === true, "patient-app retry with the same client_id returns the same request");
  ok(r3.duplicate === true, "the same words from the same patient within 30 s are one request");
  const s = await getJ("/help/summary");
  ok(s.total === 1, "only ONE request exists after 3 identical posts", String(s.total));
  const bad = await post("/help", { token: "../etc", heard: "x", severity: "critical" });
  ok(bad.status === 422, "path-traversal token is refused (422)");
  ok((await post("/help", { token: "run_anita" })).status === 422, "missing fields are refused (422)");
}


});
await section('7. patients list + detail', async () => {
{
  await reset(); await alert({ token: "run_anita" });
  const { ctx, page, errors } = await open("/staff/patients");
  await page.waitForFunction(() => document.querySelectorAll(".hx-queue tbody tr").length === 4, null, { timeout: 8000 });
  ok(/Anita Singh/.test(await txt(page, ".hx-queue tbody tr")), "patient with an open help request is listed first");
  ok(await page.locator(".hx-queue .hx-help-chip.is-critical").count() === 1, "…with a critical help chip");
  await page.locator(".cc-search input").fill("priya");
  ok((await page.locator(".hx-queue tbody tr").count()) === 1, "top-bar search filters the patient list");
  await page.locator(".cc-search input").fill("");
  await page.locator('.hx-tabs button:has-text("Asked for help")').click();
  ok((await page.locator(".hx-queue tbody tr").count()) === 1, "'Asked for help' tab shows only that patient");
  await page.locator('.hx-tabs button:has-text("Approved")').click();
  await page.locator(".hx-queue tbody tr").first().click();
  await page.waitForSelector(".hx-phead");
  ok(/Priya Sharma/.test(await txt(page, ".hx-phead")) && /Approved/.test(await txt(page, ".hx-phead")), "patient detail opens for the approved patient");
  await page.waitForSelector(".hx-plan");
  const plan = await txt(page, ".hx-plan");
  ok(/Paracetamol · 500 mg · Every 6 hours · 5 days/.test(plan) && /Physiotherapy review · in 2 weeks/.test(plan), "approved plan is shown grouped, with readable summaries");
  ok((await page.locator(".hx-edited").count()) === 1, "the edited item is marked 'edited'");
  const act = await txt(page, ".hx-pcol:first-child .hx-timeline");
  ok(/Plan approved and locked \(4 items\)/.test(act) && /Edited field f2/.test(act) && /Document uploaded/.test(act), "activity timeline is human-readable, newest first (damaged audit line ignored)");
  ok((await page.locator('a.rr-btn:has-text("Call")').getAttribute("href")) === "tel:+919811122233", "patient contact has a working Call link");
  ok((await page.locator('.hx-contact .is-off').count()) === 1, "guardian with no number: Call is disabled");
  await page.screenshot({ path: "st-patient.png", fullPage: true });
  await page.locator('button:has-text("Copy patient link")').click({ timeout: 3000 }).catch(() => {});
  await page.goto(base + "/staff/patients/run_anita"); await page.waitForSelector(".hx-phead");
  ok(/1 open help request/.test(await txt(page, ".hx-attn")), "a patient with an open request shows the alert strip");
  ok(/Review plan/.test(await txt(page, ".hx-phead-actions")), "needs-review patient offers 'Review plan'");
  ok(/still need a nurse/.test(await txt(page, ".hx-noplan")), "…and explains the plan is not approved yet");
  ok((await page.locator('.hx-hlist a').count()) === 1, "help history lists the request");
  await page.goto(base + "/staff/patients/nobody"); await page.waitForSelector(".rr-empty");
  ok(/Patient not found/.test(await txt(page, ".rr-empty")), "unknown patient: clear 404 page");
  ok(errors.length === 0, "no console errors on the patient pages", errors.join(" | ")); await ctx.close();
}


});
await section('8. outage, recovery, clock skew, name in audit trail', async () => {
{
  await reset();
  const { ctx, page } = await open("/staff/help");
  await page.waitForSelector(".hx-conn.is-ok");
  await alert();
  await page.waitForSelector(".hx-row", { timeout: 8000 });
  await ctl("/__down?v=1");
  await page.waitForSelector(".hx-conn.is-down", { timeout: 10000 });
  ok(/API offline/.test(await txt(page, ".hx-conn")) && /Cannot reach|Showing the last known/.test(await txt(page, ".rr-error")), "API outage: pill turns red and the inbox says it is showing the last known requests");
  ok((await page.locator(".hx-row").count()) === 1, "…the requests already loaded stay on screen");
  await ctl("/__down?v=0");
  await page.waitForSelector(".hx-conn.is-ok", { timeout: 10000 });
  ok(true, "recovers by itself when the API returns");
  await page.locator(".hx-name-btn").click(); await page.locator(".hx-name-form input").fill("Nurse Mehta"); await page.keyboard.press("Enter");
  ok(/Nurse Mehta/.test(await txt(page, ".cc-user")), "staff name can be set from the top bar");
  await page.locator('.hx-btn-row button:has-text("Acknowledge")').click();
  await page.waitForSelector(".hx-card .hx-st--acknowledged", { timeout: 6000 });
  ok(/Nurse Mehta/.test(await txt(page, ".hx-meta")), "the name is recorded: 'Seen by Nurse Mehta'");
  await reset(); await ctl("/__skew?s=3600");
  await alert({ token: "run_priya", heard: "skew test" });
  await page.locator('.hx-tabs button:has-text("Needs action")').click();
  await page.waitForSelector('.hx-row:has-text("skew test")', { timeout: 9000 });
  await page.locator('.hx-row:has-text("skew test")').click();
  await wait(1200);
  const sla = await txt(page, ".hx-sla");
  ok(!/overdue/.test(sla) && /waiting 00:0\d/.test(sla), "server clock 1 h ahead of the browser: timer still reads 'waiting 00:0x' (clock offset corrected)", sla);
  await ctl("/__skew?s=0"); await ctx.close();
}


});
await section('9. overdue states', async () => {
{
  await reset(); await ctl("/__skew?s=0");
  const a = await alert({ heard: "overdue test" });
  await ctl("/__skew?s=130");           // server believes 130 s have passed: critical SLA is 120 s
  const { ctx, page } = await open("/staff/help");
  await page.waitForSelector(".hx-sla--bad", { timeout: 8000 });
  ok(/overdue by/.test(await txt(page, ".hx-sla")), "critical request past 2 minutes shows 'overdue by …' in red");
  ok(/^1$/.test((await txt(page, ".hx-stat.is-bad:nth-child(2) b")).trim()), "'Past the response target' stat counts it");
  await ctl("/__skew?s=0"); void a; await ctx.close();
}


});
await section('10. responsive', async () => {
for (const [w, h, name] of [[1920, 1080, "1920"], [1280, 800, "1280"], [390, 844, "390"]]) {
  await reset(); await alert(); await alert({ token: "run_priya", heard: "I feel unwell", severity: "concern" });
  for (const path of ["/staff", "/staff/help", "/staff/patients", "/staff/patients/run_priya"]) {
    const { ctx, page, errors } = await open(path, { viewport: { width: w, height: h } });
    await wait(1300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 2, `no horizontal overflow at ${w}px on ${path}`, `${over}px`);
    if (path === "/staff/help" && w === 390) await page.screenshot({ path: "st-inbox-390.png" });
    if (path === "/staff" && w === 1920) await page.screenshot({ path: "st-dashboard-1920.png" });
    ok(errors.length === 0, `no console errors at ${w}px on ${path}`, errors.join(" | ")); await ctx.close();
  }
}


});
await browser.close(); srv.kill();
console.log(out.join("\n")); console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
