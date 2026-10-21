import test from "node:test";
import assert from "node:assert/strict";
import { detectDistress, detectTookMedicine, normalize } from "../lib/voice/phrases";

const fires = (s: string) => detectDistress(s) !== null;

test("phrases requested in the brief all fire", () => {
  for (const s of ["I feel unwell", "I need help", "chest pain", "I feel dizzy", "I can't breathe"]) {
    assert.ok(fires(s), `should fire: ${s}`);
  }
});

test("speech-engine spelling variants of can't breathe", () => {
  for (const s of ["I cannot breathe", "i can not breathe", "I can\u2019t breathe", "i cant breathe", "I CAN'T BREATHE!", "unable to breathe", "I'm having trouble breathing", "short of breath", "can't catch my breath", "difficulty in breathing"]) {
    assert.equal(detectDistress(s)?.kind, "breathing", s);
    assert.equal(detectDistress(s)?.severity, "critical", s);
  }
});

test("other real-world phrasings", () => {
  const yes = ["my chest hurts", "I have chest pain", "tightness in my chest", "I'm bleeding heavily", "heavy bleeding from the wound",
    "I feel faint", "I think I'm going to pass out", "I'm feeling really sick", "I am not feeling well", "I don't feel well", "I do not feel good",
    "please help me", "help", "Help!", "help me", "somebody help", "I need some help", "I need urgent help", "this is an emergency", "call the ambulance",
    "I need a nurse", "call my doctor", "I have a fever", "I'm in severe pain", "feeling dizzy and weak", "madad", "bachao", "tabiyat kharab hai", "मुझे चक्कर आ रहे हैं", "मदद"];
  for (const s of yes) assert.ok(fires(s), `should fire: ${s}`);
});

test("severity: breathing/chest/bleeding/faint/severe pain are critical, plain help/unwell/dizzy are concern", () => {
  assert.equal(detectDistress("chest pain")?.severity, "critical");
  assert.equal(detectDistress("I feel faint")?.severity, "critical");
  assert.equal(detectDistress("I need help")?.severity, "concern");
  assert.equal(detectDistress("I feel unwell")?.severity, "concern");
  assert.equal(detectDistress("I feel dizzy")?.severity, "concern");
});

test("most serious phrase wins", () => {
  assert.equal(detectDistress("I feel dizzy and I can't breathe")?.severity, "critical");
  assert.equal(detectDistress("I need help, I have chest pain")?.kind, "chest");
});

test("BUG FIX: an unrelated negation must not suppress a real emergency", () => {
  assert.equal(detectDistress("no pain but I can't breathe")?.kind, "breathing");
  assert.equal(detectDistress("I don't feel dizzy but I need help")?.kind, "help");
  assert.equal(detectDistress("there is no bleeding however I have chest pain")?.kind, "chest");
  assert.ok(fires("no, I don't feel well"));
});

test("genuine negation still suppresses", () => {
  for (const s of ["I have no chest pain", "no chest pain today", "I am not dizzy", "I don't feel dizzy", "I do not have chest pain",
    "I haven't been dizzy", "without any heavy bleeding", "I don't need help", "I don't need any help", "never felt faint"]) {
    assert.equal(fires(s), false, `should NOT fire: ${s}`);
  }
});

test("benign speech does not fire", () => {
  for (const s of ["I feel fine", "I feel better today", "I feel okay", "my wound looks good", "that really helps", "this is helpful", "thank you for the help",
    "can you help me understand my tablets", "could you help me with the dressing", "how can I help my recovery", "I took my medicine", "the nurse said take care",
    "I will call the nurse tomorrow", "I walked to the kitchen", "good morning", "", "   "]) {
    assert.equal(fires(s), false, `should NOT fire: "${s}"`);
  }
});

test("medicine confirmations", () => {
  for (const s of ["I took my medicine", "I have taken my tablet", "took it", "I just took the pills", "I had my medicine", "i've taken all my medication", "I took both"]) {
    assert.ok(detectTookMedicine(s), `should confirm: ${s}`);
  }
  for (const s of ["I didn't take my medicine", "I haven't taken my tablet yet", "I forgot my pills", "I will take my medicine", "what medicine do I take", "I never took it", ""]) {
    assert.equal(detectTookMedicine(s), false, `should NOT confirm: ${s}`);
  }
});

test("normalize handles curly apostrophes and punctuation", () => {
  assert.equal(normalize("  I can\u2019t   BREATHE!!! "), "i can't breathe");
  assert.equal(normalize("cannot"), "can't");
});

test("regex state does not leak between calls (global flag lastIndex)", () => {
  for (let i = 0; i < 5; i++) assert.ok(fires("I need help"));
  assert.equal(fires("good morning"), false);
  assert.ok(fires("chest pain"));
});
