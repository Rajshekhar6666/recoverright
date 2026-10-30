import { describe, it } from "node:test";
import assert from "node:assert";
import { DeviceCalendarService } from "../src/services/calendar";
import { FollowUpAppointment } from "../src/api/types";

describe("DeviceCalendarService", () => {
  const service = new DeviceCalendarService();

  it("parses relative date expressions accurately", () => {
    const base = new Date("2026-11-01T00:00:00Z");

    const in7 = service.parseAppointmentDate("In 7 days", base);
    assert.strictEqual(in7.getDate(), 8);
    assert.strictEqual(in7.getHours(), 10);

    const in2Weeks = service.parseAppointmentDate("In 2 weeks", base);
    assert.strictEqual(in2Weeks.getDate(), 15);

    const in1Month = service.parseAppointmentDate("In 1 month", base);
    assert.strictEqual(in1Month.getMonth(), base.getMonth() + 1);
  });

  it("synchronizes follow-up visits to calendar storage", async () => {
    service.clear();

    const followUps: FollowUpAppointment[] = [
      {
        field_id: "fu_1",
        what: "Surgical Wound Check",
        when: "In 7 days",
        where: "General OPD Clinic B",
      },
      {
        field_id: "fu_2",
        what: "Cardiology Review",
        when: "In 14 days",
        where: "Heart Center Room 204",
      },
    ];

    const result = await service.syncFollowUps(followUps, "City Hospital", "Rahul Sharma");
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.synced, 2);
    assert.strictEqual(result.failed, 0);

    const allEvents = service.getAllEvents();
    assert.strictEqual(allEvents.length, 2);

    const first = allEvents[0];
    assert.ok(first.title.includes("Surgical Wound Check"));
    assert.strictEqual(first.location, "General OPD Clinic B");
    assert.deepStrictEqual(first.alarms, [1440, 120]); // Reminders 24h and 2h prior
  });
});
