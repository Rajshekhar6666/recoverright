/**
 * SIMULATED demo run. Used only when the page is opened as /live/demo (or the "Simulated demo" button),
 * and every screen shows a SIMULATED banner. It emits events in the same schema as the real backend, so the
 * theater can be presented with the API offline. Nothing here is real patient data or a real model output.
 */
import type { Ev } from "./model";

export const DEMO_MODELS = { a: "demo-reader-a (simulated)", b: "demo-reader-b (simulated)" };
export const DEMO_FILENAME = "sample_knee_discharge.pdf (SIMULATED)";
export const DEMO_APPROVE_AFTER_MS = 6000;

const BLOCKS: [string, string][] = [
  ["heading", "DISCHARGE SUMMARY"], ["paragraph", "FICTIONAL SAMPLE - FOR SOFTWARE TESTING ONLY"], ["paragraph", "Patient: Jane Example (fictional)"],
  ["heading", "Procedure"], ["paragraph", "Procedure: Total knee replacement, right knee."], ["heading", "Medications"],
  ["table_row", "Medication | Dose | Frequency | Duration"], ["table_row", "Examplamol | 500 mg | Every 6 hours | 7 days"],
  ["table_row", "Testocillin | 250 mg | Twice daily | 5 days"], ["table_row", "Placebex | 1-2 tablets | As needed | Until review"],
  ["heading", "Wound care"], ["list_item", "Keep the dressing clean and dry."], ["list_item", "Do not soak the wound in water until the stitches are removed."],
  ["heading", "Activity"], ["list_item", "Walk with the frame for short distances several times a day."], ["list_item", "Do not drive until reviewed by the surgeon."],
  ["heading", "Follow-up"], ["paragraph", "Wound check at the surgical clinic. Date to be confirmed."], ["paragraph", "Physiotherapy review in 2 weeks."],
  ["heading", "When to get help"], ["paragraph", "Contact the ward or emergency services if you notice heavy bleeding from the wound, new chest pain, or redness and swelling that is getting worse."],
];

interface F { path: string; value: Record<string, unknown>; quote: string; block: number }
const A: F[] = [
  { path: "procedure", value: { name: "Total knee replacement, right knee" }, quote: "Total knee replacement, right knee.", block: 5 },
  { path: "medications[0]", value: { name: "Examplamol", dose: "500 mg", frequency: "Every 6 hours", duration: "7 days" }, quote: "Examplamol | 500 mg | Every 6 hours | 7 days", block: 8 },
  { path: "medications[1]", value: { name: "Testocillin", dose: "250 mg", frequency: "Twice daily", duration: "5 days" }, quote: "Testocillin | 250 mg | Twice daily | 5 days", block: 9 },
  { path: "medications[2]", value: { name: "Placebex", dose: "1-2 tablets", frequency: "As needed", duration: "Until review" }, quote: "Placebex | 1-2 tablets | As needed | Until review", block: 10 },
  { path: "wound_care[0]", value: { instruction: "Keep the dressing clean and dry." }, quote: "Keep the dressing clean and dry.", block: 12 },
  { path: "wound_care[1]", value: { instruction: "Do not soak the wound in water until the stitches are removed." }, quote: "Do not soak the wound in water until the stitches are removed.", block: 13 },
  { path: "activity[0]", value: { instruction: "Walk with the frame for short distances several times a day." }, quote: "Walk with the frame for short distances several times a day.", block: 15 },
  { path: "activity[1]", value: { instruction: "Do not drive until reviewed by the surgeon." }, quote: "Do not drive until reviewed by the surgeon.", block: 16 },
  { path: "follow_ups[0]", value: { what: "Wound check at the surgical clinic", when: null }, quote: "Wound check at the surgical clinic. Date to be confirmed.", block: 18 },
  { path: "follow_ups[1]", value: { what: "Physiotherapy review", when: "in 2 weeks" }, quote: "Physiotherapy review in 2 weeks.", block: 19 },
  { path: "warning_signs[0]", value: { text: "heavy bleeding from the wound, new chest pain, or redness and swelling that is getting worse" }, quote: "heavy bleeding from the wound, new chest pain, or redness and swelling that is getting worse", block: 21 },
];
// Reader B differs on purpose in two places, so the comparison has something real to show.
const B: F[] = A.map((f) => ({ ...f, value: { ...f.value } }));
B[3].value = { name: "Placebex", dose: "1 tablet", frequency: "As needed", duration: "Until review" };
B[8].value = { what: "Wound check at the surgical clinic", when: "next week" };

const VERDICTS: { id: string; category: string; status: string }[] = [
  { id: "f1", category: "procedure", status: "agreed" }, { id: "f2", category: "medications", status: "agreed" }, { id: "f3", category: "medications", status: "agreed" },
  { id: "f4", category: "medications", status: "review" }, { id: "f5", category: "wound_care", status: "agreed" }, { id: "f6", category: "wound_care", status: "agreed" },
  { id: "f7", category: "activity", status: "agreed" }, { id: "f8", category: "activity", status: "agreed" }, { id: "f9", category: "follow_ups", status: "conflict" },
  { id: "f10", category: "follow_ups", status: "agreed" }, { id: "f11", category: "warning_signs", status: "agreed" },
];

export interface DemoStep { at: number; type: string; payload: Record<string, unknown> }

/** The whole simulated run as a list of (time, event) pairs. `at` is milliseconds from the start. */
export function demoSchedule(): DemoStep[] {
  const s: DemoStep[] = [];
  const add = (at: number, type: string, payload: Record<string, unknown> = {}) => s.push({ at, type, payload });
  add(0, "parse.started", { filename: DEMO_FILENAME });
  BLOCKS.forEach(([type, text], i) => add(250 + i * 110, "parse.block", { block_id: `b${i + 1}`, type, preview: text.slice(0, 80) }));
  add(3000, "parse.done", { blocks: BLOCKS.length });
  add(3200, "extract.a.started", { model: DEMO_MODELS.a });
  add(3350, "extract.b.started", { model: DEMO_MODELS.b });
  A.forEach((f, i) => add(4000 + i * 430, "extract.a.field", { path: f.path, value: f.value, source_quote: f.quote, block_id: `b${f.block}` }));
  B.forEach((f, i) => add(4300 + i * 480, "extract.b.field", { path: f.path, value: f.value, source_quote: f.quote, block_id: `b${f.block}` }));
  add(4000 + A.length * 430 + 150, "extract.a.done", { fields: A.length, missing: 1 });
  add(4300 + B.length * 480 + 150, "extract.b.done", { fields: B.length, missing: 1 });
  const g0 = 4300 + B.length * 480 + 500;
  add(g0, "ground.a.done", { pass: A.length, fail: 0 });
  add(g0 + 600, "ground.b.done", { pass: B.length - 1, fail: 1 });
  const r0 = g0 + 1300;
  VERDICTS.forEach((v, i) => add(r0 + i * 380, "reconcile.field", { field_id: v.id, category: v.category, status: v.status }));
  const rEnd = r0 + VERDICTS.length * 380;
  add(rEnd + 200, "reconcile.done", { agreed: VERDICTS.filter((v) => v.status === "agreed").length, review: VERDICTS.filter((v) => v.status === "review").length, conflict: VERDICTS.filter((v) => v.status === "conflict").length, rejected: 0 });
  add(rEnd + 600, "review.ready", {});
  return s.sort((x, y) => x.at - y.at);
}

/** Materialise a schedule into events (seq/ts) starting at `start`. */
export function demoEvents(steps: DemoStep[], start: number): Ev[] {
  return steps.map((st, i) => ({ seq: i + 1, ts: new Date(start + st.at).toISOString(), type: st.type, payload: st.payload }));
}

export const DEMO_RECON = VERDICTS.map((v, i) => ({
  id: v.id, category: v.category, status: v.status,
  final: Object.values(A[i].value).filter((x) => x !== null && x !== "").join(" · "), issues: v.status === "agreed" ? [] : v.id === "f4" ? ["Dose is a range (1-2 tablets): a person must decide."] : ["Readers disagree on the follow-up date."],
}));
