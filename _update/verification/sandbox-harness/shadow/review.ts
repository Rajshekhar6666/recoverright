// HARNESS-ONLY reconstruction (the real lib/review.ts was not in the ZIP). Shapes inferred from usage in Theater/patient.ts.
export const CATEGORY_LABEL: Record<string, string> = { medications: "Medication", follow_ups: "Follow-up", wound_care: "Wound care", activity: "Activity", diet: "Diet", warning_signs: "Warning sign", contacts: "Contact", procedure: "Procedure" };
export const VOTER_LABEL: Record<string, string> = { A: "Reader A", B: "Reader B", RULE: "Table reader" };
export const currentAttrs = (it: any) => (it.decision?.attrs ?? it.field.attrs ?? null);
export const needsDecision = (it: any) => it.field.status !== "agreed";
export const timeAgo = (iso: string) => { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s/60)}m ago` : `${Math.floor(s/3600)}h ago`; };
