export type Status = "agreed" | "review" | "conflict" | "rejected";
export type RunStatus = "queued" | "processing" | "needs_review" | "approved" | "reapproved" | "unlocked_for_revision" | "failed";
export type Action = "confirm" | "edit" | "reject";
export type Attrs = Record<string, string | null>;

export interface Patient {
  name?: string;
  language?: string;
  phone?: string;
  guardian_name?: string;
  guardian_phone?: string;
  patient_token?: string;
}

export interface RunMeta {
  run_id: string;
  status: RunStatus;
  filename?: string;
  created_at?: string;
  patient?: Patient;
  counts?: Record<Status, number> | null;
  error?: string | null;
  approved?: boolean;
  approved_by?: string;
  cached?: boolean;
  patient_token?: string;
  current_version?: number;
}

export interface Block {
  block_id: string;
  type: "heading" | "paragraph" | "table_row" | "list_item";
  page: number | null;
  text: string;
  low_confidence: boolean;
  table_id: string | null;
  row_index: number | null;
  cells: string[] | null;
}

export interface Opinion {
  voter: "A" | "B" | "rules";
  path: string;
  attrs: Attrs;
  block_id: string;
  quote: string;
  units: string[];
  trusted: boolean;
  ground_issues: string[];
}

export interface ReconciledField {
  field_id: string;
  category: string;
  status: Status;
  critical: boolean;
  proposed: Attrs | null;
  proposed_from: string | null;
  block_id: string | null;
  quote: string | null;
  units: string[];
  voters: string[];
  opinions: Opinion[];
  issues: string[];
}

export interface Decision {
  action: Action;
  attrs: Attrs | null;
  by: string;
  at: string;
  note: string | null;
}

export interface ReviewField {
  field: ReconciledField;
  decision: Decision | null;
}

export interface Blocker {
  field_id: string;
  category: string;
  status: Status;
  reason: string;
}

export interface ReviewData {
  run: RunMeta;
  blocks: Block[];
  fields: ReviewField[];
  blockers: Blocker[];
  can_approve: boolean;
}

export interface ApiEvent {
  run_id: string;
  seq: number;
  ts: string;
  stage: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface DecisionResult {
  field: ReviewField;
  blockers: Blocker[];
  can_approve: boolean;
}

// ---------------------------------------------------------------- help requests + patients (care-team console)
export type HelpSeverity = "critical" | "concern";
export type HelpStatus = "open" | "acknowledged" | "escalated" | "resolved";
export type HelpSource = "voice" | "button" | "test";
export type HelpActionName = "acknowledge" | "call" | "escalate" | "resolve" | "note";
export interface HelpTimelineEntry { at: string; actor: string; action: string; note: string | null }
export interface HelpPatient { name: string; language: string; phone: string; guardian_name: string; guardian_phone: string }
export interface HelpRequest {
  id: string;
  client_id: string | null;
  run_id: string;
  patient: HelpPatient | null;
  patient_name: string;
  heard: string;
  label: string;
  severity: HelpSeverity;
  source: HelpSource;
  demo: boolean;
  status: HelpStatus;
  created_at: string;
  sla_seconds: number;
  acknowledged_at: string | null; acknowledged_by: string | null;
  escalated_at: string | null; escalated_by: string | null;
  resolved_at: string | null; resolved_by: string | null;
  resolution: string | null; resolution_label: string | null;
  calls: number;
  timeline: HelpTimelineEntry[];
}
export interface HelpSummary {
  total: number; open: number; acknowledged: number; escalated: number; resolved: number;
  unacked: number; critical_unacked: number; overdue: number;
  oldest_unacked_at: string | null; avg_ack_seconds: number | null; server_time: string;
}
export interface HelpList { items: HelpRequest[]; summary: HelpSummary; resolutions: Record<string, string> }

export interface PatientRow {
  id: string; name: string; language: string; phone: string; guardian_name: string; guardian_phone: string;
  status: RunStatus; approved: boolean; approved_by: string | null; filename: string; created_at: string;
  to_check: number | null; help_active: number; help_critical_active: number; help_total: number;
  patient_slug?: string;
  dashboard_url?: string;
}
export interface PlanGroup {
  category: string; label: string;
  items: { field_id: string | null; attrs: Record<string, string | null>; summary: string; decision: string | null; decided_by: string | null; edited: boolean }[];
}
export interface ActivityEntry { at: string; actor: string; action: string; text: string; note: string | null; tone: "ok" | "warn" | "bad" | "info" }
export interface PatientDetail {
  summary: PatientRow;
  run: { run_id: string; status: RunStatus; filename: string; created_at: string; approved: boolean; approved_by: string | null; error: string | null; counts: unknown };
  plan: PlanGroup[];
  plan_removed: unknown[];
  plan_approved_at: string | null;
  activity: ActivityEntry[];
  help: HelpRequest[];
  tasks?: RecoveryTask[];
  doses?: unknown[];
  reminders?: unknown[];
}

// ---------------------------------------------------------------- Phase 1 Shared Contracts
export interface CaregiverContact {
  name: string;
  phone: string;
  relationship: string;
  consent_status: "pending" | "consented" | "revoked";
  consent_timestamp?: string | null;
  notification_preferences: string[];
  verified: boolean;
}

export interface MedicationScheduleItem {
  id: string;
  name: string;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  times: string[];
  instructions?: string | null;
}

export interface RecoveryTask {
  task_id: string;
  run_id: string;
  plan_version: number;
  category: "medication" | "wound_care" | "activity" | "diet" | "follow_up" | "vital_check" | "general";
  title: string;
  description: string;
  scheduled_time: string | null;
  scheduled_date: string | null;
  status: "pending" | "completed" | "snoozed" | "missed" | "cancelled";
  completed_at?: string | null;
  completed_by?: "patient" | "caregiver" | "voice" | "staff" | null;
  notes?: string | null;
}

export interface MedicationDoseRecord {
  dose_id: string;
  run_id: string;
  plan_version: number;
  medication_id: string;
  medication_name: string;
  dose: string | null;
  scheduled_time: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  reported_taken: boolean;
  reported_taken_at: string | null;
  reported_via: "app_button" | "voice" | "sms_reply" | "caregiver_portal" | "staff" | null;
  snooze_until: string | null;
  notes: string | null;
}

export interface PatientPlanResponse {
  run_id: string;
  patient_name: string;
  phone: string;
  language: string;
  version: number;
  approved_at: string;
  plan_duration_days: number;
  medications: MedicationScheduleItem[];
  instructions: Record<string, string[]>;
  follow_ups: { id: string; what: string; when: string | null; where: string | null }[];
  contacts: { label: string; value: string }[];
  caregivers: CaregiverContact[];
  tasks_today: RecoveryTask[];
  demo: boolean;
  patient_slug?: string;
  dashboard_url?: string;
}

// ---------------------------------------------------------------- Phase 5 Medication Reminders
export interface ReminderJob {
  job_id: string;
  run_id: string;
  plan_version: number;
  medication_id: string;
  medication_name: string;
  dose: string | null;
  scheduled_time: string;
  scheduled_date: string;
  timezone: string;
  channel: "in_app" | "sms" | "whatsapp" | "voice";
  status: "scheduled" | "attempted" | "delivered" | "failed" | "acknowledged" | "snoozed" | "cancelled";
  attempts: number;
  max_retries: number;
  last_attempt_at: string | null;
  delivered_at: string | null;
  acknowledged_at: string | null;
  snooze_until: string | null;
  error: string | null;
  message_body: string | null;
}

// ---------------------------------------------------------------- Phase 7 Caregiver Portal
export interface CaregiverNotification {
  notification_id: string;
  run_id: string;
  recipient_name: string;
  recipient_phone: string;
  channel: string;
  notification_type: "emergency" | "missed_dose" | "milestone" | "daily_summary";
  message: string;
  sent_at: string;
  status: "sent" | "failed" | "delivered";
}

export interface CaregiverPatientView {
  run_id: string;
  patient_name: string;
  language: string;
  caregiver_name: string;
  relationship: string;
  phone: string;
  consent_status: "pending" | "consented" | "revoked";
  notification_preferences: string[];
  plan_duration_days: number;
  approved_at: string | null;
  adherence_rate: number;
  tasks_today: RecoveryTask[];
  medications: MedicationScheduleItem[];
  instructions: Record<string, string[]>;
  follow_ups: { id: string; what: string; when: string | null; where: string | null }[];
  active_help: HelpRequest | null;
  recent_notifications: CaregiverNotification[];
}

// ---------------------------------------------------------------- Clinical Analytics
export interface PatientProgressItem {
  id: string;
  name: string;
  procedure: string;
  status: string;
  approved: boolean;
  completion_percentage: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_pending: number;
  tasks_overdue: number;
  help_active: number;
  created_at: string;
}

export interface PatientAttentionItem {
  id: string;
  name: string;
  status: string;
  severity: "critical" | "high" | "medium" | "normal";
  reasons: string[];
  primary_reason: string;
  target_route: string;
  tasks_pending: number;
  tasks_overdue: number;
}

export interface ClinicalAnalyticsData {
  timestamp: string;
  summary: {
    total_patients: number;
    patients_requiring_attention: number;
    care_plans_in_progress: number;
    avg_care_plan_completion: number;
    total_tasks: number;
    completed_tasks: number;
    pending_tasks: number;
    overdue_tasks: number;
    snoozed_tasks: number;
    documents_awaiting_review: number;
    documents_processed: number;
    documents_total: number;
  };
  care_plan_completion: PatientProgressItem[];
  task_distribution: {
    completed: number;
    pending: number;
    overdue: number;
    snoozed: number;
    total: number;
  };
  document_stages: {
    uploaded: number;
    processing: number;
    needs_review: number;
    approved: number;
    failed: number;
  };
  patients_requiring_attention: PatientAttentionItem[];
  activity_timeline: { date: string; events: number }[];
}

export type CallRole = "staff" | "patient";
export type CallStatus =
  | "idle"
  | "connecting_signaling"
  | "ready"
  | "calling"
  | "ringing"
  | "connecting_audio"
  | "connected"
  | "reconnecting"
  | "ended"
  | "rejected"
  | "busy"
  | "unavailable"
  | "error";

export interface CallRecord {
  call_id: string;
  run_id: string;
  caller_role: CallRole;
  caller_name: string;
  target_role: CallRole;
  status: string;
  created_at: string;
  connected_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  end_reason?: string | null;
}

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface MatchedMedication {
  id: string;
  name: string;
  dose?: string | null;
  frequency?: string | null;
  instructions?: string | null;
  times?: string[];
}

export interface PillScanResult {
  verified: boolean;
  status: "VERIFIED_MATCH" | "SAFETY_WARNING" | "DOSAGE_MISMATCH" | "UNRECOGNIZED";
  detected_name: string;
  detected_dose: string;
  raw_text?: string;
  confidence: number;
  safety_alert?: string | null;
  safety_alert_hi?: string | null;
  warning_level?: string | null;
  spoken_summary_en: string;
  spoken_summary_hi: string;
  matched_medication?: MatchedMedication | null;
}


