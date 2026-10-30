import { describe, it } from "node:test";
import assert from "node:assert";
import { VoiceAssistantService } from "../src/services/voiceAssistant";

describe("VoiceAssistantService", () => {
  const service = new VoiceAssistantService();

  it("evaluates emergency distress intents accurately in English", () => {
    const res = service.evaluateLocalIntent("I have severe chest pain and can't breathe", "en");
    assert.strictEqual(res.intent, "emergency");
    assert.strictEqual(res.isEmergency, true);
    assert.ok(res.replyText.includes("care team has been notified"));
  });

  it("evaluates emergency distress intents in Hindi", () => {
    const res = service.evaluateLocalIntent("bachao seene mein dard ho raha hai", "hi");
    assert.strictEqual(res.intent, "emergency");
    assert.strictEqual(res.isEmergency, true);
    assert.ok(res.replyText.includes("आपातकालीन"));
  });

  it("evaluates medication queries and references prescription plan", () => {
    const res = service.evaluateLocalIntent("What medicine should I take now?", "en");
    assert.strictEqual(res.intent, "medication_query");
    assert.strictEqual(res.isEmergency, false);
    assert.ok(res.references.includes("Prescribed Recovery Plan"));
  });

  it("warns against unprescribed drug interactions", () => {
    const res = service.evaluateLocalIntent("Can I take aspirin for fever?", "en");
    assert.strictEqual(res.intent, "drug_interaction");
    assert.ok(res.replyText.includes("Caution"));
  });

  it("tracks multi-turn message history", async () => {
    service.clearMessages();
    assert.strictEqual(service.getMessages().length, 0);

    const asst = await service.sendSpokenMessage("token_test", "What are my medicines?");
    const msgs = service.getMessages();
    assert.strictEqual(msgs.length, 2);
    assert.strictEqual(msgs[0].sender, "patient");
    assert.strictEqual(msgs[1].sender, "assistant");
  });
});
