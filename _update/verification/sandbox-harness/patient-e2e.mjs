import { chromium } from "/home/claude/.npm-global/lib/node_modules/playwright/index.mjs";
import { start } from "./server.mjs";
import fs from "node:fs";
const { srv, state, port } = await start(4173);
const base = `http://localhost:${port}`;
let pass = 0, fail = 0; const results = [];
const ok = (cond, name, extra = "") => { (cond ? pass++ : fail++); results.push(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`); };
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 900 }, permissions: opts.deny ? [] : ["microphone"] });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript({ path: "fake-speech.js" });
  if (opts.autoOpen === false) await page.addInitScript(() => { window.__autoOpen = false; });
  return { ctx, page, errors };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alertVisible = (page) => page.locator('[role="alertdialog"]').isVisible();

// ---------- 1. honest status: not "Listening" until audio really starts
{
  const { ctx, page, errors } = await newPage({ autoOpen: false });
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-voice");
  await wait(600);
  const t1 = await page.locator(".pt-mic-state").innerText();
  ok(!/Listening/i.test(t1) || /Opening/i.test(t1), "UI does not claim 'Listening' before the browser opens audio", t1);
  await page.evaluate(() => { const r = window.__recs.at(-1); r.onstart(); r.onaudiostart(); });
  await page.waitForFunction(() => /Listening/.test(document.querySelector(".pt-mic-state")?.textContent || ""));
  ok(true, "UI shows 'Listening' once audio has started");
  const total = await page.evaluate(() => window.__recs.length);
  const permCalls = await page.evaluate(() => window.__permCalls);
  ok(permCalls === 2, "React StrictMode double-mount really happened (the mount effect ran " + permCalls + " times)", String(permCalls));
  ok((await page.evaluate(() => window.__recs.filter((r) => r.alive).length)) === 1, "...yet exactly ONE recognizer is alive (the stale one was shut down)");
  await wait(4000);
  const after = await page.evaluate(() => ({ alive: window.__recs.filter((r) => r.alive).length, created: window.__recs.length }));
  ok(after.alive === 1 && after.created === total, "no restart ping-pong after 4 s: still one alive, none newly created", JSON.stringify(after));
  await ctx.close();
}

// ---------- 2. every phrase from the brief opens the emergency screen and sends a real request
for (const phrase of ["I feel unwell", "I need help", "chest pain", "I feel dizzy", "I can't breathe"]) {
  const { ctx, page } = await newPage();
  state.helpStatus = 201; await fetch(`${base}/__reset`);
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok", { timeout: 5000 });
  await page.evaluate((p) => window.__say([{ text: p, final: false }]), phrase);
  await page.waitForSelector('[role="alertdialog"]', { timeout: 2000 }).catch(() => {});
  ok(await alertVisible(page), `"${phrase}" opens the emergency screen immediately (interim result)`);
  await page.waitForSelector(".pt-alert-status.is-sent", { timeout: 3000 }).catch(() => {});
  const posts = await (await fetch(`${base}/__posts`)).json();
  ok(posts.length === 1 && posts[0].heard === phrase && posts[0].source === "voice", `"${phrase}" produced exactly one real POST /help`, JSON.stringify(posts));
  ok(/Your care team was alerted/.test(await page.locator(".pt-alert-status").innerText()), `"${phrase}": says 'alerted' only after the 201`);
  const spoken = await page.evaluate(() => window.__spoken.join(" | "));
  ok(/alert your care team/i.test(spoken), `"${phrase}": app speaks aloud`, spoken);
  await ctx.close();
}

// ---------- 3. truthfulness: failure must say NOT sent
{
  const { ctx, page } = await newPage();
  state.helpStatus = 404; await fetch(`${base}/__reset`);
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say(["I need help"]));
  await page.waitForSelector('[role="alertdialog"]');
  await page.waitForSelector(".pt-alert-status.is-failed", { timeout: 15000 });
  const txt = await page.locator(".pt-alert-status").innerText();
  ok(/NOT been sent/i.test(txt) && !/was alerted/i.test(txt), "404 from backend -> 'Help has NOT been sent', never 'alerted'", txt);
  const posts = await (await fetch(`${base}/__posts`)).json();
  ok(posts.length === 3, "automatic retries: 3 attempts made", String(posts.length));
  ok(await page.locator("text=Try sending the alert again").isVisible(), "retry button offered");
  // closing a failed alert needs a second, explicit tap
  await page.locator('button:has-text("I’m okay")').click();
  ok(await alertVisible(page), "first tap on 'I'm okay' does NOT silently close an un-sent alert");
  ok(/not been notified/i.test(await page.locator('[role="alertdialog"]').innerText()), "warns that the care team was not notified");
  state.helpStatus = 201;
  await page.locator("text=Try sending the alert again").click();
  await page.waitForSelector(".pt-alert-status.is-sent", { timeout: 3000 });
  ok(true, "manual retry succeeds once backend is back, then shows 'alerted'");
  await ctx.close();
}

// ---------- 4. demo number is a placeholder: no dialable call button
{
  const { ctx, page } = await newPage();
  state.helpStatus = 201;
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say(["help"]));
  await page.waitForSelector('[role="alertdialog"]');
  const dialogText = await page.locator('[role="alertdialog"]').innerText();
  const telLinks = await page.locator('[role="alertdialog"] a[href^="tel:"]').count();
  ok(telLinks === 0 && /placeholder number/i.test(dialogText), "demo plan never offers to dial +91 00000 00000", `${telLinks} tel links`);
  await page.screenshot({ path: "shot-alert.png" });
  await ctx.close();
}

// ---------- 5. dismissal + immediate second emergency (the old 20 s cooldown bug)
{
  const { ctx, page } = await newPage();
  state.helpStatus = 201; await fetch(`${base}/__reset`);
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say([{ text: "I feel unwell", final: true }]));
  await page.waitForSelector(".pt-alert-status.is-sent");
  await page.locator('button:has-text("I’m okay")').click();
  await page.waitForSelector('[role="alertdialog"]', { state: "detached" });
  ok(true, "alert closes after it was really sent, with one tap");
  ok(/Alert closed/.test(await page.locator(".pt-toast").innerText()), "visible confirmation toast after closing");
  await page.evaluate(() => window.__say([{ text: "I feel unwell", final: true }, { text: "chest pain", final: true }], 1));
  await page.waitForSelector('[role="alertdialog"]', { timeout: 2000 }).catch(() => {});
  ok(await alertVisible(page), "emergency right after dismissal is NOT swallowed");
  await ctx.close();
}

// ---------- 6. echo: the app's own speech must not re-trigger
{
  const { ctx, page } = await newPage();
  state.helpStatus = 201; await fetch(`${base}/__reset`);
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say(["I need help"]));
  await page.waitForSelector('[role="alertdialog"]');
  await page.evaluate(() => window.__say(["I heard you it sounds like you may be needing help"]));
  await wait(300);
  const posts = await (await fetch(`${base}/__posts`)).json();
  ok(posts.length === 1, "no duplicate alert while the alert is open / app is speaking", String(posts.length));
  await ctx.close();
}

// ---------- 7. negation + benign speech do nothing
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  for (const s of ["I feel fine", "no chest pain today", "can you help me understand my tablets", "I'm not dizzy"]) {
    await page.evaluate((x) => window.__say([x]), s);
  }
  await wait(300);
  ok(!(await alertVisible(page)), "benign/negated sentences do not raise an alarm");
  ok(/I heard/.test(await page.locator(".pt-heard").innerText()), "live 'I heard: …' feedback is visible");
  await ctx.close();
}

// ---------- 8. medicine by voice and by tap, persisted on this device
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say(["I took my medicine"]));
  await page.waitForSelector(".pt-toast");
  ok(/Marked .* as taken/.test(await page.locator(".pt-toast").innerText()), "voice 'I took my medicine' -> visible toast");
  ok((await page.locator(".pt-dose.is-on").count()) === 1, "one dose chip is ticked");
  ok(/saved on this device only|stay on this device only/i.test(await page.locator(".pt-local").innerText()), "persistence honestly labelled 'this device only'");
  ok(/marked/i.test(await page.evaluate(() => window.__spoken.join(" "))), "voice confirmation is spoken");
  await page.locator(".pt-dose:not(.is-on)").first().click();
  ok((await page.locator(".pt-dose.is-on").count()) === 2, "tapping a dose chip ticks it");
  await page.reload(); await page.waitForSelector(".pt-dose");
  ok((await page.locator(".pt-dose.is-on").count()) === 2, "ticks survive a reload (local only)");
  await ctx.close();
}

// ---------- 9. permission denied / unsupported / network
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__err("not-allowed"));
  await page.waitForSelector(".pt-mic-state.is-bad");
  ok(/blocked/i.test(await page.locator(".pt-mic-state").innerText()) && await page.locator('button:has-text("Try again")').isVisible(), "not-allowed -> 'Microphone blocked' + Try again");
  await ctx.close();
  const c2 = await newPage();
  await c2.page.goto(`${base}/p?t=demo`); await c2.page.waitForSelector(".pt-mic-state.is-ok");
  const before = await c2.page.evaluate(() => window.__starts);
  await c2.page.evaluate(() => window.__err("network"));
  await wait(200);
  ok(/Reconnecting/i.test(await c2.page.locator(".pt-mic-state").innerText()), "network error -> honest 'Reconnecting…', not 'Listening'");
  await c2.ctx.close();
  const c3 = await browser.newContext(); const p3 = await c3.newPage();
  await p3.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await p3.goto(`${base}/p?t=demo`); await p3.waitForSelector(".pt-voice");
  ok(/not supported/i.test(await p3.locator(".pt-mic-state").innerText()), "no SpeechRecognition -> 'Voice not supported'");
  ok(await p3.locator('button:has-text("I need help now")').isVisible(), "…and the manual 'I need help now' button is still there");
  await c3.close();
}

// ---------- 10. manual button works with no microphone at all
{
  const c = await browser.newContext(); const p = await c.newPage();
  await p.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; window.__API__ = location.origin; });
  state.helpStatus = 201; await fetch(`${base}/__reset`);
  await p.goto(`${base}/p?t=demo`); await p.waitForSelector(".pt-voice");
  await p.locator('button:has-text("I need help now")').click();
  await p.waitForSelector(".pt-alert-status.is-sent", { timeout: 3000 });
  const posts = await (await fetch(`${base}/__posts`)).json();
  ok(posts.length === 1 && posts[0].source === "button", "manual help button sends a real alert even with no microphone", JSON.stringify(posts));
  await c.close();
}

// ---------- 11. test-phrase box
{
  const { ctx, page } = await newPage();
  state.helpStatus = 201; await fetch(`${base}/__reset`);
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-voice");
  await page.locator(".pt-test summary").click();
  await page.locator('.pt-test-chips button:has-text("chest pain")').click();
  await page.waitForSelector(".pt-alert-status.is-sent", { timeout: 3000 });
  const posts = await (await fetch(`${base}/__posts`)).json();
  ok(posts[0]?.source === "test", "typed test phrase goes through the same pipeline and is marked source=test");
  await ctx.close();
}

// ---------- screenshots + mobile layout
{
  const { ctx, page, errors } = await newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.screenshot({ path: "shot-patient-mobile.png", fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, "no horizontal overflow at 390px");
  ok(errors.length === 0, "no console/page errors during the mobile run", errors.join(" ; "));
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}/p?t=demo`); await page.waitForSelector(".pt-mic-state.is-ok");
  await page.evaluate(() => window.__say(["I can't breathe"]));
  await page.waitForSelector(".pt-alert-status.is-sent");
  await page.screenshot({ path: "shot-alert-critical.png" });
  await page.locator('button:has-text("I’m okay")').click();
  await page.waitForSelector('[role="alertdialog"]', { state: "detached" });
  await page.screenshot({ path: "shot-patient-desktop.png", fullPage: true });
  await ctx.close();
}

await browser.close(); srv.close();
console.log(results.join("\n")); console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
