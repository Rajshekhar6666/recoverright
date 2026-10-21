import test from "node:test";
import assert from "node:assert/strict";
import { dialable, sendHelpRequest, type HelpPayload } from "../lib/voice/help";

const payload: HelpPayload = { token: "run1", patient_name: "Test", heard: "I need help", severity: "concern", label: "needing help", source: "voice", demo: false, client_time: "2026-01-01T00:00:00Z" };
const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

test("'sent' only on a real 2xx response", async () => {
  let seen: { url: string; body: string } | null = null;
  const r = await sendHelpRequest(payload, { base: "http://api/", fetchImpl: (async (u: string, i: RequestInit) => { seen = { url: u, body: String(i.body) }; return res(201); }) as unknown as typeof fetch });
  assert.equal(r.ok, true);
  assert.equal(seen!.url, "http://api/help");
  assert.equal(JSON.parse(seen!.body).heard, "I need help");
});

test("404 / 500 / network error / timeout / offline are all FAILURES, never 'sent'", async () => {
  const mk = (f: unknown, extra = {}) => sendHelpRequest(payload, { base: "http://api", fetchImpl: f as typeof fetch, timeoutMs: 30, ...extra });
  const a = await mk(async () => res(404)); assert.equal(a.ok, false); assert.match((a as { reason: string }).reason, /404/);
  const b = await mk(async () => res(500)); assert.equal(b.ok, false);
  const c = await mk(async () => { throw new TypeError("fetch failed"); }); assert.equal(c.ok, false);
  const d = await mk((_u: string, i: RequestInit) => new Promise((_r, rej) => { i.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))); })); assert.equal(d.ok, false); assert.match((d as { reason: string }).reason, /in time/);
  const e = await mk(async () => res(200), { isOnline: () => false }); assert.equal(e.ok, false); assert.match((e as { reason: string }).reason, /offline/);
});

test("custom path is honoured", async () => {
  let url = "";
  await sendHelpRequest(payload, { base: "http://api", path: "/staff/alerts", fetchImpl: (async (u: string) => { url = u; return res(200); }) as unknown as typeof fetch });
  assert.equal(url, "http://api/staff/alerts");
});

test("placeholder demo numbers are not dialable", () => {
  assert.equal(dialable("+910000000000"), false);
  assert.equal(dialable(""), false);
  assert.equal(dialable("123"), false);
  assert.equal(dialable("+919876543210"), true);
});
