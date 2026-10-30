/**
 * Real-Time Patient Plan Synchronizer and Offline Queue Engine.
 * Ensures the patient's phone remains synchronized with hospital plan changes,
 * flushes offline doses when connectivity returns, and binds calendar/alarms to plan updates.
 */

import { apiClient, RecoverRightApiClient } from "../api/client";
import { RealTimeEventSubscriber } from "../api/events";
import { PatientPlan, SyncStatus } from "../api/types";
import { deviceCalendar, DeviceCalendarService } from "./calendar";
import { deviceAlarms, DeviceAlarmNotificationService } from "./notifications";

interface QueuedOfflineAction {
  id: string;
  type: "dose_taken" | "dose_ack" | "distress_alert";
  payload: any;
  timestamp: string;
}

export class RealTimePlanSynchronizer {
  private client: RecoverRightApiClient;
  private subscriber: RealTimeEventSubscriber;
  private calendar: DeviceCalendarService;
  private alarms: DeviceAlarmNotificationService;

  private currentPlan: PatientPlan | null = null;
  private patientToken: string | null = null;
  private offlineQueue: QueuedOfflineAction[] = [];
  private syncStatus: SyncStatus = {
    online: true,
    last_synced_at: null,
    server_reachable: true,
    pending_offline_actions: 0,
    active_websocket: false,
  };
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  private planListeners: Array<(plan: PatientPlan) => void> = [];

  constructor(
    clientInstance: RecoverRightApiClient = apiClient,
    calendarInstance: DeviceCalendarService = deviceCalendar,
    alarmsInstance: DeviceAlarmNotificationService = deviceAlarms
  ) {
    this.client = clientInstance;
    this.calendar = calendarInstance;
    this.alarms = alarmsInstance;
    this.subscriber = new RealTimeEventSubscriber(this.client.getBaseUrl());

    // Bind interactive alarm actions to dose synchronization
    this.alarms.onAlarmAction(async (result) => {
      if (result.action === "taken") {
        await this.recordDose(result.medicationId, true, "mobile_lockscreen_alarm");
      }
    });
  }

  public getStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  public getPlan(): PatientPlan | null {
    return this.currentPlan;
  }

  public onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this.statusListeners.push(cb);
    cb(this.getStatus());
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb);
    };
  }

  public onPlanUpdate(cb: (plan: PatientPlan) => void): () => void {
    this.planListeners.push(cb);
    if (this.currentPlan) cb(this.currentPlan);
    return () => {
      this.planListeners = this.planListeners.filter((l) => l !== cb);
    };
  }

  private emitStatus(): void {
    this.syncStatus.pending_offline_actions = this.offlineQueue.length;
    for (const l of this.statusListeners) {
      try {
        l(this.getStatus());
      } catch (err) {
        console.error("Error in status listener:", err);
      }
    }
  }

  private emitPlan(): void {
    if (!this.currentPlan) return;
    for (const l of this.planListeners) {
      try {
        l(this.currentPlan);
      } catch (err) {
        console.error("Error in plan listener:", err);
      }
    }
  }

  /**
   * Initializes real-time synchronization for a discharged patient.
   */
  public async initialize(patientToken: string): Promise<PatientPlan> {
    this.patientToken = patientToken;

    // 1. Fetch current approved plan
    const plan = await this.client.getPatientPlan(patientToken);
    this.currentPlan = plan;
    this.syncStatus.last_synced_at = new Date().toISOString();
    this.syncStatus.server_reachable = true;
    this.syncStatus.online = true;

    // 2. Sync local OS alarms and calendar
    this.alarms.syncMedicationAlarms(plan.medications);
    await this.calendar.syncFollowUps(plan.follow_ups, "Hospital Clinic", plan.patient_name);

    // 3. Connect real-time event bus listener
    this.subscriber.subscribe(plan.run_id);
    this.subscriber.addListener(async (evt) => {
      // If plan was revised/updated by clinician, re-fetch and update alarms
      if (evt.type.includes("approved") || evt.type.includes("plan.") || evt.type.includes("reminder.")) {
        await this.refresh();
      }
    });

    this.emitPlan();
    this.emitStatus();

    // 4. Flush any pending offline queue items
    await this.flushOfflineQueue();

    return plan;
  }

  /**
   * Refreshes the plan from the hospital server.
   */
  public async refresh(): Promise<PatientPlan | null> {
    if (!this.patientToken) return null;
    try {
      const plan = await this.client.getPatientPlan(this.patientToken);
      this.currentPlan = plan;
      this.syncStatus.last_synced_at = new Date().toISOString();
      this.syncStatus.server_reachable = true;

      // Update native alarms and calendar appointments
      this.alarms.syncMedicationAlarms(plan.medications);
      await this.calendar.syncFollowUps(plan.follow_ups, "Hospital Clinic", plan.patient_name);

      this.emitPlan();
      this.emitStatus();
      return plan;
    } catch (err) {
      this.syncStatus.server_reachable = false;
      this.emitStatus();
      return this.currentPlan;
    }
  }

  /**
   * Records a dose action with automatic offline queuing.
   */
  public async recordDose(
    medicationId: string,
    reportedTaken: boolean = true,
    via: string = "mobile_app"
  ): Promise<boolean> {
    if (!this.patientToken) return false;

    // Optimistically update local plan state
    if (this.currentPlan) {
      const med = this.currentPlan.medications.find((m) => m.medication_id === medicationId);
      if (med) {
        med.status = reportedTaken ? "taken" : "missed";
        med.last_taken_at = new Date().toISOString();
        this.emitPlan();
      }
    }

    try {
      await this.client.recordDoseAction(this.patientToken, medicationId, reportedTaken, via);
      this.syncStatus.server_reachable = true;
      this.emitStatus();
      return true;
    } catch (err) {
      // Offline fallback: queue action for background sync
      this.offlineQueue.push({
        id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: "dose_taken",
        payload: { medicationId, reportedTaken, via },
        timestamp: new Date().toISOString(),
      });
      this.syncStatus.server_reachable = false;
      this.emitStatus();
      return false;
    }
  }

  /**
   * Flushes queued actions to server upon network reconnect.
   */
  public async flushOfflineQueue(): Promise<number> {
    if (!this.patientToken || this.offlineQueue.length === 0) return 0;

    let flushed = 0;
    const remaining: QueuedOfflineAction[] = [];

    for (const item of this.offlineQueue) {
      try {
        if (item.type === "dose_taken") {
          await this.client.recordDoseAction(
            this.patientToken,
            item.payload.medicationId,
            item.payload.reportedTaken,
            item.payload.via
          );
          flushed++;
        }
      } catch {
        remaining.push(item);
      }
    }

    this.offlineQueue = remaining;
    this.emitStatus();
    return flushed;
  }

  public getPendingQueueCount(): number {
    return this.offlineQueue.length;
  }

  public destroy(): void {
    this.subscriber.unsubscribe();
    this.statusListeners = [];
    this.planListeners = [];
  }
}

export const planSynchronizer = new RealTimePlanSynchronizer();
