import type {
  Action, Attrs, CaregiverNotification, CaregiverPatientView, DecisionResult, HelpActionName, HelpList, HelpRequest, HelpSummary,
  MedicationDoseRecord, PatientDetail, PatientPlanResponse, PatientRow, PillScanResult, RecoveryTask, ReminderJob, ReviewData, RunMeta,
} from "./types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* body was not JSON */
    }
    if (typeof detail === "object" && detail !== null && "message" in detail) {
      throw new ApiError(res.status, (detail as { message: string }).message);
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  listRuns: () => fetch(`${API}/runs`, { cache: "no-store" }).then((r) => parse<RunMeta[]>(r)),
  getRun: (id: string) => fetch(`${API}/runs/${id}`, { cache: "no-store" }).then((r) => parse<RunMeta>(r)),
  getReview: (id: string) => fetch(`${API}/runs/${id}/review`, { cache: "no-store" }).then((r) => parse<ReviewData>(r)),
  createRun: (form: FormData) =>
    fetch(`${API}/runs`, { method: "POST", body: form }).then((r) => parse<{ run_id: string }>(r)),
  decide: (id: string, fieldId: string, action: Action, attrs?: Attrs, by = "Nurse") =>
    fetch(`${API}/runs/${id}/fields/${encodeURIComponent(fieldId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, attrs: attrs ?? null, by }),
    }).then((r) => parse<DecisionResult>(r)),
  approve: (id: string, by: string, role = "Registered Nurse", note?: string) =>
    fetch(`${API}/runs/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by, role, note }),
    }).then((r) => parse<unknown>(r)),
  retryRun: (id: string) =>
    fetch(`${API}/runs/${encodeURIComponent(id)}/retry`, { method: "POST" })
      .then((r) => parse<{ run_id: string; status: string }>(r)),
  unlockRun: (id: string, by = "Nurse", role = "Registered Nurse") =>
    fetch(`${API}/runs/${encodeURIComponent(id)}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by, role }),
    }).then((r) => parse<unknown>(r)),
  sourceUrl: (id: string) => `${API}/runs/${id}/source`,

  // ---- help requests (patient -> care team)
  listHelp: (status = "all", includeTest = true) =>
    fetch(`${API}/help?status=${encodeURIComponent(status)}&include_test=${includeTest}&limit=300`, { cache: "no-store" }).then((r) => parse<HelpList>(r)),
  helpSummary: () => fetch(`${API}/help/summary`, { cache: "no-store" }).then((r) => parse<HelpSummary>(r)),
  getHelp: (id: string) => fetch(`${API}/help/${id}`, { cache: "no-store" }).then((r) => parse<HelpRequest>(r)),
  helpAction: (id: string, action: HelpActionName, by: string, extra: { note?: string; resolution?: string; target?: "patient" | "guardian" } = {}) =>
    fetch(`${API}/help/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, by, ...extra }),
    }).then((r) => parse<HelpRequest>(r)),

  // ---- patient directory
  listPatients: () => fetch(`${API}/patients`, { cache: "no-store" }).then((r) => parse<{ items: PatientRow[] }>(r)),
  getPatient: (id: string) => fetch(`${API}/patients/${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => parse<PatientDetail>(r)),

  registerPatient: (data: {
    name: string; phone?: string; language?: string; guardian_name?: string; guardian_phone?: string;
    procedure?: string; auto_approve?: boolean;
  }) =>
    fetch(`${API}/patients/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => parse<{ run_id: string; patient_name: string; slug: string; patient_token: string; dashboard_url: string; status: string }>(r)),

  batchImportPatients: (records: Array<{
    name: string; phone?: string; language?: string; guardian_name?: string; guardian_phone?: string;
    procedure?: string; auto_approve?: boolean;
  }>) =>
    fetch(`${API}/patients/batch-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    }).then((r) => parse<{ total: number; imported_count: number; failed_count: number; imported: Array<{ run_id: string; patient_name: string; slug: string; patient_token: string; dashboard_url: string }>; failed: Array<{ index: number; patient_name?: string; reason: string }> }>(r)),

  // ---- clinical analytics
  getClinicalAnalytics: () =>
    fetch(`${API}/analytics/clinical`, { cache: "no-store" }).then((r) => parse<import("./types").ClinicalAnalyticsData>(r)),

  // ---- safe patient recovery plan & tasks (Phase 1)
  getPatientPlan: (token: string) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => parse<PatientPlanResponse>(r)),
  getTasks: (token: string) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/tasks`, { cache: "no-store" }).then((r) => parse<{ tasks: RecoveryTask[] }>(r)),
  updateTask: (token: string, taskId: string, action: "complete" | "snooze" | "cancel" | "reset" = "complete", by = "patient", note?: string) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/tasks/${encodeURIComponent(taskId)}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, by, note }),
    }).then((r) => parse<{ task: RecoveryTask }>(r)),
  reportDose: (token: string, medId: string, reportedTaken = true, via = "app_button", note?: string) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/medications/${encodeURIComponent(medId)}/report-dose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reported_taken: reportedTaken, via, note }),
    }).then((r) => parse<{ dose_record: MedicationDoseRecord }>(r)),
  acknowledgeMedication: (token: string, medId: string, via = "app_button") =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/medications/${encodeURIComponent(medId)}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged: true, via }),
    }).then((r) => parse<{ dose_record: MedicationDoseRecord }>(r)),
  scanPill: (token: string, payload: { image_data?: string; sample_id?: string; detected_text?: string; language?: string }) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/scan-pill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => parse<PillScanResult>(r)),
  listPlanVersions: (runId: string) =>
    fetch(`${API}/runs/${encodeURIComponent(runId)}/versions`, { cache: "no-store" }).then((r) => parse<{ run_id: string; current_version: number; versions: number[]; history: unknown[] }>(r)),
  reapprove: (runId: string, by = "Nurse") =>
    fetch(`${API}/runs/${encodeURIComponent(runId)}/reapprove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by }),
    }).then((r) => parse<unknown>(r)),

  // ---- medication reminder engine (Phase 5)
  listReminders: (token: string) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/reminders`, { cache: "no-store" })
      .then((r) => parse<{ run_id: string; current_version: number; reminders: ReminderJob[] }>(r)),
  triggerReminder: (token: string, jobId: string, channel?: "in_app" | "sms" | "whatsapp", simulateFailure = false) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/reminders/${encodeURIComponent(jobId)}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, simulate_failure: simulateFailure }),
    }).then((r) => parse<ReminderJob>(r)),
  snoozeReminderJob: (token: string, jobId: string, minutes = 10) =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/reminders/${encodeURIComponent(jobId)}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes, by: "patient" }),
    }).then((r) => parse<ReminderJob>(r)),
  ackReminderJob: (token: string, jobId: string, via = "app_button") =>
    fetch(`${API}/plans/${encodeURIComponent(token)}/reminders/${encodeURIComponent(jobId)}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged: true, via }),
    }).then((r) => parse<ReminderJob>(r)),
  listStaffReminders: (runId: string) =>
    fetch(`${API}/runs/${encodeURIComponent(runId)}/reminders`, { cache: "no-store" })
      .then((r) => parse<{ run_id: string; current_version: number; reminders: ReminderJob[] }>(r)),

  // ---- caregiver portal (Phase 7)
  getCaregiverPatientView: (token: string) =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/patient`, { cache: "no-store" })
      .then((r) => parse<CaregiverPatientView>(r)),
  updateCaregiverConsent: (token: string, consent_status: "pending" | "consented" | "revoked", notification_preferences?: string[]) =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent_status, notification_preferences }),
    }).then((r) => parse<{ status: string; caregiver: unknown }>(r)),
  caregiverTaskAction: (token: string, taskId: string, action: "complete" | "snooze" | "reset") =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/tasks/${encodeURIComponent(taskId)}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).then((r) => parse<RecoveryTask>(r)),
  caregiverReportDose: (token: string, medId: string, taken: boolean, notes?: string) =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/medications/${encodeURIComponent(medId)}/report-dose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taken, notes }),
    }).then((r) => parse<MedicationDoseRecord>(r)),
  notifyCaregiver: (token: string, notification_type: "emergency" | "missed_dose" | "milestone" | "daily_summary", channel?: string, custom_message?: string) =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_type, channel, custom_message }),
    }).then((r) => parse<CaregiverNotification>(r)),
  listCaregiverNotifications: (token: string) =>
    fetch(`${API}/caregivers/${encodeURIComponent(token)}/notifications`, { cache: "no-store" })
      .then((r) => parse<CaregiverNotification[]>(r)),

  // ---- demo cases (Phase 3)
  listDemoCases: () =>
    fetch(`${API}/demo/cases`, { cache: "no-store" }).then((r) => parse<{ cases: any[] }>(r)),
  loadDemoCase: (caseId: string) =>
    fetch(`${API}/demo/cases/${encodeURIComponent(caseId)}/load`, { method: "POST" })
      .then((r) => parse<{ run_id: string; patient_token: string; case_id: string; status: string; counts: any; title: string; patient_name: string }>(r)),
  resetDemo: () =>
    fetch(`${API}/demo/reset`, { method: "POST" }).then((r) => parse<{ status: string; reset_count: number; cases: any[] }>(r)),

  // ---- real-time calling
  getIceServers: () =>
    fetch(`${API}/calls/config/ice`, { cache: "no-store" })
      .then((r) => parse<{ ice_servers: { urls: string[]; username?: string; credential?: string }[] }>(r)),
  getCallHistory: (patientId: string) =>
    fetch(`${API}/calls/history/${encodeURIComponent(patientId)}`, { cache: "no-store" })
      .then((r) => parse<import("./types").CallRecord[]>(r)),
  getActiveCall: (patientId: string) =>
    fetch(`${API}/calls/active/${encodeURIComponent(patientId)}`, { cache: "no-store" })
      .then((r) => parse<{ active: boolean; session?: import("./types").CallRecord | null }>(r)),
  endCallRest: (callId: string, reason = "hangup", durationSeconds = 0) =>
    fetch(`${API}/calls/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: callId, action: "end", reason, duration_seconds: durationSeconds }),
    }).then((r) => parse<{ success: boolean }>(r)),
};
