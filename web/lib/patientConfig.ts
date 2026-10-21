/** Change these for your hospital. */
export const EMERGENCY_NUMBER = "112"; // India's single emergency number; change it if your hospital is elsewhere
export const DISTRESS_COOLDOWN_MS = 8000;
/** Put your hospital's help-line in web/.env.local as NEXT_PUBLIC_CARE_TEAM_PHONE=+91... (used when the plan has no usable number). */
export const CARE_TEAM_PHONE = process.env.NEXT_PUBLIC_CARE_TEAM_PHONE ?? "";

/** A phone number made of zeros (the demo placeholder) is not a number you can call. */
export const realPhone = (raw: string): string => {
  const p = (/\+?\d[\d\s()-]{6,}/.exec(raw ?? "")?.[0] ?? "").replace(/[^\d+]/g, "");
  return /[1-9]/.test(p) ? p : "";
};
