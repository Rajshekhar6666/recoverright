import test from "node:test";
import assert from "node:assert/strict";
import { DICTIONARY } from "../lib/i18n";
import { detectDistress, isEcho, parseIntent, parseTaskCommands, type TaskRef } from "../lib/voice";
import {
  parseBilingualCommand,
  resolveTaskFromUtterance,
  type TaskContextItem,
} from "../lib/voiceEngine";

const mockTasks: TaskRef[] = [
  { id: "care", n: 1, kw: /\b(wound|dressing|bandage|stitch|clean|wash)/ },
  { id: "med", n: 2, kw: /\b(medicine|medication|tablet|pill|dose|capsule)/ },
  { id: "move", n: 3, kw: /\b(exercise|walk|physio|stretch|moved)/ },
  { id: "fu", n: 4, kw: /\b(appointment|follow ?up|clinic)/ },
];

const mockPatientTasks: TaskContextItem[] = [
  { id: "task-wound", title: "Clean and dress surgical wound", category: "wound_care", status: "pending", n: 1 },
  { id: "task-med", title: "Take Paracetamol 500 mg", category: "medication", status: "pending", n: 2, scheduled_time: "02:00 PM" },
  { id: "task-exercise", title: "Post-op walking and knee flex exercise", category: "activity", status: "pending", n: 3 },
];

test("voice assistant task command parsing", async (t) => {
  await t.test("matches tasks by explicit number", () => {
    const res1 = parseTaskCommands("task 1 done", mockTasks);
    assert.deepEqual(res1, [{ id: "care", done: true }]);

    const res2 = parseTaskCommands("task two completed", mockTasks);
    assert.deepEqual(res2, [{ id: "med", done: true }]);

    const res3 = parseTaskCommands("undo task 3", mockTasks);
    assert.deepEqual(res3, [{ id: "move", done: false }]);
  });

  await t.test("matches tasks by spoken activity keywords", () => {
    const resMed = parseTaskCommands("I took my medicine", mockTasks);
    assert.deepEqual(resMed, [{ id: "med", done: true }]);

    const resWound = parseTaskCommands("I cleaned and dressed my wound", mockTasks);
    assert.deepEqual(resWound, [{ id: "care", done: true }]);

    const resMove = parseTaskCommands("I walked for fifteen minutes", mockTasks);
    assert.deepEqual(resMove, [{ id: "move", done: true }]);
  });

  await t.test("ignores questions without action", () => {
    const q1 = parseTaskCommands("what is task 1?", mockTasks);
    assert.deepEqual(q1, []);

    const q2 = parseTaskCommands("how do I do task 2?", mockTasks);
    assert.deepEqual(q2, []);
  });
});

test("bilingual voice engine command parser (English & Hindi)", async (t) => {
  await t.test("parses English task and medicine completion commands", () => {
    const c1 = parseBilingualCommand("I took my Paracetamol", "en");
    assert.equal(c1.type, "task_complete");
    assert.equal(c1.target, "Paracetamol");

    const c2 = parseBilingualCommand("Pantoprazole taken", "en");
    assert.equal(c2.type, "task_complete");
    assert.equal(c2.target, "Pantoprazole");

    const c3 = parseBilingualCommand("task 1 complete", "en");
    assert.equal(c3.type, "task_complete");
  });

  await t.test("parses Hindi task and medicine completion commands", () => {
    const c1 = parseBilingualCommand("दवा ले ली", "hi");
    assert.equal(c1.type, "task_complete");

    const c2 = parseBilingualCommand("पैरासिटामोल खा ली", "hi");
    assert.equal(c2.type, "task_complete");
    assert.equal(c2.target, "Paracetamol");

    const c3 = parseBilingualCommand("पहला काम हो गया", "hi");
    assert.equal(c3.type, "task_complete");
  });

  await t.test("parses emergency/distress in English and Hindi with top priority", () => {
    const e1 = parseBilingualCommand("help, severe chest pain", "en");
    assert.equal(e1.type, "emergency");

    const e2 = parseBilingualCommand("मदद चाहिए सांस नहीं आ रही", "hi");
    assert.equal(e2.type, "emergency");
  });

  await t.test("parses queries for next dose, plan, wound care, and warning signs", () => {
    const q1 = parseBilingualCommand("what is my next medicine?", "en");
    assert.equal(q1.type, "medication_query");

    const q2 = parseBilingualCommand("अगली दवा कब है?", "hi");
    assert.equal(q2.type, "medication_query");

    const q3 = parseBilingualCommand("show care plan", "en");
    assert.equal(q3.type, "care_plan");

    const q4 = parseBilingualCommand("मेरी देखभाल योजना दिखाओ", "hi");
    assert.equal(q4.type, "care_plan");

    const q5 = parseBilingualCommand("how to take care of wound", "en");
    assert.equal(q5.type, "wound_care");

    const q6 = parseBilingualCommand("घाव की देखभाल कैसे करें", "hi");
    assert.equal(q6.type, "wound_care");
  });

  await t.test("parses hospital staff commands for navigation, doc add, and approval", () => {
    const s1 = parseBilingualCommand("open patient Aarav", "en");
    assert.equal(s1.type, "staff_nav_patient");
    assert.equal(s1.target?.toLowerCase(), "aarav");

    const s2 = parseBilingualCommand("upload document", "en");
    assert.equal(s2.type, "staff_add_doc");

    const s3 = parseBilingualCommand("दस्तावेज़ जोड़ें", "hi");
    assert.equal(s3.type, "staff_add_doc");

    const s4 = parseBilingualCommand("approve plan", "en");
    assert.equal(s4.type, "staff_approve");
  });
});

test("intelligent natural task resolution against active patient tasks", async (t) => {
  await t.test("matches numbered tasks in natural Hindi and Hinglish", () => {
    // "Teesra kaam ho gaya"
    const r1 = resolveTaskFromUtterance("Teesra kaam ho gaya", mockPatientTasks, "hi");
    assert.equal(r1.status, "matched");
    assert.equal(r1.matchedTask?.id, "task-exercise");
    assert.equal(r1.matchedTask?.n, 3);

    // "Teesra ho gaya"
    const r2 = resolveTaskFromUtterance("Teesra ho gaya", mockPatientTasks, "hi");
    assert.equal(r2.status, "matched");
    assert.equal(r2.matchedTask?.id, "task-exercise");

    // "Third task complete ho gaya"
    const r3 = resolveTaskFromUtterance("Third task complete ho gaya", mockPatientTasks, "en");
    assert.equal(r3.status, "matched");
    assert.equal(r3.matchedTask?.id, "task-exercise");

    // "Maine doosra task complete kar diya"
    const r4 = resolveTaskFromUtterance("Maine doosra task complete kar diya", mockPatientTasks, "hi");
    assert.equal(r4.status, "matched");
    assert.equal(r4.matchedTask?.id, "task-med");
    assert.equal(r4.matchedTask?.n, 2);

    // "Pehla wala kaam kar liya"
    const r5 = resolveTaskFromUtterance("Pehla wala kaam kar liya", mockPatientTasks, "hi");
    assert.equal(r5.status, "matched");
    assert.equal(r5.matchedTask?.id, "task-wound");
    assert.equal(r5.matchedTask?.n, 1);
  });

  await t.test("matches descriptive activity & medication phrases", () => {
    // "Dawai le li"
    const r1 = resolveTaskFromUtterance("Dawai le li", mockPatientTasks, "hi");
    assert.equal(r1.status, "matched");
    assert.equal(r1.matchedTask?.id, "task-med");

    // "Maine dawai le li hai"
    const r2 = resolveTaskFromUtterance("Maine dawai le li hai", mockPatientTasks, "hi");
    assert.equal(r2.status, "matched");
    assert.equal(r2.matchedTask?.id, "task-med");

    // "Medicine le li"
    const r3 = resolveTaskFromUtterance("Medicine le li", mockPatientTasks, "hi");
    assert.equal(r3.status, "matched");

    // "Exercise kar li"
    const r4 = resolveTaskFromUtterance("Exercise kar li", mockPatientTasks, "hi");
    assert.equal(r4.status, "matched");
    assert.equal(r4.matchedTask?.id, "task-exercise");

    // "Walk ho gayi"
    const r5 = resolveTaskFromUtterance("Walk ho gayi", mockPatientTasks, "hi");
    assert.equal(r5.status, "matched");
    assert.equal(r5.matchedTask?.id, "task-exercise");

    // "Doctor ne jo exercise batayi thi, woh kar li"
    const r6 = resolveTaskFromUtterance("Doctor ne jo exercise batayi thi, woh kar li", mockPatientTasks, "hi");
    assert.equal(r6.status, "matched");
    assert.equal(r6.matchedTask?.id, "task-exercise");

    // "Paracetamol wali medicine le li"
    const r7 = resolveTaskFromUtterance("Paracetamol wali medicine le li", mockPatientTasks, "en");
    assert.equal(r7.status, "matched");
    assert.equal(r7.matchedTask?.id, "task-med");
  });

  await t.test("distinguishes future intention and does NOT mark complete", () => {
    // "Dawai abhi leni hai"
    const r1 = resolveTaskFromUtterance("Dawai abhi leni hai", mockPatientTasks, "hi");
    assert.equal(r1.status, "future_intention");
    assert.ok(r1.speechResponse.hi.includes("समय पर"));

    // "I have to take medicine later"
    const r2 = resolveTaskFromUtterance("I have to take medicine later", mockPatientTasks, "en");
    assert.equal(r2.status, "future_intention");
  });

  await t.test("distinguishes negation and does NOT mark complete", () => {
    // "Dawai nahi li"
    const r1 = resolveTaskFromUtterance("Dawai nahi li", mockPatientTasks, "hi");
    assert.equal(r1.status, "negation");
    assert.ok(r1.speechResponse.hi.includes("नहीं ली गई"));

    // "Maine exercise nahi ki"
    const r2 = resolveTaskFromUtterance("Maine exercise nahi ki", mockPatientTasks, "hi");
    assert.equal(r2.status, "negation");

    // "I did not take my medicine"
    const r3 = resolveTaskFromUtterance("I did not take my medicine", mockPatientTasks, "en");
    assert.equal(r3.status, "negation");
  });

  await t.test("distinguishes questions and does NOT mark complete", () => {
    // "Dawai le lu?"
    const r1 = resolveTaskFromUtterance("Dawai le lu?", mockPatientTasks, "hi");
    assert.equal(r1.status, "question");
    assert.ok(r1.speechResponse.hi.includes("निर्धारित है"));

    // "Should I take my medicine now?"
    const r2 = resolveTaskFromUtterance("Should I take my medicine now?", mockPatientTasks, "en");
    assert.equal(r2.status, "question");
  });

  await t.test("handles already completed tasks without duplicate records", () => {
    const tasksWithCompleted: TaskContextItem[] = [
      { id: "task-wound", title: "Clean wound", status: "completed", n: 1 },
      { id: "task-med", title: "Take medicine", status: "completed", n: 2 },
    ];

    const r = resolveTaskFromUtterance("Teesra kaam ho gaya", tasksWithCompleted, "hi");
    assert.equal(r.status, "not_found");

    const r2 = resolveTaskFromUtterance("Doosra task complete ho gaya", tasksWithCompleted, "hi");
    assert.equal(r2.status, "already_completed");
    assert.ok(r2.speechResponse.hi.includes("पहले से ही पूरा"));
  });

  await t.test("handles batch completion of all tasks", () => {
    const r = resolveTaskFromUtterance("Saare kaam ho gaye", mockPatientTasks, "hi");
    assert.equal(r.status, "all_matched");
    assert.equal(r.allTasks?.length, 3);
  });

  await t.test("handles ambiguity when multiple distinct medications are pending", () => {
    const multiMedTasks: TaskContextItem[] = [
      { id: "med-1", title: "Paracetamol 500 mg", category: "medication", status: "pending", n: 1 },
      { id: "med-2", title: "Amoxicillin 250 mg", category: "medication", status: "pending", n: 2 },
    ];

    // Generic "Dawai le li" without medicine name should ask for clarification
    const rAmbiguous = resolveTaskFromUtterance("Dawai le li", multiMedTasks, "hi");
    assert.equal(rAmbiguous.status, "ambiguous");
    assert.ok(rAmbiguous.speechResponse.hi.includes("कौन सी दवा"));

    // Specific "Paracetamol le li" should resolve directly
    const rSpecific = resolveTaskFromUtterance("Paracetamol le li", multiMedTasks, "hi");
    assert.equal(rSpecific.status, "matched");
    assert.equal(rSpecific.matchedTask?.id, "med-1");
  });
});

test("i18n dictionary completeness and clinical integrity", async (t) => {
  await t.test("ensures every English key exists in Hindi with non-empty translation", () => {
    const enKeys = Object.keys(DICTIONARY.en) as (keyof typeof DICTIONARY.en)[];
    const hiKeys = Object.keys(DICTIONARY.hi) as (keyof typeof DICTIONARY.hi)[];

    for (const key of enKeys) {
      assert.ok(key in DICTIONARY.hi, `Missing key in Hindi translation: ${key}`);
      assert.ok(DICTIONARY.hi[key], `Empty translation for key in Hindi: ${key}`);
    }
    assert.equal(enKeys.length, hiKeys.length);
  });

  await t.test("preserves clinical medicine names unaltered in both languages", () => {
    const medName = "Paracetamol";
    const dose = "500 mg";

    const enFormatted = DICTIONARY.en.ptTimeFor(medName, dose);
    const hiFormatted = DICTIONARY.hi.ptTimeFor(medName, dose);

    assert.ok(enFormatted.includes("Paracetamol 500 mg"), `English text should contain unmodified name: ${enFormatted}`);
    assert.ok(hiFormatted.includes("Paracetamol 500 mg"), `Hindi text should contain unmodified name: ${hiFormatted}`);
  });
});

test("voice assistant conversational intent parsing", async (t) => {
  await t.test("matches tasks by explicit number", () => {
    const res1 = parseTaskCommands("task 1 done", mockTasks);
    assert.deepEqual(res1, [{ id: "care", done: true }]);

    const res2 = parseTaskCommands("task two completed", mockTasks);
    assert.deepEqual(res2, [{ id: "med", done: true }]);

    const res3 = parseTaskCommands("undo task 3", mockTasks);
    assert.deepEqual(res3, [{ id: "move", done: false }]);
  });

  await t.test("matches tasks by spoken activity keywords", () => {
    const resMed = parseTaskCommands("I took my medicine", mockTasks);
    assert.deepEqual(resMed, [{ id: "med", done: true }]);

    const resWound = parseTaskCommands("I cleaned and dressed my wound", mockTasks);
    assert.deepEqual(resWound, [{ id: "care", done: true }]);

    const resMove = parseTaskCommands("I walked for fifteen minutes", mockTasks);
    assert.deepEqual(resMove, [{ id: "move", done: true }]);
  });

  await t.test("ignores questions without action", () => {
    const q1 = parseTaskCommands("what is task 1?", mockTasks);
    assert.deepEqual(q1, []);

    const q2 = parseTaskCommands("how do I do task 2?", mockTasks);
    assert.deepEqual(q2, []);
  });
});

test("voice assistant conversational intent parsing", async (t) => {
  await t.test("reminder context responses", () => {
    assert.equal(parseIntent("yes I took it", { reminderOpen: true }), "yes");
    assert.equal(parseIntent("not yet, remind me later", { reminderOpen: true }), "later");
    assert.equal(parseIntent("snooze for ten minutes", { reminderOpen: true }), "later");
  });

  await t.test("informational clinical recovery queries", () => {
    assert.equal(parseIntent("when is my next dose?", { reminderOpen: false }), "next_dose");
    assert.equal(parseIntent("when should I visit the doctor for appointment?", { reminderOpen: false }), "appointment");
    assert.equal(parseIntent("how should I care for my wound?", { reminderOpen: false }), "wound");
    assert.equal(parseIntent("what are the danger warning signs?", { reminderOpen: false }), "warning");
    assert.equal(parseIntent("can you list my medications?", { reminderOpen: false }), "list_meds");
    assert.equal(parseIntent("namaste", { reminderOpen: false }), "greet");
    assert.equal(parseIntent("hello", { reminderOpen: false }), "greet");
  });
});

test("bilingual distress recognition in recovery context", async (t) => {
  await t.test("identifies critical distress in English and Hindi", () => {
    const crit1 = detectDistress(["I cannot breathe"], { high: true });
    assert.equal(crit1?.severity, "critical");

    const crit2 = detectDistress(["seene mein dard hai"], { high: true });
    assert.equal(crit2?.severity, "critical");

    const crit3 = detectDistress(["मदद"], { high: true });
    assert.equal(crit3?.severity, "critical");
  });

  await t.test("identifies concern severity without false alarms for benign help", () => {
    const con1 = detectDistress(["I feel very dizzy and unwell"], { high: true });
    assert.equal(con1?.severity, "concern");

    const con2 = detectDistress(["tabiyat kharab hai"], { high: true });
    assert.equal(con2?.severity, "concern");

    const benign = detectDistress(["can you help me understand my medicine plan"], { high: true });
    assert.equal(benign, null);
  });
});

test("echo filter ignores app speech without muting patient", () => {
  const appPrompt = "It is time for your Paracetamol. Did you take it?";
  assert.equal(isEcho("time for your Paracetamol did you take it", appPrompt), true);
  assert.equal(isEcho("I cannot breathe please help me", appPrompt), false);
});
