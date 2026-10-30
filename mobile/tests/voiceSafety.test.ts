import { describe, it } from "node:test";
import assert from "node:assert";
import { BackgroundVoiceSafetyService } from "../src/services/voiceSafety";

describe("BackgroundVoiceSafetyService", () => {
  const service = new BackgroundVoiceSafetyService();

  it("identifies critical distress phrases in English", () => {
    const r1 = service.analyzeUtterance("Help me please, I cannot breathe!");
    assert.strictEqual(r1.detected, true);
    assert.strictEqual(r1.severity, "critical");

    const r2 = service.analyzeUtterance("Oh no, I fell on the bathroom floor");
    assert.strictEqual(r2.detected, true);
    assert.strictEqual(r2.severity, "critical");

    const r3 = service.analyzeUtterance("I have severe chest pain");
    assert.strictEqual(r3.detected, true);
    assert.strictEqual(r3.severity, "critical");
  });

  it("identifies critical distress phrases in Hindi (Devanagari & Romanized)", () => {
    // Devanagari
    const r1 = service.analyzeUtterance("कृपया कोई बचाओ मुझे!");
    assert.strictEqual(r1.detected, true);
    assert.strictEqual(r1.severity, "critical");
    assert.strictEqual(r1.language, "hi");

    const r2 = service.analyzeUtterance("सांस नहीं आ रही है डॉक्टर");
    assert.strictEqual(r2.detected, true);
    assert.strictEqual(r2.severity, "critical");

    // Romanized
    const r3 = service.analyzeUtterance("bachao jaldi!");
    assert.strictEqual(r3.detected, true);
    assert.strictEqual(r3.severity, "critical");

    const r4 = service.analyzeUtterance("mujhe bahut zyada dard ho raha hai");
    assert.strictEqual(r4.detected, true);
    assert.strictEqual(r4.severity, "critical");
  });

  it("ignores non-distress conversational speech without false alarms", () => {
    const benignPhrases = [
      "Can you pass me a glass of water?",
      "The cricket match was very exciting today",
      "I am watching television in the living room",
      "खाना बहुत स्वादिष्ट था (The food was delicious)",
    ];

    for (const phrase of benignPhrases) {
      const res = service.analyzeUtterance(phrase);
      assert.strictEqual(res.detected, false, `Expected no false alarm for: "${phrase}"`);
    }
  });

  it("respects background listening toggle and deduplication window", () => {
    service.stopListening();
    assert.strictEqual(service.processAmbientAudioChunk("Help me!"), null);

    service.startListening();
    let callbackCount = 0;
    const unsub = service.onDistressDetected(() => {
      callbackCount++;
    });

    // First call fires
    const first = service.processAmbientAudioChunk("Help me emergency!");
    assert.ok(first?.detected);
    assert.strictEqual(callbackCount, 1);

    // Immediate repeat within dedupe window should be suppressed
    const second = service.processAmbientAudioChunk("Help me emergency!");
    assert.strictEqual(second, null);
    assert.strictEqual(callbackCount, 1);

    unsub();
  });
});
