import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DeviceVitalsService,
  calculateLocalMews,
} from "../src/services/vitals";

describe("DeviceVitalsService & MEWS Calculation", () => {
  const service = new DeviceVitalsService();

  it("calculates normal MEWS score correctly", () => {
    const { score, risk } = calculateLocalMews({
      systolic_bp: 120,
      diastolic_bp: 80,
      heart_rate: 72,
      respiratory_rate: 16,
      temperature: 98.6,
      temperature_unit: "F",
      spo2: 98,
      consciousness: "Alert",
    });
    assert.strictEqual(score, 0);
    assert.strictEqual(risk, "normal");
  });

  it("flags elevated risk for mild tachycardia and tachypnea", () => {
    const { score, risk } = calculateLocalMews({
      systolic_bp: 118,
      heart_rate: 115, // +2
      respiratory_rate: 24, // +2
      temperature: 99.0,
      temperature_unit: "F",
      spo2: 95, // +1
      consciousness: "Alert",
    });
    assert.strictEqual(score, 5);
    assert.strictEqual(risk, "medium_high");
  });

  it("flags critical risk for severe hypotension and hypoxia", () => {
    const { score, risk } = calculateLocalMews({
      systolic_bp: 68, // +3
      heart_rate: 135, // +3
      respiratory_rate: 32, // +3
      temperature: 101.5,
      temperature_unit: "F",
      spo2: 87, // +3
      consciousness: "Voice",
    });
    assert.ok(score >= 7);
    assert.strictEqual(risk, "critical");
  });

  it("records vitals reading and maintains history timeline", async () => {
    const record = await service.recordVitals("test_tok", {
      systolic_bp: 125,
      diastolic_bp: 84,
      heart_rate: 75,
      respiratory_rate: 16,
      temperature: 36.8,
      temperature_unit: "C",
      spo2: 99,
      consciousness: "Alert",
    });
    assert.ok(record.id);
    assert.strictEqual(record.mews_score, 0);
    assert.strictEqual(service.getHistory().length >= 1, true);
  });
});
