import type { Action, Attrs, DecisionResult, HelpActionName, HelpList, HelpRequest, HelpSummary, PatientDetail, PatientRow, ReviewData, RunMeta } from "./types";

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
  approve: (id: string, by: string) =>
    fetch(`${API}/runs/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by }),
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
};
