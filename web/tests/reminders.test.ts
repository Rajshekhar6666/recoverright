import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../lib/api";
import type { ReminderJob } from "../lib/types";

test("reminder types and API structure", async (t) => {
  await t.test("mock reminder adheres to ReminderJob contract", () => {
    const job: ReminderJob = {
      job_id: "rem_run1_0800_m1",
      run_id: "run1",
      plan_version: 1,
      medication_id: "m1",
      medication_name: "Paracetamol",
      dose: "500 mg",
      scheduled_time: "08:00 AM",
      scheduled_date: "2026-10-23",
      timezone: "Asia/Kolkata",
      channel: "in_app",
      status: "scheduled",
      attempts: 0,
      max_retries: 3,
      last_attempt_at: null,
      delivered_at: null,
      acknowledged_at: null,
      snooze_until: null,
      error: null,
      message_body: "Time for Paracetamol 500 mg",
    };

    assert.equal(job.status, "scheduled");
    assert.equal(job.acknowledged_at, null);
    assert.equal(job.channel, "in_app");
    assert.equal(job.attempts, 0);
  });

  await t.test("triggerReminder sends proper payload and channels", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody = "";

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = String(init?.body || "");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "rem_1",
            status: "delivered",
            delivery_logs: [{ channel: "sms", status: "delivered", recipient: "+91 98765 43210" }],
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.triggerReminder("token_test", "rem_1", "sms", false);
      assert.match(requestedUrl, /\/plans\/token_test\/reminders\/rem_1\/trigger$/);
      assert.equal(requestedMethod, "POST");
      assert.deepEqual(JSON.parse(requestedBody), { channel: "sms", simulate_failure: false });
      assert.equal(res.status, "delivered");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("snoozeReminderJob dispatches minutes and patient role", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody = "";

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = String(init?.body || "");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "rem_1",
            status: "snoozed",
            snoozed_until: "2026-10-23T08:15:00Z",
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.snoozeReminderJob("token_test", "rem_1", 15);
      assert.match(requestedUrl, /\/plans\/token_test\/reminders\/rem_1\/snooze$/);
      assert.deepEqual(JSON.parse(requestedBody), { minutes: 15, by: "patient" });
      assert.equal(res.status, "snoozed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("ackReminderJob sends acknowledged true and acknowledgement channel", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody = "";

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = String(init?.body || "");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            job_id: "rem_1",
            status: "acknowledged",
            acknowledged_at: "2026-10-23T08:05:00Z",
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.ackReminderJob("token_test", "rem_1", "voice_assistant");
      assert.match(requestedUrl, /\/plans\/token_test\/reminders\/rem_1\/acknowledge$/);
      assert.deepEqual(JSON.parse(requestedBody), { acknowledged: true, via: "voice_assistant" });
      assert.equal(res.status, "acknowledged");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
