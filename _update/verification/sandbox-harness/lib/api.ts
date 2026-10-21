export const API = (typeof window !== "undefined" && (window as any).__API__) || "http://localhost:8000";
export const api = {
  async listRuns() { return (await fetch(`${API}/runs`)).json(); },
  async getRun(id: string) { const r = await fetch(`${API}/runs/${id}`); if (!r.ok) throw new Error("x"); return r.json(); },
  async getReview(id: string) { const r = await fetch(`${API}/runs/${id}/review`); if (!r.ok) throw new Error("x"); return r.json(); },
};
