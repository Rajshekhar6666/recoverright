import { describe, it } from "node:test";
import assert from "node:assert";
import { DeviceSecurityService } from "../src/services/security";

describe("DeviceSecurityService", () => {
  const service = new DeviceSecurityService();

  it("manages patient session lifecycle and TTL expiration", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    service.setSession({
      sessionToken: "psess_test123",
      patientToken: "pat_test123",
      patientName: "Ramesh Kumar",
      phone: "9876543210",
      expiresAt: futureDate,
    });

    const active = service.getSession();
    assert.ok(active);
    assert.strictEqual(active.patientName, "Ramesh Kumar");

    // Expired session test
    const pastDate = new Date(Date.now() - 1000).toISOString();
    service.setSession({
      sessionToken: "psess_expired",
      patientToken: "pat_expired",
      patientName: "Expired User",
      phone: "9876543210",
      expiresAt: pastDate,
    });
    assert.strictEqual(service.getSession(), null);
  });

  it("supports 4-digit quick PIN hashing and unlock verification", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    service.setSession({
      sessionToken: "psess_pin_test",
      patientToken: "pat_pin_test",
      patientName: "Anil Joshi",
      phone: "9876543210",
      expiresAt: futureDate,
    });

    service.setQuickPin("4321");
    service.lockApp();
    assert.strictEqual(service.isLocked(), true);

    // Wrong PIN
    assert.strictEqual(service.unlockWithPin("0000"), false);
    assert.strictEqual(service.isLocked(), true);

    // Correct PIN
    assert.strictEqual(service.unlockWithPin("4321"), true);
    assert.strictEqual(service.isLocked(), false);
  });

  it("tracks informed consent for background permissions", () => {
    const initial = service.getConsentState();
    assert.strictEqual(initial.hasCompletedConsentGate, false);

    service.updateConsent({
      backgroundVoiceSafetyAllowed: true,
      calendarAccessAllowed: true,
      alarmNotificationsAllowed: true,
      batteryOptimizationExempt: true,
    });

    const updated = service.getConsentState();
    assert.strictEqual(updated.hasCompletedConsentGate, true);
    assert.strictEqual(updated.backgroundVoiceSafetyAllowed, true);
    assert.ok(updated.consentedAt);
  });
});
