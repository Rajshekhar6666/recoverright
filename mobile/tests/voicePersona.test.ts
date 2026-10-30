import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONA_PROFILES,
  generateEmotionalCounselingReply,
  generatePersonaAlarmScript,
  getPersonaProfile,
  getRandomCharacteristicPhrase,
  listPersonas,
  loadEmotionalStatePreference,
  loadPersonaPreference,
  personalizeGreeting,
  saveEmotionalStatePreference,
  savePersonaPreference,
} from "../src/services/voicePersona";
import { voiceAssistant } from "../src/services/voiceAssistant";

describe("VoicePersona service", () => {
  it("lists 6 personas", () => {
    const personas = listPersonas();
    assert.strictEqual(personas.length, 6);
  });

  it("each persona has required fields", () => {
    const personas = listPersonas();
    for (const p of personas) {
      assert.ok(p.id, `${p.id} missing id`);
      assert.ok(p.displayName, `${p.id} missing displayName`);
      assert.ok(p.displayNameHi, `${p.id} missing displayNameHi`);
      assert.ok(p.emoji, `${p.id} missing emoji`);
      assert.ok(p.greetingEn, `${p.id} missing greetingEn`);
      assert.ok(p.greetingHi, `${p.id} missing greetingHi`);
      assert.ok(p.characteristicPhrasesEn.length > 0, `${p.id} no EN phrases`);
      assert.ok(p.characteristicPhrasesHi.length > 0, `${p.id} no HI phrases`);
    }
  });

  it("each persona has valid cadence and tone", () => {
    const validCadences = new Set(["slow", "medium", "fast"]);
    const validTones = new Set(["warm", "professional", "energetic", "serene"]);
    for (const p of listPersonas()) {
      assert.ok(validCadences.has(p.speechCadence), `${p.id} invalid cadence`);
      assert.ok(validTones.has(p.emotionalTone), `${p.id} invalid tone`);
    }
  });

  it("personalizes greeting EN with patient name", () => {
    const greeting = personalizeGreeting("soothing_didi", "Ramesh", "en");
    assert.ok(greeting.includes("Ramesh"));
    assert.ok(!greeting.includes("{name}"));
  });

  it("personalizes greeting HI with patient name", () => {
    const greeting = personalizeGreeting("caring_maa", "रमेश", "hi");
    assert.ok(greeting.includes("रमेश"));
    assert.ok(!greeting.includes("{name}"));
  });

  it("all 6 personas: greeting interpolation works in both languages", () => {
    for (const p of listPersonas()) {
      const en = personalizeGreeting(p.id, "TestPatient", "en");
      const hi = personalizeGreeting(p.id, "TestPatient", "hi");
      assert.ok(en.includes("TestPatient"), `${p.id} EN greeting missing name`);
      assert.ok(hi.includes("TestPatient"), `${p.id} HI greeting missing name`);
      assert.ok(!en.includes("{name}"), `${p.id} EN has unresolved placeholder`);
      assert.ok(!hi.includes("{name}"), `${p.id} HI has unresolved placeholder`);
    }
  });

  it("returns a random characteristic phrase without throwing", () => {
    for (const p of listPersonas()) {
      const phraseEn = getRandomCharacteristicPhrase(p.id, "en");
      assert.ok(typeof phraseEn === "string" && phraseEn.length > 0, `${p.id} no EN phrase`);
      const phraseHi = getRandomCharacteristicPhrase(p.id, "hi");
      assert.ok(typeof phraseHi === "string" && phraseHi.length > 0, `${p.id} no HI phrase`);
    }
  });

  it("getPersonaProfile returns the correct profile", () => {
    const profile = getPersonaProfile("calm_guru");
    assert.strictEqual(profile.id, "calm_guru");
    assert.strictEqual(profile.speechCadence, "slow");
    assert.strictEqual(profile.emotionalTone, "serene");
  });

  it("saves and loads persona preference", () => {
    savePersonaPreference("calm_guru");
    assert.strictEqual(loadPersonaPreference(), "calm_guru");

    savePersonaPreference("friendly_bhai");
    assert.strictEqual(loadPersonaPreference(), "friendly_bhai");
  });

  it("default preference is soothing_didi when not set", () => {
    // Reset global state
    (globalThis as Record<string, unknown>)["rr_voice_persona"] = undefined;
    assert.strictEqual(loadPersonaPreference(), "soothing_didi");
  });

  // ── Emotional Archetypes & Personalized Alarm Tests ──

  it("saves and loads emotional state preference", () => {
    saveEmotionalStatePreference("burden");
    assert.strictEqual(loadEmotionalStatePreference(), "burden");

    saveEmotionalStatePreference("student");
    assert.strictEqual(loadEmotionalStatePreference(), "student");
  });

  it("generates Maa personalized medication alarm in Hindi", () => {
    const script = generatePersonaAlarmScript(
      "caring_maa",
      "Paracetamol",
      "500mg",
      "Rahul",
      "hi",
      "general"
    );
    assert.ok(script.spokenText.includes("बेटा Rahul"));
    assert.ok(script.spokenText.includes("Paracetamol"));
    assert.ok(script.spokenText.includes("चिंता मत कर"));
    assert.ok(script.bannerText.includes("माँ"));
  });

  it("customizes Maa alarm for burden archetype with comfort", () => {
    const script = generatePersonaAlarmScript(
      "caring_maa",
      "Paracetamol",
      "500mg",
      "Rahul",
      "hi",
      "burden"
    );
    assert.ok(script.spokenText.includes("बोझ"));
    assert.ok(script.spokenText.includes("माँ तेरे साथ है"));
  });

  it("customizes Maa alarm for student archetype", () => {
    const script = generatePersonaAlarmScript(
      "caring_maa",
      "Azithromycin",
      "250mg",
      "Pooja",
      "hi",
      "student"
    );
    assert.ok(script.spokenText.includes("पढ़ाई"));
    assert.ok(script.spokenText.includes("Azithromycin"));
  });

  it("generates Bhai energetic alarm", () => {
    const script = generatePersonaAlarmScript(
      "friendly_bhai",
      "Vitamin C",
      "",
      "Aman",
      "hi"
    );
    assert.ok(script.spokenText.includes("भाई"));
    assert.ok(script.spokenText.includes("Vitamin C"));
  });

  it("generates emotional counseling replies for burden and student", () => {
    const burdenReply = generateEmotionalCounselingReply(
      "caring_maa",
      "burden",
      "Vikas",
      "hi"
    );
    assert.ok(burdenReply.includes("बोझ"));
    assert.ok(burdenReply.includes("Vikas"));

    const studentReply = generateEmotionalCounselingReply(
      "friendly_bhai",
      "student",
      "Nikhil",
      "hi"
    );
    assert.ok(studentReply.includes("कॉलेज"));
    assert.ok(studentReply.includes("Nikhil"));
  });

  it("voice assistant evaluates emotional sentiments offline", () => {
    savePersonaPreference("caring_maa");
    const resultBurden = voiceAssistant.evaluateLocalIntent(
      "Mujhe bojh lag raha hai sab pe",
      "hi"
    );
    assert.strictEqual(resultBurden.intent, "emotional_support");
    assert.strictEqual(resultBurden.isEmergency, false);
    assert.ok(resultBurden.replyText.includes("बोझ") || resultBurden.replyText.includes("प्यार"));

    const resultStudent = voiceAssistant.evaluateLocalIntent(
      "I am sick in hostel and have exam stress",
      "en"
    );
    assert.strictEqual(resultStudent.intent, "emotional_support");
    assert.ok(resultStudent.replyText.includes("hostel") || resultStudent.replyText.includes("exam") || resultStudent.replyText.includes("health"));
  });
});
