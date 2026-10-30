import { describe, it } from "node:test";
import assert from "node:assert";
import { DeviceAlarmNotificationService } from "../src/services/notifications";
import { MedicationSchedule } from "../src/api/types";

describe("DeviceAlarmNotificationService", () => {
  const service = new DeviceAlarmNotificationService();

  it("parses diverse time formats correctly", () => {
    assert.deepStrictEqual(service.parseTimeString("08:00 AM"), { hour: 8, minute: 0 });
    assert.deepStrictEqual(service.parseTimeString("08:30 PM"), { hour: 20, minute: 30 });
    assert.deepStrictEqual(service.parseTimeString("12:00 PM"), { hour: 12, minute: 0 });
    assert.deepStrictEqual(service.parseTimeString("12:00 AM"), { hour: 0, minute: 0 });
    assert.deepStrictEqual(service.parseTimeString("14:45"), { hour: 14, minute: 45 });
    assert.strictEqual(service.parseTimeString("time_not_set"), null);
    assert.strictEqual(service.parseTimeString("as needed"), null);
  });

  it("synchronizes medication dose times into active local alarms", () => {
    service.clearAllAlarms();

    const medications: MedicationSchedule[] = [
      {
        medication_id: "med_1",
        name: "Metformin 500mg",
        dose: "500mg",
        frequency: "Twice daily",
        instructions: "With breakfast and dinner",
        times: ["08:00 AM", "08:00 PM"],
        requires_time_setting: false,
      },
      {
        medication_id: "med_2",
        name: "Atorvastatin 20mg",
        dose: "20mg",
        frequency: "Once daily",
        instructions: "At bedtime",
        times: ["09:00 PM"],
        requires_time_setting: false,
      },
    ];

    const scheduled = service.syncMedicationAlarms(medications);
    assert.strictEqual(scheduled.length, 3);

    const active = service.getActiveAlarms();
    assert.strictEqual(active.length, 3);
    assert.strictEqual(active[0].scheduled_time, "08:00 AM");
    assert.strictEqual(active[1].scheduled_time, "08:00 PM");
    assert.strictEqual(active[2].scheduled_time, "09:00 PM");
  });

  it("handles lockscreen interactive notification actions (Taken & Snooze)", () => {
    const active = service.getActiveAlarms();
    assert.ok(active.length > 0);
    const targetAlarm = active[0];

    // 1. Mark Taken
    const takenResult = service.handleNotificationAction(targetAlarm.id, "ACTION_TAKEN");
    assert.strictEqual(takenResult.action, "taken");
    assert.strictEqual(takenResult.medicationId, targetAlarm.medication_id);

    // 2. Snooze 10m
    const snoozeResult = service.handleNotificationAction(targetAlarm.id, "ACTION_SNOOZE");
    assert.strictEqual(snoozeResult.action, "snooze");
    assert.ok(snoozeResult.rescheduledTime !== undefined);
  });

  it("generates and retrieves persona spoken alarm script", () => {
    const active = service.getActiveAlarms();
    assert.ok(active.length > 0);
    const alarm = active[0];
    assert.ok(alarm.spoken_alarm_script, "alarm should have spoken_alarm_script");
    const spoken = service.getSpokenAlarmScript(alarm.id, "Rohan", "hi");
    assert.ok(spoken.length > 0);
    assert.ok(spoken.includes(alarm.medication_name) || spoken.includes("दवाई") || spoken.includes("Rohan"));
  });
});
