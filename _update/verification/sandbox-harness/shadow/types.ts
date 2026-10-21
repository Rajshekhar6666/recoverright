export interface ApiEvent { seq: number; ts: string; type: string; payload: Record<string, unknown>; stage?: string }
export type Attrs = Record<string, string | null>;
export interface RunMeta { run_id: string; filename: string; created_at: string; status: string; patient: { name: string; phone: string }; counts?: any; error?: string }
export type ReviewData = any;
