/**
 * Everything the patient app understands from speech. Pure functions, no React, so it can be tested on its own.
 * Distress detection is deliberately eager: a false alarm costs staff a minute, a missed alarm can cost far more.
 */
export type Severity = "critical" | "concern";
export type Intent = "yes" | "later" | "next_dose" | "list_meds" | "appointment" | "wound" | "activity" | "diet" | "warning" | "capabilities" | "greet" | "none";

export const norm = (s: string) =>
  s.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ distress
const BENIGN_HELP = /\b(can you help (me )?(understand|with|find|know|tell|explain|plan)|how (does|do|can) (this|it|you) help|what (can|do) you (do|help)|helps? (me )?(heal|recover))\b/g;
const CRITICAL = /\b(help|help me|need help|emergency|ambulance|chest pain|chest (is )?(tight|hurts|hurting)|can'?t breathe|cannot breathe|(trouble|difficulty|hard to) breath(e|ing)|short of breath|heavy bleeding|bleeding (a lot|badly|heavily)|won'?t stop bleeding|fainted|fainting|passed out|about to faint|severe pain|terrible pain|unbearable|i (have )?fallen|i fell|fell down|something is (very |really )?wrong|call (a |the |my )?(doctor|nurse|ambulance)|need (a |the )?(doctor|nurse)|madad|bachao|bachaao|saans nahi|seene mein dard|behosh)\b/;
const CRITICAL_DEV = /(मदद|बचाओ|सांस नहीं|सीने में दर्द|बेहोश)/;
const FUZZY_HELP = new Set(["hep", "helb", "halp", "yelp", "elp", "helf", "helpp"]);
const CONCERN = /\b(unwell|not (feeling|doing) (well|good|right|okay|ok)|(don'?t|do not) feel (well|good|right|okay|ok)|feel(ing)? (sick|bad|dizzy|faint|weak|worse|hot|feverish|strange|odd|nauseous|unwell)|i (am|'m) (sick|dizzy|weak|worse|not okay|not ok)|getting worse|nausea|nauseous|vomit(ing)?|threw up|throwing up|tabiyat kharab|tabiyat theek nahi|ulti|bukhar|chakkar)\b/;
const CONCERN_DEV = /(तबियत खराब|तबीयत खराब|दर्द|चक्कर|उल्टी|बुखार)/;
const HIGH_ONLY = /\b(pain|painful|hurts?|hurting|ache|aching|dizzy|dizziness|fever|swollen|swelling|bleeding|breathless|palpitations?|shivering|numb|numbness|dard)\b/g;
const NEGATORS = new Set(["no", "not", "without", "never", "nothing", "zero", "less", "stopped", "gone", "haven't", "hasn't", "doesn't", "don't", "didn't", "isn't", "aren't", "wasn't", "any"]);

const RELIEVED = new Set(["gone", "better", "less", "improved", "improving", "away", "stopped", "settled"]);
function negated(words: string[], at: number): boolean {
  return words.slice(Math.max(0, at - 3), at).some((w) => NEGATORS.has(w)) || words.slice(at + 1, at + 4).some((w) => RELIEVED.has(w));
}

export function detectDistress(texts: string[], opts: { high: boolean }): { severity: Severity; match: string } | null {
  let concern: string | null = null;
  for (const raw of texts) {
    if (!raw) continue;
    if (CRITICAL_DEV.test(raw)) return { severity: "critical", match: raw };
    const s = norm(raw).replace(BENIGN_HELP, " ");
    const words = s.split(" ").filter(Boolean);
    if (!words.length) continue;
    const c = CRITICAL.exec(s);
    if (c) return { severity: "critical", match: c[0] };
    if (words.length <= 4 && words.some((w) => FUZZY_HELP.has(w))) return { severity: "critical", match: s };
    if (CONCERN_DEV.test(raw)) concern ??= raw;
    const k = CONCERN.exec(s);
    if (k) concern ??= k[0];
    if (opts.high && !concern) {
      HIGH_ONLY.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = HIGH_ONLY.exec(s))) {
        const at = s.slice(0, m.index).split(" ").filter(Boolean).length;
        if (!negated(words, at)) { concern = m[0]; break; }
      }
    }
  }
  return concern ? { severity: "concern", match: concern } : null;
}

// ------------------------------------------------------------------ questions and reminder answers
export function parseIntent(said: string, ctx: { reminderOpen: boolean }): Intent {
  const s = norm(said);
  if (!s) return "none";
  if (ctx.reminderOpen) {
    if (/\b(not yet|later|wait|remind|snooze|no)\b/.test(s)) return "later";
    if (/\b(yes|yeah|yep|yup|done|okay|ok)\b/.test(s)) return "yes";
  }
  if (/\b(next (dose|medicine|medication|tablet|pill)|when (do|should) i take|(which|what) (medicine|medication|tablet)s? (is |am i |do i )?(now|next|take now|to take)|what do i take)\b/.test(s)) return "next_dose";
  if (/\b(appointment|follow ?up|doctor visit|when (do|should) i (see|visit))\b/.test(s)) return "appointment";
  if (/\b(wound|dressing|stitch(es)?|bandage|shower|bath)\b/.test(s)) return "wound";
  if (/\b(walk(ing)?|exercise|activity|drive|driving|physio\w*|move|movement)\b/.test(s)) return "activity";
  if (/\b(diet|eat(ing)?|food|drink(ing)?|water|hydrat\w*)\b/.test(s)) return "diet";
  if (/\b(warning signs?|danger signs?|what to watch|when (should|do) i (worry|get help))\b/.test(s)) return "warning";
  if (/\b(medicines?|medications?|tablets?|pills?)\b/.test(s)) return "list_meds";
  if (/\b(what can (i|you)|what do i say|how does this work)\b/.test(s)) return "capabilities";
  if (/^(hello|hi|hey|namaste)\b/.test(s)) return "greet";
  return "none";
}

// ------------------------------------------------------------------ spoken task confirmation
export interface TaskRef { id: string; n: number; kw: RegExp | null }
export interface TaskCommand { id: string; done: boolean }

const WORDNUM: Record<string, number> = { one: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, five: 5, six: 6 };
const ORDINAL: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
const QUESTION = /^(what|when|where|which|who|how|why|should|can|could|do|does|is|are|will|would|did (i|you)|have (i|you)|has)\b/;
const NEGATIVE = /\b(not yet|haven'?t|hasn'?t|didn'?t|did not|have not|never|still need|later)\b/;
const UNDO = /\b(undo|untick|uncheck|unmark|not done|incomplete|not complete)\b/;
const DONE = /\b(done|complete(d)?|finish(ed)?|did|took|taken|had|washed|cleaned|changed|walked|drank|drunk|booked|called|confirmed|scheduled|ticked|tick|checked|marked|exercised|stretched|applied|rested)\b/;
const BY_NUMBER = /\b(?:task|number|item|step)\s*(?:no\.?\s*|number\s*)?(\d+|one|two|to|too|three|tree|four|for|five|six)\b/g;
const BY_ORDINAL = /\b(first|second|third|fourth|fifth|sixth)\s+(?:task|one|item)\b/g;

/** "task 1 done", "I took my medicine", "I washed my wound and walked", "undo task 2". Returns every task it can tell was meant. */
export function parseTaskCommands(said: string, tasks: TaskRef[]): TaskCommand[] {
  const s = norm(said);
  if (!s || QUESTION.test(s)) return [];
  const undo = UNDO.test(s);
  if (NEGATIVE.test(s) && !undo) return [];
  const out = new Map<string, boolean>();
  const add = (id: string) => out.set(id, !undo);

  const nums = new Set<number>();
  for (const m of s.matchAll(BY_NUMBER)) nums.add(/^\d+$/.test(m[1]) ? Number(m[1]) : WORDNUM[m[1]]);
  for (const m of s.matchAll(BY_ORDINAL)) nums.add(ORDINAL[m[1]]);
  if (nums.size && (undo || DONE.test(s))) {
    for (const n of nums) { const t = tasks.find((x) => x.n === n); if (t) add(t.id); }
    return [...out].map(([id, done]) => ({ id, done }));
  }
  if (!undo && !DONE.test(s)) return [];
  for (const t of tasks) if (t.kw && t.kw.test(s)) add(t.id);
  if (!out.size && !undo && /\b(took|taken|had)\s+(it|them|that|one|both)\b/.test(s) && tasks.some((t) => t.id === "med")) add("med");
  return [...out].map(([id, done]) => ({ id, done }));
}

// ------------------------------------------------------------------ the app hearing its own voice
export function isEcho(said: string, lastSpoken: string): boolean {
  const a = norm(said).split(" ").filter(Boolean);
  if (!a.length || !lastSpoken) return false;
  const b = new Set(norm(lastSpoken).split(" "));
  return a.filter((w) => b.has(w)).length / a.length >= 0.75;
}
