import { describe, it } from "node:test";
import assert from "node:assert";
import { RealTimePlanSynchronizer } from "../src/services/sync";
import { RecoverRightApiClient } from "../src/api/client";
import { DeviceCalendarService } from "../src/services/calendar";
import { DeviceAlarmNotificationService } from "../src/services/notifications";
import { PatientPlan } from "../src/api/types";

const MOCK_PLAN: PatientPlan = {
  run_id: "run_mobile_sync_01",
  patient_name: "Anita Deshmukh",
  phone: "+91 98765 00000",
  language: "en",
  version: 1,
  approved_at: new Date().toISOString(),
  medications: [
    {
      medication_id: "med_sync_1",
      name: "Pantoprazole 40mg",
      dose: "40mg",
      frequency: "Once daily before breakfast",
      instructions: "Take on an empty stomach",
      times: ["07:30 AM"],
      requires_time_setting: false,
    },
  ],
  instructions: {},
  follow_ups: [
    {
      field_id: "fu_sync_1",
      what: "Endoscopy Follow-up",
      when: "In 7 days",
      where: "Gastro Clinic",
    },
  ],
  contacts: [],
};

describe("RealTimePlanSynchronizer", () => {
  it("initializes plan, syncs alarms, and calendars", async () => {
    const mockClient = new RecoverRightApiClient();
    // Stub client calls
    mockClient.getPatientPlan = async () => MOCK_PLAN;
    mockClient.recordDoseAction = async () => ({ status: "recorded", recorded: true });

    const calendar = new DeviceCalendarService();
    const alarms = new DeviceAlarmNotificationService();
    const synchronizer = new RealTimePlanSynchronizer(mockClient, calendar, alarms);

    const loaded = await synchronizer.initialize("pat_mock_token_123");
    assert.strictEqual(loaded.patient_name, "Anita Deshmukh");

    // Verify alarms synced
    const activeAlarms = alarms.getActiveAlarms();
    assert.strictEqual(activeAlarms.length, 1);
    assert.strictEqual(activeAlarms[0].scheduled_time, "07:30 AM");

    // Verify calendar synced
    const calendarEvents = calendar.getAllEvents();
    assert.strictEqual(calendarEvents.length, 1);
    assert.ok(calendarEvents[0].title.includes("Endoscopy Follow-up"));

    synchronizer.destroy();
  });

  it("handles offline dose queuing and flush upon reconnect", async () => {
    let shouldFail = true;
    const mockClient = new RecoverRightApiClient();
    mockClient.getPatientPlan = async () => MOCK_PLAN;
    mockClient.recordDoseAction = async () => {
      if (shouldFail) {
        throw new Error("Network timeout: offline");
      }
      return { status: "recorded", recorded: true };
    };

    const synchronizer = new RealTimePlanSynchronizer(mockClient);
    await synchronizer.initialize("pat_mock_token_123");

    // 1. Record dose while offline -> must queue action locally without crashing
    const success = await synchronizer.recordDose("med_sync_1", true, "lockscreen_notification");
    assert.strictEqual(success, false);
    assert.strictEqual(synchronizer.getPendingQueueCount(), 1);

    const status = synchronizer.getStatus();
    assert.strictEqual(status.server_reachable, false);
    assert.strictEqual(status.pending_offline_actions, 1);

    // 2. Connectivity restored -> flush queue
    shouldFail = false;
    const flushed = await synchronizer.flushOfflineQueue();
    assert.strictEqual(flushed, 1);
    assert.strictEqual(synchronizer.getPendingQueueCount(), 0);

    synchronizer.destroy();
  });
});
