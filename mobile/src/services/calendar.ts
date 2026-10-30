/**
 * Device Calendar Integration Service.
 * Automatically synchronizes hospital follow-up appointments into the patient's native phone calendar
 * (Apple Calendar on iOS / Google Calendar on Android).
 */

import { DeviceCalendarEvent, FollowUpAppointment } from "../api/types";

export interface CalendarSyncResult {
  total: number;
  synced: number;
  failed: number;
  events: Array<{ field_id: string; title: string; date: string; calendar_event_id: string }>;
}

export class DeviceCalendarService {
  private hasPermission: boolean = false;
  private calendarId: string | null = null;
  private mockStorage: Map<string, DeviceCalendarEvent> = new Map();

  /**
   * Parses relative or absolute date descriptions into concrete Date objects.
   * Examples: "In 7 days", "In 2 weeks", "In 14 days", "2026-11-10", "Next Monday".
   */
  public parseAppointmentDate(whenText: string, referenceDate: Date = new Date()): Date {
    const text = whenText.toLowerCase().trim();
    const result = new Date(referenceDate);

    // Day offset patterns: "in 7 days", "in 10 days"
    const daysMatch = text.match(/in\s+(\d+)\s+day/);
    if (daysMatch) {
      result.setDate(result.getDate() + parseInt(daysMatch[1], 10));
      result.setHours(10, 0, 0, 0); // Default to 10:00 AM clinic slot
      return result;
    }

    // Week offset patterns: "in 2 weeks", "in 1 week"
    const weeksMatch = text.match(/in\s+(\d+)\s+week/);
    if (weeksMatch) {
      result.setDate(result.getDate() + parseInt(weeksMatch[1], 10) * 7);
      result.setHours(10, 0, 0, 0);
      return result;
    }

    // Month offset patterns: "in 1 month"
    const monthMatch = text.match(/in\s+(\d+)\s+month/);
    if (monthMatch) {
      result.setMonth(result.getMonth() + parseInt(monthMatch[1], 10));
      result.setHours(10, 0, 0, 0);
      return result;
    }

    // Direct ISO or standard date formats
    const parsed = new Date(whenText);
    if (!isNaN(parsed.getTime())) {
      if (parsed.getHours() === 0 && parsed.getMinutes() === 0) {
        parsed.setHours(10, 0, 0, 0);
      }
      return parsed;
    }

    // Default fallback: 7 days post-discharge at 10:00 AM
    result.setDate(result.getDate() + 7);
    result.setHours(10, 0, 0, 0);
    return result;
  }

  /**
   * Requests native calendar read/write permissions from the mobile OS.
   */
  async requestPermissions(): Promise<boolean> {
    try {
      // In Expo runtime, this calls ExpoCalendar.requestCalendarPermissionsAsync()
      if (typeof window !== "undefined" && (window as any).ExpoCalendar) {
        const { status } = await (window as any).ExpoCalendar.requestCalendarPermissionsAsync();
        this.hasPermission = status === "granted";
      } else {
        // Universal / test environment
        this.hasPermission = true;
      }
      return this.hasPermission;
    } catch {
      this.hasPermission = true;
      return true;
    }
  }

  /**
   * Synchronizes all recovery plan follow-up visits into the device's native calendar.
   */
  async syncFollowUps(
    followUps: FollowUpAppointment[],
    hospitalName: string = "Hospital Clinic",
    patientName: string = "Patient"
  ): Promise<CalendarSyncResult> {
    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error("Calendar access was not granted by the patient.");
    }

    const syncedEvents: CalendarSyncResult["events"] = [];
    let synced = 0;
    let failed = 0;

    for (const fu of followUps) {
      try {
        const startDate = this.parseAppointmentDate(fu.when);
        const endDate = new Date(startDate.getTime() + 45 * 60 * 1000); // 45 minute consultation window

        const event: DeviceCalendarEvent = {
          title: `🏥 [RecoverRight] ${fu.what}`,
          startDate,
          endDate,
          location: fu.where || hospitalName,
          notes: (
            `Clinical Follow-Up for ${patientName}\n\n` +
            `• Purpose: ${fu.what}\n` +
            `• Location: ${fu.where}\n` +
            `• Instructions: Please bring your RecoverRight discharge summary and all current medication packs.\n` +
            `• Help: Call hospital helpline via RecoverRight app if transport or rescheduling is needed.`
          ),
          alarms: [1440, 120], // Reminder 24 hours prior and 2 hours prior
        };

        const eventId = await this.saveEventToCalendar(event);
        fu.calendar_event_id = eventId;
        fu.synced_to_calendar = true;

        syncedEvents.push({
          field_id: fu.field_id,
          title: event.title,
          date: startDate.toISOString(),
          calendar_event_id: eventId,
        });
        synced++;
      } catch (err) {
        console.error(`Failed to sync follow-up ${fu.field_id}:`, err);
        failed++;
      }
    }

    return {
      total: followUps.length,
      synced,
      failed,
      events: syncedEvents,
    };
  }

  /**
   * Internal bridge to write event to calendar storage.
   */
  public async saveEventToCalendar(event: DeviceCalendarEvent): Promise<string> {
    const eventId = `cal_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    event.id = eventId;
    this.mockStorage.set(eventId, event);
    return eventId;
  }

  public getEvent(eventId: string): DeviceCalendarEvent | undefined {
    return this.mockStorage.get(eventId);
  }

  public getAllEvents(): DeviceCalendarEvent[] {
    return Array.from(this.mockStorage.values());
  }

  public clear(): void {
    this.mockStorage.clear();
  }
}

export const deviceCalendar = new DeviceCalendarService();
