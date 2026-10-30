import { describe, it } from "node:test";
import assert from "node:assert";
import { PatientCallManager } from "../src/services/calling";

describe("PatientCallManager", () => {
  it("manages call state transitions and audio controls", () => {
    const manager = new PatientCallManager("http://127.0.0.1:8000");

    assert.strictEqual(manager.getState().status, "idle");

    // 1. Initiate outbound call
    const callId = manager.initiateCallToNurse("Nurse Priya");
    assert.ok(callId.startsWith("call_"));
    assert.strictEqual(manager.getState().status, "ringing");
    assert.strictEqual(manager.getState().nurse_name, "Nurse Priya");

    // 2. Toggle mute and speakerphone
    assert.strictEqual(manager.getState().is_muted, false);
    manager.toggleMute();
    assert.strictEqual(manager.getState().is_muted, true);

    assert.strictEqual(manager.getState().is_speaker, true);
    manager.toggleSpeaker();
    assert.strictEqual(manager.getState().is_speaker, false);

    // 3. End call
    manager.endCall("patient_hangup");
    assert.strictEqual(manager.getState().status, "idle");
    assert.strictEqual(manager.getState().call_id, null);
  });
});
