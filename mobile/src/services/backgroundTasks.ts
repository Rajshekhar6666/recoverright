/**
 * Background Task Manager for RecoverRight Mobile.
 *
 * Implements persistent task registration for:
 * 1. RR_BACKGROUND_MEDICATION_CHECK (overdue dose watchdog)
 * 2. RR_BACKGROUND_SYNC_FETCH (offline action queue flushing and plan polling)
 */
import { deviceAlarms } from "./notifications";
import { planSynchronizer } from "./sync";

export const BACKGROUND_MEDICATION_CHECK = "RR_BACKGROUND_MEDICATION_CHECK";
export const BACKGROUND_SYNC_FETCH = "RR_BACKGROUND_SYNC_FETCH";

export type TaskExecutor = (body?: any) => Promise<any>;

export class MobileBackgroundTaskRegistry {
  private tasks = new Map<string, TaskExecutor>();

  defineTask(taskName: string, executor: TaskExecutor): void {
    this.tasks.set(taskName, executor);
  }

  isTaskDefined(taskName: string): boolean {
    return this.tasks.has(taskName);
  }

  async runTask(taskName: string, body?: any): Promise<any> {
    const fn = this.tasks.get(taskName);
    if (!fn) throw new Error(`Task '${taskName}' is not defined.`);
    return await fn(body);
  }
}

export const mobileTaskManager = new MobileBackgroundTaskRegistry();

// Register Medication Check Watchdog
mobileTaskManager.defineTask(BACKGROUND_MEDICATION_CHECK, async () => {
  const activeAlarms = deviceAlarms.getActiveAlarms();
  const now = new Date();
  const overdueAlarms = activeAlarms.filter((alarm) => {
    const scheduled = new Date(alarm.scheduled_time);
    return scheduled.getTime() <= now.getTime();
  });
  return {
    status: "success",
    checked_at: now.toISOString(),
    overdue_count: overdueAlarms.length,
  };
});

// Register Background Sync Watchdog
mobileTaskManager.defineTask(BACKGROUND_SYNC_FETCH, async () => {
  const flushedCount = await planSynchronizer.flushOfflineQueue();
  return {
    status: "success",
    flushed_items: flushedCount,
  };
});
