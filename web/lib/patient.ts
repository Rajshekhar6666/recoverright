import { currentAttrs } from "./review";
import type { CaregiverContact, PatientPlanResponse, RecoveryTask, ReviewData } from "./types";

export interface PlanMed { id: string; name: string; dose: string | null; frequency: string | null; duration: string | null; times: string[] }
export interface PlanFollowUp { id: string; what: string; when: string | null; where: string | null }
export type InstructionKey = "wound_care" | "activity" | "diet" | "warning_signs";
export interface PlanView {
  patientName: string;
  phone: string;
  run_id?: string;
  runId?: string;
  version?: number;
  approvedAt?: string;
  planDurationDays?: number;
  meds: PlanMed[];
  followUps: PlanFollowUp[];
  instructions: Record<InstructionKey, string[]>;
  contacts: { label: string; value: string }[];
  caregivers?: CaregiverContact[];
  serverTasks?: RecoveryTask[];
  demo: boolean;
}

const fmt = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}:00 ${hh < 12 ? "AM" : "PM"}`;
};

/** Turns the wording of a frequency into clock times. Anything unclear (as needed, until review) gets no times. */
export function timesFor(freq: string | null): string[] {
  const f = (freq ?? "").toLowerCase();
  if (!f || /as needed|prn|when required/.test(f)) return [];
  const every = f.match(/every\s+(\d{1,2})\s*(?:hours?|hrs?|h)\b/);
  if (every) {
    const n = Number(every[1]);
    if (n >= 3 && n <= 24) return Array.from({ length: Math.ceil(24 / n) }, (_, i) => fmt(8 + i * n)).slice(0, Math.floor(24 / n) || 1);
  }
  if (/(four|4)\s*times|qid/.test(f)) return [8, 12, 16, 20].map(fmt);
  if (/(three|3)\s*times|tid|thrice/.test(f)) return [8, 14, 20].map(fmt);
  if (/twice|(two|2)\s*times|bid|b\.i\.d/.test(f)) return [8, 20].map(fmt);
  if (/once|daily|every day|(one|1)\s*time|at night|night|bedtime|morning/.test(f)) return [/night|bedtime/.test(f) ? 21 : 8].map(fmt);
  return [];
}

export function toMinutes(t: string): number {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/);
  if (!m) return 0;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === "PM" ? 720 : 0);
}

export function planFromReview(d: ReviewData): PlanView {
  const plan: PlanView = {
    patientName: d.run.patient?.name || "Patient", phone: d.run.patient?.phone || "", meds: [], followUps: [], contacts: [], demo: false,
    instructions: { wound_care: [], activity: [], diet: [], warning_signs: [] },
  };
  for (const it of d.fields) {
    const f = it.field;
    if (it.decision?.action === "reject") continue;
    if (f.status === "rejected" && it.decision?.action !== "edit" && it.decision?.action !== "confirm") continue;
    const a = currentAttrs(it);
    if (!a) continue;
    if (f.category === "medications") {
      plan.meds.push({ id: f.field_id, name: a.name ?? "Medicine", dose: a.dose ?? null, frequency: a.frequency ?? null, duration: a.duration ?? null, times: timesFor(a.frequency ?? null) });
    } else if (f.category === "follow_ups") {
      plan.followUps.push({ id: f.field_id, what: a.what ?? "Follow-up", when: a.when ?? null, where: a.where ?? null });
    } else if (f.category === "contacts") {
      if (a.value) plan.contacts.push({ label: a.label ?? "Care team", value: a.value });
    } else if (f.category === "wound_care" || f.category === "activity" || f.category === "diet") {
      if (a.instruction) plan.instructions[f.category].push(a.instruction);
    } else if (f.category === "warning_signs") {
      if (a.text) plan.instructions.warning_signs.push(a.text);
    }
  }
  return plan;
}

export function planFromApprovedPlan(res: PatientPlanResponse): PlanView {
  return {
    patientName: res.patient_name || "Patient",
    phone: res.phone || "",
    version: res.version,
    approvedAt: res.approved_at,
    planDurationDays: res.plan_duration_days || 14,
    meds: (res.medications || []).map((m) => ({
      id: m.id,
      name: m.name,
      dose: m.dose ?? null,
      frequency: m.frequency ?? null,
      duration: m.duration ?? null,
      times: m.times && m.times.length ? m.times : timesFor(m.frequency ?? null),
    })),
    followUps: (res.follow_ups || []).map((f) => ({
      id: f.id,
      what: f.what || "Follow-up",
      when: f.when ?? null,
      where: f.where ?? null,
    })),
    instructions: {
      wound_care: res.instructions?.wound_care || [],
      activity: res.instructions?.activity || [],
      diet: res.instructions?.diet || [],
      warning_signs: res.instructions?.warning_signs || [],
    },
    contacts: res.contacts || [],
    caregivers: res.caregivers || [],
    serverTasks: res.tasks_today || [],
    run_id: res.run_id,
    runId: res.run_id,
    demo: res.demo ?? false,
  };
}

export const demoPlan: PlanView = {
  patientName: "Priya Sharma", phone: "", demo: true,
  meds: [
    { id: "m1", name: "Paracetamol", dose: "500 mg", frequency: "Three times daily", duration: "5 days", times: timesFor("Three times daily") },
    { id: "m2", name: "Amoxicillin", dose: "500 mg", frequency: "Twice daily", duration: "5 days", times: timesFor("Twice daily") },
    { id: "m3", name: "Pantoprazole", dose: "40 mg", frequency: "Once daily", duration: "14 days", times: timesFor("Once daily") },
  ],
  followUps: [{ id: "f1", what: "Post-surgery follow-up", when: "28 Apr 2025, 10:00 AM", where: "CityCare Hospital, Dr. Mehta" }],
  instructions: {
    wound_care: ["Keep the area clean and dry.", "Do not soak the wound until the stitches are removed."],
    activity: ["Use support when walking.", "Do not drive until reviewed by the surgeon."],
    diet: ["Stay hydrated and eat light meals."],
    warning_signs: ["Fever, increased pain, or swelling that is getting worse.", "Heavy bleeding from the wound."],
  },
  contacts: [{ label: "Nurse Anita Singh, care coordinator", value: "+91 00000 00000" }],
};
