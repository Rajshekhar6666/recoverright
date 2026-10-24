import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../lib/api";
import type { CaregiverNotification, CaregiverPatientView } from "../lib/types";

test("caregiver types and API contracts", async (t) => {
  await t.test("mock CaregiverPatientView adheres to contract schema", () => {
    const view: CaregiverPatientView = {
      run_id: "run_test_123",
      patient_name: "Ramesh Kumar",
      language: "en",
      caregiver_name: "Ananya Kumar",
      relationship: "daughter",
      phone: "+91 98765 43210",
      consent_status: "consented",
      notification_preferences: ["sms", "whatsapp"],
      plan_duration_days: 10,
      approved_at: new Date().toISOString(),
      adherence_rate: 85.0,
      tasks_today: [
        {
          task_id: "task_1",
          run_id: "run_test_123",
          plan_version: 1,
          category: "medication",
          title: "Take Amoxicillin",
          description: "Take 500 mg by mouth",
          scheduled_time: "08:00 AM",
          scheduled_date: "2026-10-23",
          status: "completed",
        },
      ],
      medications: [
        {
          id: "med_1",
          name: "Amoxicillin",
          dose: "500 mg",
          route: "Oral",
          frequency: "Three times daily",
          duration: "7 days",
          times: ["08:00 AM", "02:00 PM", "08:00 PM"],
        },
      ],
      instructions: {
        wound_care: ["Keep dressing dry and clean"],
        activity: ["Gentle walks around the house"],
        diet: ["High protein, low sodium"],
        warning_signs: ["Fever over 101F"],
      },
      follow_ups: [
        {
          id: "fu_1",
          what: "Surgical wound inspection",
          when: "in 7 days",
          where: "Clinic Room 302",
        },
      ],
      active_help: null,
      recent_notifications: [],
    };

    assert.equal(view.run_id, "run_test_123");
    assert.equal(view.patient_name, "Ramesh Kumar");
    assert.equal(view.caregiver_name, "Ananya Kumar");
    assert.equal(view.consent_status, "consented");
    assert.equal(view.adherence_rate, 85.0);
    assert.equal(view.tasks_today.length, 1);
    assert.equal(view.medications.length, 1);
  });

  await t.test("getCaregiverPatientView makes correct GET request", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    try {
      globalThis.fetch = (async (url: string | URL | Request) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            run_id: "run_1",
            patient_name: "Ramesh Kumar",
            language: "en",
            caregiver_name: "Ananya Kumar",
            relationship: "daughter",
            phone: "+91 98765 43210",
            consent_status: "consented",
            notification_preferences: ["sms"],
            adherence_rate: 90,
            tasks: [],
            medications: [],
            instructions: {},
            follow_ups: [],
            active_emergency: null,
            recent_notifications: [],
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.getCaregiverPatientView("cg_tok_123");
      assert.match(requestedUrl, /\/caregivers\/cg_tok_123\/patient$/);
      assert.equal(res.patient_name, "Ramesh Kumar");
      assert.equal(res.consent_status, "consented");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("updateCaregiverConsent sends consent status and preferences", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody: any = null;

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = JSON.parse(String(init?.body || "{}"));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            caregiver: {
              name: "Ananya Kumar",
              consent_status: "consented",
              notification_preferences: ["sms", "whatsapp"],
            },
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.updateCaregiverConsent("cg_tok_123", "consented", ["sms", "whatsapp"]);
      assert.match(requestedUrl, /\/caregivers\/cg_tok_123\/consent$/);
      assert.equal(requestedMethod, "POST");
      assert.equal(requestedBody.consent_status, "consented");
      assert.deepEqual(requestedBody.notification_preferences, ["sms", "whatsapp"]);
      assert.equal(res.status, "success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("caregiverTaskAction sends complete action", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody: any = null;

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = JSON.parse(String(init?.body || "{}"));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            task_id: "task_med_1",
            status: "completed",
            completed_by: "caregiver",
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.caregiverTaskAction("cg_tok_123", "task_med_1", "complete");
      assert.match(requestedUrl, /\/caregivers\/cg_tok_123\/tasks\/task_med_1\/action$/);
      assert.equal(requestedMethod, "POST");
      assert.equal(requestedBody.action, "complete");
      assert.equal(res.status, "completed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("caregiverReportDose submits confirmation for prescribed medication", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedMethod = "";
    let requestedBody: any = null;

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url);
        requestedMethod = init?.method || "GET";
        requestedBody = JSON.parse(String(init?.body || "{}"));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            record_id: "dose_123",
            run_id: "run_1",
            medication_id: "med_1",
            taken: true,
            reported_via: "caregiver_portal",
            notes: "Given with lunch",
          }),
        } as Response;
      }) as typeof fetch;

      const res = await api.caregiverReportDose("cg_tok_123", "med_1", true, "Given with lunch");
      assert.match(requestedUrl, /\/caregivers\/cg_tok_123\/medications\/med_1\/report-dose$/);
      assert.equal(requestedMethod, "POST");
      assert.equal(requestedBody.taken, true);
      assert.equal(requestedBody.notes, "Given with lunch");
      assert.equal(res.reported_via, "caregiver_portal");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test("notifyCaregiver and listCaregiverNotifications dispatch and return logs", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrls: string[] = [];

    try {
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrls.push(String(url));
        if (init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              notification_id: "notif_1",
              recipient_phone: "+91 98765 43210",
              notification_type: "emergency",
              channel: "sms",
              status: "delivered",
              message: "EMERGENCY: Patient distress",
              created_at: new Date().toISOString(),
            }),
          } as Response;
        } else {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                notification_id: "notif_1",
                recipient_phone: "+91 98765 43210",
                notification_type: "emergency",
                channel: "sms",
                status: "delivered",
                message: "EMERGENCY: Patient distress",
                created_at: new Date().toISOString(),
              },
            ],
          } as Response;
        }
      }) as typeof fetch;

      const notif = await api.notifyCaregiver("cg_tok_123", "emergency", "sms");
      assert.equal(notif.status, "delivered");
      assert.equal(notif.notification_type, "emergency");

      const notifs = await api.listCaregiverNotifications("cg_tok_123");
      assert.equal(notifs.length, 1);
      assert.equal(notifs[0].notification_id, "notif_1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
