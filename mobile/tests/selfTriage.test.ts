import { describe, it } from "node:test";
import assert from "node:assert";
import { apiClient } from "../src/api/client";

describe("Self-Care Triage & Hospital Fetch Mobile API Client", () => {
  it("has selfRegister and fetchHospitalPlan methods", () => {
    assert.strictEqual(typeof apiClient.selfRegister, "function");
    assert.strictEqual(typeof apiClient.fetchHospitalPlan, "function");
  });

  it("formats selfRegister payloads properly", async () => {
    // Intercept fetch or verify interface
    const origFetch = globalThis.fetch;
    try {
      let calledUrl = "";
      let calledBody: any = null;

      globalThis.fetch = (async (url: any, opts: any) => {
        calledUrl = String(url);
        calledBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            severity: "non_severe",
            is_auto_approved: true,
            plan_duration_days: 10,
            status: "approved",
            patient_token: "pat_test_123",
          }),
        };
      }) as any;

      const res = await apiClient.selfRegister({
        patient_name: "Rahul",
        phone: "9876543210",
        diagnosis_or_symptoms: "Viral fever",
        preferred_duration_days: 10,
      });

      assert.ok(calledUrl.includes("/patients/self-register"));
      assert.strictEqual(calledBody.patient_name, "Rahul");
      assert.strictEqual(res.is_auto_approved, true);
      assert.strictEqual(res.status, "approved");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles hospital-fetch with hospital name and phone", async () => {
    const origFetch = globalThis.fetch;
    try {
      let calledUrl = "";
      let calledBody: any = null;

      globalThis.fetch = (async (url: any, opts: any) => {
        calledUrl = String(url);
        calledBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            status: "connected",
            hospital_name: "AIIMS New Delhi",
            patient_token: "pat_aiims_001",
            is_approved: true,
          }),
        };
      }) as any;

      const res = await apiClient.fetchHospitalPlan("9876543210", "AIIMS New Delhi");
      assert.ok(calledUrl.includes("/patients/hospital-fetch"));
      assert.strictEqual(calledBody.hospital_name, "AIIMS New Delhi");
      assert.strictEqual(res.status, "connected");
      assert.strictEqual(res.is_approved, true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
