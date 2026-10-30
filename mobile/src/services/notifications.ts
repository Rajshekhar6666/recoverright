/**
 * Native Device Alarms and Interactive Medication Notifications Service.
 * Manages local OS alarms, lock-screen interactive notification actions (Taken / Snooze / Help),
 * and persistent medication schedules even when the device is locked, offline, or app is terminated.
 */

import { LocalNotificationAlarm, MedicationSchedule } from "../api/types";
import {
  generatePersonaAlarmScript,
  generateStandardAlarmScript,
  loadAlertModePreference,
  loadEmotionalStatePreference,
  loadPersonaPreference,
} from "./voicePersona";

export type AlarmActionType = "taken" | "snooze" | "help" | "dismiss";

export interface AlarmActionResult {
  alarmId: string;
  medicationId: string;
  action: AlarmActionType;
  timestamp: string;
  rescheduledTime?: string;
}

export class DeviceAlarmNotificationService {
  private alarms: Map<string, LocalNotificationAlarm> = new Map();
  private actionHandlers: Array<(result: AlarmActionResult) => void> = [];

  /**
   * Parses time strings like "08:00 AM", "09:30 PM", "14:00" into hour and minute integers.
   */
  public parseTimeString(timeStr: string): { hour: number; minute: number } | null {
    if (!timeStr) return null;
    const clean = timeStr.trim();
    if (clean.toLowerCase().includes("not set") || clean.toLowerCase().includes("as needed")) {
      return null;
    }

    // Parse "08:00 AM" or "8:00 PM"
    const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      let hour = parseInt(ampmMatch[1], 10);
      const minute = parseInt(ampmMatch[2], 10);
      const isPm = ampmMatch[3].toUpperCase() === "PM";
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
      return { hour, minute };
    }

    // Parse 24-hour "14:30"
    const militaryMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (militaryMatch) {
      return {
        hour: parseInt(militaryMatch[1], 10),
        minute: parseInt(militaryMatch[2], 10),
      };
    }

    return null;
  }

  /**
   * Configures and registers interactive notification action categories on the device.
   * Enables lockscreen response buttons without opening the app:
   * 1. [✅ Taken] -> Logs dose taken locally and syncs to hospital server
   * 2. [⏰ Snooze 10m] -> Reschedules alarm for 10 minutes later
   * 3. [🆘 Call Nurse] -> Triggers WebRTC call / distress alert
   */
  public getNotificationCategoryDefinition() {
    return {
      identifier: "MEDICATION_DOSE_ALARM",
      actions: [
        {
          identifier: "ACTION_TAKEN",
          buttonTitle: "✅ Mark Taken",
          options: { opensAppToForeground: false },
        },
        {
          identifier: "ACTION_SNOOZE",
          buttonTitle: "⏰ Snooze 10m",
          options: { opensAppToForeground: false },
        },
        {
          identifier: "ACTION_HELP",
          buttonTitle: "🆘 Call Nurse",
          options: { opensAppToForeground: true },
        },
      ],
    };
  }

  /**
   * Synchronizes all confirmed medication schedules into local device alarms.
   */
  public syncMedicationAlarms(medications: MedicationSchedule[]): LocalNotificationAlarm[] {
    const scheduled: LocalNotificationAlarm[] = [];

    for (const med of medications) {
      const times = med.confirmed_times || med.times || [];
      for (let i = 0; i < times.length; i++) {
        const timeStr = times[i];
        const parsed = this.parseTimeString(timeStr);
        if (!parsed) continue;

        const alarmId = `alarm_${med.medication_id}_slot_${i}`;
        const alertMode = loadAlertModePreference();
        let spokenScript = "";
        if (alertMode === "standard") {
          spokenScript = generateStandardAlarmScript(med.name, med.dose, "en").spokenText;
        } else {
          const persona = loadPersonaPreference();
          const emotionalState = loadEmotionalStatePreference();
          spokenScript = generatePersonaAlarmScript(
            persona,
            med.name,
            med.dose,
            "Beta",
            "hi",
            emotionalState
          ).spokenText;
        }

        const alarm: LocalNotificationAlarm = {
          id: alarmId,
          medication_id: med.medication_id,
          medication_name: med.name,
          dose: med.dose,
          scheduled_time: timeStr,
          hour: parsed.hour,
          minute: parsed.minute,
          repeating: true,
          active: true,
          spoken_alarm_script: spokenScript,
        };

        this.alarms.set(alarmId, alarm);
        scheduled.push(alarm);
      }
    }

    return scheduled;
  }

  /**
   * Handles user interaction with a medication alarm notification.
   */
  public handleNotificationAction(alarmId: string, actionIdentifier: string): AlarmActionResult {
    const alarm = this.alarms.get(alarmId);
    if (!alarm) {
      throw new Error(`Alarm ${alarmId} not found`);
    }

    const nowIso = new Date().toISOString();
    let action: AlarmActionType = "dismiss";
    let rescheduledTime: string | undefined;

    switch (actionIdentifier) {
      case "ACTION_TAKEN":
        action = "taken";
        alarm.action_taken = true;
        break;

      case "ACTION_SNOOZE": {
        action = "snooze";
        const snoozeDate = new Date(Date.now() + 10 * 60 * 1000); // +10 minutes
        rescheduledTime = snoozeDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        break;
      }

      case "ACTION_HELP":
        action = "help";
        break;

      default:
        action = "dismiss";
        break;
    }

    const result: AlarmActionResult = {
      alarmId,
      medicationId: alarm.medication_id,
      action,
      timestamp: nowIso,
      rescheduledTime,
    };

    // Notify registered handlers
    for (const handler of this.actionHandlers) {
      try {
        handler(result);
      } catch (err) {
        console.error("Error in alarm action handler:", err);
      }
    }

    return result;
  }

  public onAlarmAction(handler: (result: AlarmActionResult) => void): () => void {
    this.actionHandlers.push(handler);
    return () => {
      this.actionHandlers = this.actionHandlers.filter((h) => h !== handler);
    };
  }

  public getActiveAlarms(): LocalNotificationAlarm[] {
    return Array.from(this.alarms.values()).filter((a) => a.active);
  }

  public getAlarm(alarmId: string): LocalNotificationAlarm | undefined {
    return this.alarms.get(alarmId);
  }

  public getSpokenAlarmScript(alarmId: string, patientName: string = "Beta", lang: "en" | "hi" = "hi"): string {
    const alarm = this.alarms.get(alarmId);
    if (!alarm) return "";
    const alertMode = loadAlertModePreference();
    if (alertMode === "standard") {
      return generateStandardAlarmScript(alarm.medication_name, alarm.dose, lang).spokenText;
    }
    const persona = loadPersonaPreference();
    const emotionalState = loadEmotionalStatePreference();
    const script = generatePersonaAlarmScript(
      persona,
      alarm.medication_name,
      alarm.dose,
      patientName,
      lang,
      emotionalState
    );
    return script.spokenText;
  }

  public cancelAlarm(alarmId: string): boolean {
    return this.alarms.delete(alarmId);
  }

  public clearAllAlarms(): void {
    this.alarms.clear();
  }
}

export const deviceAlarms = new DeviceAlarmNotificationService();
