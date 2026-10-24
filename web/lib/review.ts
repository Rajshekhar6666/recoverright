import type { Attrs, ReconciledField, ReviewField } from "./types";

export const CATEGORY_LABEL: Record<string, string> = {
  procedure: "Procedure",
  medications: "Medication",
  wound_care: "Wound care",
  activity: "Activity",
  diet: "Diet",
  follow_ups: "Follow-up",
  warning_signs: "Warning sign",
  contacts: "Contact",
};

/** Attributes shown (and editable) for each category, in display order. */
export const CATEGORY_ATTRS: Record<string, string[]> = {
  procedure: ["value"],
  medications: ["name", "dose", "frequency", "duration", "route"],
  wound_care: ["instruction"],
  activity: ["instruction"],
  diet: ["instruction"],
  follow_ups: ["what", "when", "where"],
  warning_signs: ["text"],
  contacts: ["label", "value"],
};

export const ATTR_LABEL: Record<string, string> = {
  name: "Medication", dose: "Dose", frequency: "Frequency", duration: "Duration", route: "Route",
  instruction: "Instruction", text: "Text", what: "What", when: "When", where: "Where",
  value: "Value", label: "Label",
};

/** Missing values in these are worth showing, because staff must fill them in. */
export const REQUIRED_ATTRS = new Set(["dose", "frequency", "duration", "when"]);
export const LONG_ATTRS = new Set(["instruction", "text"]);

export const VOTER_LABEL: Record<string, string> = { A: "Extractor A", B: "Extractor B", rules: "Table reader" };

export function needsDecision(f: ReconciledField): boolean {
  return f.status !== "agreed" || f.critical;
}

export function currentAttrs(it: ReviewField): Attrs | null {
  if (it.decision?.action === "edit") return it.decision.attrs;
  return it.field.proposed;
}

export const LANGS: [string, string][] = [
  ["en", "English"], ["hi", "हिन्दी (Hindi)"], ["es", "Español (Spanish)"], ["fr", "Français (French)"],
  ["zh", "中文 (Chinese)"], ["ar", "العربية (Arabic)"], ["pt", "Português (Portuguese)"],
];

export function timeAgo(iso?: string | null): string {
  if (!iso) return "–";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "–";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
