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
