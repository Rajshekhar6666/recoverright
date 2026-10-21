export type Status = "agreed" | "review" | "conflict" | "rejected";
export type RunStatus = "queued" | "processing" | "needs_review" | "approved" | "failed";
export type Action = "confirm" | "edit" | "reject";
export type Attrs = Record<string, string | null>;

export interface Patient {
  name: string;
  language: string;
  phone: string;
  guardian_name: string;
  guardian_phone: string;
}

export interface RunMeta {
  run_id: string;
  status: RunStatus;
  filename: string;
  created_at: string;
  patient: Patient;
  counts: Record<Status, number> | null;
  error: string | null;
  approved: boolean;
  approved_by?: string;
  cached?: boolean;
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
}
