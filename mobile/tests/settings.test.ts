import { describe, it } from "node:test";
import assert from "node:assert";
import {
  deviceSettings,
  isValidServerUrl,
  SUPPORTED_LANGUAGES,
} from "../src/services/settings";
import {
  BACKGROUND_MEDICATION_CHECK,
  BACKGROUND_SYNC_FETCH,
  mobileTaskManager,
} from "../src/services/backgroundTasks";

describe("DeviceSettingsService & BackgroundTaskManager", () => {
  it("validates server URLs accurately", () => {
    assert.strictEqual(isValidServerUrl("http://127.0.0.1:8000"), true);
    assert.strictEqual(isValidServerUrl("https://recoverright.hospital.org"), true);
    assert.strictEqual(isValidServerUrl("http://192.168.1.105:8000/api"), true);

    // Invalid URLs
    assert.strictEqual(isValidServerUrl("ftp://hospital.com"), false);
    assert.strictEqual(isValidServerUrl("not_a_url"), false);
    assert.strictEqual(isValidServerUrl(""), false);
    assert.strictEqual(isValidServerUrl(null as any), false);
  });

  it("updates server URL and rejects invalid values", () => {
    assert.strictEqual(deviceSettings.updateServerUrl("https://hospital.org/api"), true);
    assert.strictEqual(deviceSettings.getSettings().serverUrl, "https://hospital.org/api");
    assert.strictEqual(deviceSettings.updateServerUrl("invalid"), false);
  });

  it("provides required multilingual languages and validates them", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    assert.ok(codes.includes("en"), "English must be supported");
    assert.ok(codes.includes("hi"), "Hindi must be supported");
    assert.ok(codes.includes("mr"), "Marathi must be supported");
    assert.ok(codes.includes("ta"), "Tamil must be supported");

    assert.strictEqual(deviceSettings.setLanguage("hi"), true);
    assert.strictEqual(deviceSettings.getSettings().language, "hi");
    assert.strictEqual(deviceSettings.setLanguage("unsupported_lang"), false);
  });

  it("registers background tasks properly and verifies them", () => {
    assert.strictEqual(
      mobileTaskManager.isTaskDefined(BACKGROUND_MEDICATION_CHECK),
      true,
      "Medication check task should be defined"
    );
    assert.strictEqual(
      mobileTaskManager.isTaskDefined(BACKGROUND_SYNC_FETCH),
      true,
      "Sync fetch task should be defined"
    );
  });

  it("executes background tasks safely without crashing", async () => {
    const medResult = await mobileTaskManager.runTask(BACKGROUND_MEDICATION_CHECK);
    assert.strictEqual(medResult.status, "success");
    assert.ok(typeof medResult.overdue_count === "number");

    const syncResult = await mobileTaskManager.runTask(BACKGROUND_SYNC_FETCH);
    assert.strictEqual(syncResult.status, "success");
  });
});
