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
const CRITICAL = /\b(help|help me|need help|emergency|ambulance|chest pain|chest (is )?(tight|hurts|hurting)|can'?t breathe|cannot breathe|(trouble|difficulty|hard to) breath(e|ing)|short of breath|heavy bleeding|bleeding (a lot|badly|heavily)|won'?t stop bleeding|fainted|fainting|passed out|about to faint|severe pain|terrible pain|unbearable|i (have )?fallen|i fell|fell down|something is (very |really )?wrong|call (a |the |my )?(doctor|nurse|ambulance)|need (a |the )?(doctor|nurse)|madad|bachao|bachaao|saans nahi|seene mein dard|chhati me dard|saans lene me takleef|khoon nikal raha|behosh|gir gaya|taanke toot)\b/;
const CRITICAL_DEV = /(हेल्प|इमरजेंसी|सहायता|मदद|बचाओ|सांस नहीं|सीने में दर्द|छाती में दर्द|बेहोश|खून बह रहा|खून निकल रहा|गिर गया|टांके टूट|एंबुलेंस|डॉक्टर बुलाओ)/;
const FUZZY_HELP = new Set(["hep", "helb", "halp", "yelp", "elp", "helf", "helpp"]);
const CONCERN = /\b(unwell|not (feeling|doing) (well|good|right|okay|ok)|(don'?t|do not) feel (well|good|right|okay|ok)|feel(ing)? (sick|bad|dizzy|faint|weak|worse|hot|feverish|strange|odd|nauseous|unwell)|i (am|'m) (sick|dizzy|weak|worse|not okay|not ok)|getting worse|nausea|nauseous|vomit(ing)?|threw up|throwing up|tabiyat kharab|tabiyat theek nahi|ulti|bukhar|chakkar|ji ghabra raha|ghabrahat|kamzori|taap|dard ho raha|sujan|soojan)\b/;
const CONCERN_DEV = /(तबियत खराब|तबीयत खराब|दर्द|चक्कर|उल्टी|बुखार|घबराहट|कमजोरी|सूजन|जी घबरा रहा)/;
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

const WORDNUM: Record<string, number> = {
  one: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, five: 5, six: 6,
  ek: 1, do: 2, teen: 3, chaar: 4, paanch: 5, chhah: 6,
  वन: 1, टू: 2, थ्री: 3, फोर: 4, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6,
};
const ORDINAL: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  pehla: 1, pehli: 1, doosra: 2, doosri: 2, dusra: 2, dusri: 2,
  teesra: 3, teesri: 3, tisra: 3, tisri: 3, chautha: 4, chauthi: 4, paanchva: 5,
  पहला: 1, पहली: 1, दूसरा: 2, दूसरी: 2, तीसरा: 3, तीसरी: 3, चौथा: 4, चौथी: 4,
};
const QUESTION = /^(what|when|where|which|who|how|why|should|can|could|do|does|is|are|will|would|did (i|you)|have (i|you)|has)\b/;
const NEGATIVE = /\b(not yet|haven'?t|hasn'?t|didn'?t|did not|have not|never|still need|later|nahi|abhi nahi)\b/;
const UNDO = /\b(undo|untick|uncheck|unmark|not done|incomplete|not complete|wapas|hata do)\b/;
const DONE = /\b(done|complete(d)?|comple|finish(ed)?|did|took|taken|had|washed|cleaned|changed|walked|drank|drunk|booked|called|confirmed|scheduled|ticked|tick|checked|check|mark|marked|exercised|stretched|applied|rested|ho gaya|ho gya|hogaya|ho gayi|hogayi|ho gaye|le li|leli|le liya|leliya|kha li|khali|kha liya|khaliya|pee li|peeli|pee liya|peeliya|badal li|badal diya|saaf kar liya|ghoom liya|tehal liya)\b|डन|कम्प्लीट|हो गया|हो गई|हो गए|कर लिया|कर ली|कर दिया|पूरा हुआ|पूरा हो गया|पूरा|किया|ले ली|ले लिया|खा ली|खा लिया|पी ली|पी लिया/i;
const BY_NUMBER = /(?:task|number|item|step|kaam|kary|टास्क|काम|कार्य)\s*(?:no\.?\s*|number\s*|नंबर\s*)?(\d+|one|two|to|too|three|tree|four|for|five|six|ek|do|teen|chaar|paanch|chhah|वन|टू|थ्री|फोर|एक|दो|तीन|चार|पाँच|पांच|छह)\b/giu;
const BY_ORDINAL = /(first|second|third|fourth|fifth|sixth|pehla|pehli|doosra|doosri|dusra|dusri|teesra|teesri|tisra|tisri|chautha|chauthi|paanchva|पहला|पहली|दूसरा|दूसरी|तीसरा|तीसरी|चौथा|चौथी)\s*(?:task|one|item|kaam|टास्क|काम)?\b/giu;

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
  if (!said || !lastSpoken) return false;
  // CRITICAL SAFETY RULE: Emergency distress phrases must NEVER be suppressed as echo!
  if (/\b(help|emergency|madad|bachao|breathe|pain|dard|saans|doctor|nurse)\b/i.test(said)) return false;
  // If the browser speech synthesis is not currently active, it is impossible for the microphone to hear an echo
  if (typeof window !== "undefined" && window.speechSynthesis && !window.speechSynthesis.speaking) return false;

  const a = norm(said).split(" ").filter(Boolean);
  if (!a.length) return false;
  // For short 1-2 word utterances (e.g. "task 1", "task one", "dawai"), never treat as echo unless it's an exact match of the entire last spoken phrase
  if (a.length <= 2) {
    return norm(said) === norm(lastSpoken);
  }
  const b = new Set(norm(lastSpoken).split(" "));
  return a.filter((w) => b.has(w)).length / a.length >= 0.85;
}
