/**
 * Distress / medicine phrase detection for the patient voice feature.
 * Pure functions, no browser APIs, fully unit-tested (see web/tests/phrases.test.ts).
 *
 * Design rules (each one fixes a bug in the previous regex):
 *  - Negation is judged LOCALLY (the few words before each match, within the same clause),
 *    never over the whole sentence. "no pain but I can't breathe" is still an emergency.
 *  - Phrases that contain their own negation ("can't breathe", "don't feel well") are never suppressed.
 *  - "cannot / can not / cant", curly apostrophes and punctuation are normalised first.
 *  - "help" only counts when it is a request ("I need help", "help me", a bare "help"),
 *    not in "can you help me understand my tablets".
 *  - Hypotheticals are NOT suppressed: for a safety feature a false alarm is cheaper than a missed one.
 */

export type Severity = "critical" | "concern";
export type DistressKind = "breathing" | "chest" | "bleeding" | "faint" | "pain" | "emergency" | "help" | "unwell" | "dizzy";

export interface Detection {
  severity: Severity;
  kind: DistressKind;
  /** Short human label used in the UI ("trouble breathing"). */
  label: string;
  /** The normalised text that matched. */
  phrase: string;
}

export const normalize = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`´]/g, "'")
    .replace(/\bcan\s*not\b/g, "can't")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bcant\b/g, "can't")
    .replace(/\bdont\b/g, "don't")
    .replace(/\bwont\b/g, "won't")
    .replace(/\bdidnt\b/g, "didn't")
    .replace(/\bi\s+m\b/g, "i'm")
    .replace(/[^a-z0-9'\u0900-\u097f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Rule {
  re: RegExp;
  kind: DistressKind;
  severity: Severity;
  label: string;
  /** The phrase already contains its own negation ("can't breathe"): never treat a preceding "no/not" as cancelling it. */
  selfNegating?: boolean;
  /** Ignore this rule when the sentence is a question about getting help ("can you help me ..."). */
  skipOnQuestion?: boolean;
}

const rule = (src: string, kind: DistressKind, severity: Severity, label: string, selfNegating = false, skipOnQuestion = false): Rule =>
  ({ re: new RegExp(src, "g"), kind, severity, label, selfNegating, skipOnQuestion });

const RULES: Rule[] = [
  // ---- critical ----
  // "can't breathe" already contains its own negation, so a preceding "no," must not cancel it.
  rule(String.raw`\b(?:can't|unable to|not able to)\s+(?:catch(?:ing)?\s+|get(?:ting)?\s+)?(?:my\s+)?(?:breathe|breathing|breath)\b|\b(?:gasping for (?:air|breath)|choking)\b|सांस\s*नहीं|\bsaans\s+nahi\b`,
    "breathing", "critical", "trouble breathing", true),
  // "trouble breathing" CAN be negated: "no trouble breathing" is fine.
  rule(String.raw`\b(?:struggling to|hard to|difficult to|(?:having |have |with )?(?:trouble|difficulty|problems?)(?: in)?|short of|shortness of)\s+(?:catch(?:ing)?\s+|get(?:ting)?\s+)?(?:my\s+)?(?:breathe|breathing|breath)\b`,
    "breathing", "critical", "trouble breathing"),
  rule(String.raw`\bchest\s+(?:pain|pains|tightness|pressure|discomfort|hurts?|is\s+(?:tight|hurting|heavy))\b|\bpain\s+in\s+(?:my\s+)?chest\b|\btight(?:ness)?\s+in\s+(?:my\s+)?chest\b|\bheart\s+attack\b|सीने\s*में\s*दर्द|\bseene\s+mein\s+dard\b`,
    "chest", "critical", "chest pain"),
  rule(String.raw`\b(?:heavy|severe|serious|a\s+lot\s+of|lots\s+of|too\s+much)\s+bleeding\b|\bbleeding\s+(?:a\s+lot|heavily|badly|profusely|through)\b`,
    "bleeding", "critical", "heavy bleeding"),
  rule(String.raw`\b(?:won't|will\s+not)\s+stop\s+bleeding\b|\bbleeding\s+won't\s+stop\b`, "bleeding", "critical", "heavy bleeding", true),
  rule(String.raw`\b(?:faint(?:ing)?|fainted|passing\s+out|pass(?:ed)?\s+out|about\s+to\s+collapse|collapsed?|blacking\s+out|black(?:ed)?\s+out|unconscious|losing\s+consciousness)\b`,
    "faint", "critical", "feeling faint"),
  rule(String.raw`\b(?:severe|terrible|unbearable|worst|intense|excruciating|a\s+lot\s+of|lot\s+of)\s+pain\b|\bpain\s+is\s+(?:severe|unbearable|terrible|excruciating)\b`,
    "pain", "critical", "severe pain"),
  rule(String.raw`\bemergency\b|\b(?:need|want)\s+(?:an?\s+|the\s+)?ambulance\b|^(?:please\s+)?(?:call|get|bring)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:ambulance|emergency)\b`,
    "emergency", "critical", "an emergency"),

  // ---- concern (still opens the emergency screen) ----
  rule(String.raw`\b(?:need|want|require)\s+(?:some\s+|any\s+|urgent\s+|immediate\s+|emergency\s+|medical\s+)?help\b`,
    "help", "concern", "needing help"),
  rule(String.raw`\b(?:please\s+|somebody\s+|someone\s+)?help\s+me\b(?!\s+(?:with|understand|find|figure|choose|decide|know|see|read|learn|remember|set|use|check|plan|to)\b)`,
    "help", "concern", "needing help", false, true),
  rule(String.raw`^(?:please\s+|somebody\s+|someone\s+)?help(?:\s+me)?(?:\s+please)?$`, "help", "concern", "needing help", false, true),
  rule(String.raw`^(?:please\s+)?(?:call|get)\s+(?:me\s+)?(?:a\s+|the\s+|my\s+)?(?:doctor|nurse|care\s+team|hospital)\b|\b(?:need|want)\s+(?:a\s+|the\s+|my\s+)?(?:doctor|nurse)\b`,
    "help", "concern", "wanting a nurse or doctor"),
  // These contain their own negation ("not feeling well"): never cancelled by an earlier "no".
  rule(String.raw`\b(?:not\s+well|not\s+feeling\s+(?:well|good|right|okay|ok|great|myself)|(?:don't|do\s+not)\s+feel\s+(?:well|good|right|okay|ok|great|myself|safe)|not\s+(?:okay|ok))\b`,
    "unwell", "concern", "feeling unwell", true),
  // These can be negated: "I don't feel dizzy", "I'm not sick".
  rule(String.raw`\b(?:unwell|feel(?:ing)?\s+(?:very\s+|really\s+|so\s+|quite\s+|a\s+bit\s+|a\s+little\s+|kind\s+of\s+|rather\s+)?(?:unwell|sick|ill|bad|awful|terrible|dizzy|faint|weak|lightheaded|light\s+headed|nauseous|nauseated|worse|strange|weird|off|numb|feverish|breathless))\b`,
    "unwell", "concern", "feeling unwell"),
  rule(String.raw`\b(?:i'm|i\s+am)\s+(?:sick|ill|unwell|in\s+pain|vomiting|bleeding|feeling\s+(?:sick|ill|unwell|worse|dizzy|bad|weak))\b|\b(?:i\s+have|i've\s+got|having)\s+(?:a\s+)?(?:high\s+)?fever\b`,
    "unwell", "concern", "feeling unwell"),
  rule(String.raw`\b(?:dizzy|dizziness|light\s*headed|giddy|vomiting|throwing\s+up|nauseous)\b|चक्कर|\bchakkar\b`, "dizzy", "concern", "feeling dizzy"),
  rule(String.raw`\b(?:madad|bachao|bachaao)\b|मदद|बचाओ`, "help", "concern", "needing help"),
  rule(String.raw`\btabiyat\s+(?:kharab|theek\s+nahi)\b|तबीयत\s*खराब`, "unwell", "concern", "feeling unwell", true),
];

const NEGATOR = /^(?:no|not|never|without|none|nothing|stopped|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|didn't|doesn't|don't|won't|wouldn't|free)$|n't$/;
const CLAUSE_BREAK = /\b(?:but|however|although|though|except|then|while)\b/;
const HELP_QUESTION = /\b(?:can|could|would|will|may|how can|how do i|how to|what can)\s+(?:you|u|i|we)?\s*help\b/;

function negatedBefore(text: string, start: number): boolean {
  const clause = text.slice(0, start).split(CLAUSE_BREAK).pop() ?? "";
  const words = clause.trim().split(" ").filter(Boolean).slice(-4);
  return words.some((w) => NEGATOR.test(w));
}

const rank = (s: Severity) => (s === "critical" ? 2 : 1);

/** Returns the most serious non-negated distress phrase in `raw`, or null. */
export function detectDistress(raw: string): Detection | null {
  const text = normalize(raw);
  if (!text) return null;
  const isHelpQuestion = HELP_QUESTION.test(text);
  let best: Detection | null = null;
  for (const r of RULES) {
    if (isHelpQuestion && r.skipOnQuestion) continue;
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text)) !== null) {
      if (m[0] === "") { r.re.lastIndex++; continue; }
      if (!r.selfNegating && negatedBefore(text, m.index)) continue;
      const hit: Detection = { severity: r.severity, kind: r.kind, label: r.label, phrase: text };
      if (!best || rank(hit.severity) > rank(best.severity)) best = hit;
    }
  }
  return best;
}

const TOOK_RE = /\b(?:i\s+)?(?:have\s+|'ve\s+|just\s+)*(?:took|taken|swallowed|finished)\s+(?:it|that|them|my|the|all|both|one|two|a)\b|\bi\s+(?:had|have\s+had)\s+(?:my|the|all)\s+(?:medicine|medicines|medication|medications|tablet|tablets|pill|pills|dose)\b|\b(?:medicine|medication|tablet|pill|dose)\s+(?:is\s+)?done\b/;
const NOT_TOOK = /\b(?:not|never|haven't|hadn't|didn't|yet|forgot|forget|without|n't)\b/;

/** "I took my medicine" style confirmations. A negation anywhere in the phrase cancels it. */
export function detectTookMedicine(raw: string): boolean {
  const text = normalize(raw);
  if (!text || !TOOK_RE.test(text)) return false;
  return !NOT_TOOK.test(text);
}
