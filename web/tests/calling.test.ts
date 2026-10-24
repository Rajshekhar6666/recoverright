import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { api, API } from "../lib/api";
import { DICTIONARY } from "../lib/i18n";
import type { CallRecord, CallStatus } from "../lib/types";

describe("real-time calling types and API contracts", () => {
  test("mock CallRecord adheres to contract schema", () => {
    const record: CallRecord = {
      call_id: "call_abc123",
      run_id: "run_demo_straightforward",
      caller_role: "staff",
      caller_name: "Nurse Sarah, RN",
      target_role: "patient",
      status: "ended",
      created_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: 45,
      end_reason: "hangup",
    };

    assert.equal(record.call_id, "call_abc123");
    assert.equal(record.caller_role, "staff");
    assert.equal(record.target_role, "patient");
    assert.equal(record.duration_seconds, 45);
    assert.equal(record.status, "ended");
  });

  test("getIceServers requests the /calls/config/ice endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          ice_servers: [
            { urls: ["stun:stun.l.google.com:19302"] },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await api.getIceServers();
      assert.equal(requestedUrl, `${API}/calls/config/ice`);
      assert.ok(res.ice_servers.length > 0);
      assert.equal(res.ice_servers[0].urls[0], "stun:stun.l.google.com:19302");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("getCallHistory and getActiveCall query the correct patient endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("/history/")) {
        return {
          ok: true,
          json: async () => [
            {
              call_id: "c1",
              run_id: "run_p1",
              caller_role: "staff",
              caller_name: "Nurse",
              target_role: "patient",
              status: "ended",
              created_at: "2026-10-23T10:00:00Z",
              duration_seconds: 60,
            },
          ],
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ active: false, session: null }),
      } as Response;
    }) as typeof fetch;

    try {
      const hist = await api.getCallHistory("run_p1");
      const active = await api.getActiveCall("run_p1");

      assert.equal(urls[0], `${API}/calls/history/run_p1`);
      assert.equal(urls[1], `${API}/calls/active/run_p1`);
      assert.equal(hist.length, 1);
      assert.equal(hist[0].duration_seconds, 60);
      assert.equal(active.active, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("endCallRest dispatches proper payload and parameters", async () => {
    const originalFetch = globalThis.fetch;
    let sentMethod = "";
    let sentBody: any = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sentMethod = init?.method || "";
      sentBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await api.endCallRest("call_999", "patient_hangup", 75);
      assert.equal(sentMethod, "POST");
      assert.equal(sentBody.call_id, "call_999");
      assert.equal(sentBody.reason, "patient_hangup");
      assert.equal(sentBody.duration_seconds, 75);
      assert.equal(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("bilingual calling dictionary completeness", () => {
  const callKeys = [
    "callPatient",
    "callCareTeam",
    "callNurse",
    "incomingCall",
    "incomingCallFrom",
    "acceptCall",
    "declineCall",
    "endCall",
    "muteMic",
    "unmuteMic",
    "mutedStatus",
    "callingPatient",
    "callingCareTeam",
    "ringingStatus",
    "connectingAudio",
    "callConnected",
    "callEnded",
    "callDeclined",
    "patientOffline",
    "staffOffline",
    "micPermissionRequired",
    "callDuration",
    "patientOnlineStatus",
    "patientOfflineStatus",
    "callHistoryTitle",
    "noCallsYet",
    "dockCall",
    "expandCall",
  ] as const;

  test("all calling keys exist in English and Hindi with non-empty translations", () => {
    for (const key of callKeys) {
      const enVal = (DICTIONARY.en as any)[key];
      const hiVal = (DICTIONARY.hi as any)[key];

      assert.ok(enVal !== undefined && enVal !== null, `Missing English key: ${key}`);
      assert.ok(hiVal !== undefined && hiVal !== null, `Missing Hindi key: ${key}`);

      if (typeof enVal === "string") {
        assert.ok(enVal.trim().length > 0, `Empty English translation for ${key}`);
        assert.ok((hiVal as string).trim().length > 0, `Empty Hindi translation for ${key}`);
      } else if (typeof enVal === "function") {
        assert.equal(typeof hiVal, "function", `Hindi translation for ${key} must be a function`);
        assert.ok(enVal("Test").length > 0);
        assert.ok(hiVal("Test").length > 0);
      }
    }
  });
});
