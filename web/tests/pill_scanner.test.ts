import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DICTIONARY } from "../lib/i18n";
import type { PillScanResult } from "../lib/types";

describe("AI Pill Camera Scanner and Safety Engine", () => {
  test("both English and Hindi dictionaries contain complete translations for all Pill Scanner keys", () => {
    const requiredKeys = [
      "pillScannerTitle",
      "pillScannerSubtitle",
      "pillScanBtn",
      "pillScanInstruction",
      "pillCameraPrompt",
      "pillCapturePhoto",
      "pillRetakePhoto",
      "pillUploadPhoto",
      "pillSampleStripsTitle",
      "pillStatusVerified",
      "pillStatusWarning",
      "pillStatusMismatch",
      "pillStatusUnrecognized",
      "pillPrescriptionMatch",
      "pillDosageDetected",
      "pillScheduledFor",
      "pillInstructions",
      "pillConfirmDose",
      "pillSafetyAlertHeader",
      "pillDoNotTake",
      "pillReplayAudio",
      "pillScanningInProgress",
    ] as const;

    for (const key of requiredKeys) {
      assert.ok(DICTIONARY.en[key], `Missing English translation for ${key}`);
      assert.ok(DICTIONARY.hi[key], `Missing Hindi translation for ${key}`);
      assert.ok(DICTIONARY.en[key].length > 0);
      assert.ok(DICTIONARY.hi[key].length > 0);
    }

    assert.equal(DICTIONARY.en.pillScanBtn, "Scan Pill Bottle");
    assert.equal(DICTIONARY.hi.pillScanBtn, "दवा स्कैन करें");
  });

  test("correctly structures verified match result for prescribed medications", () => {
    const verifiedResult: PillScanResult = {
      verified: true,
      status: "VERIFIED_MATCH",
      detected_name: "Paracetamol",
      detected_dose: "500 mg",
      confidence: 0.98,
      spoken_summary_en: "Verified: Paracetamol 500 mg. It is on your active recovery plan.",
      spoken_summary_hi: "सत्यापित: Paracetamol 500 mg आपके प्लान में शामिल है।",
      matched_medication: {
        id: "med_1",
        name: "Paracetamol",
        dose: "500 mg",
        frequency: "Every 6 hours",
        instructions: "Take with water",
        times: ["08:00 AM", "02:00 PM", "08:00 PM"],
      },
    };

    assert.equal(verifiedResult.verified, true);
    assert.equal(verifiedResult.status, "VERIFIED_MATCH");
    assert.ok(verifiedResult.matched_medication);
    assert.equal(verifiedResult.matched_medication.id, "med_1");
    assert.ok(verifiedResult.spoken_summary_en.includes("Paracetamol 500 mg"));
    assert.ok(verifiedResult.spoken_summary_hi.includes("Paracetamol 500 mg"));
  });

  test("correctly structures clinical safety alert for unprescribed NSAID", () => {
    const warningResult: PillScanResult = {
      verified: false,
      status: "SAFETY_WARNING",
      detected_name: "Ibuprofen",
      detected_dose: "400 mg",
      confidence: 0.96,
      safety_alert: "SAFETY ALERT: Ibuprofen is an NSAID not prescribed in your discharge plan.",
      safety_alert_hi: "सुरक्षा चेतावनी: Ibuprofen आपके डिस्चार्ज प्लान में शामिल नहीं है।",
      warning_level: "high_risk",
      spoken_summary_en: "Warning! Ibuprofen is not on your prescription plan. Do not take this medication.",
      spoken_summary_hi: "चेतावनी! Ibuprofen आपके डॉक्टर के पर्चे में नहीं है।",
      matched_medication: null,
    };

    assert.equal(warningResult.verified, false);
    assert.equal(warningResult.status, "SAFETY_WARNING");
    assert.equal(warningResult.warning_level, "high_risk");
    assert.equal(warningResult.matched_medication, null);
    assert.ok(warningResult.safety_alert?.includes("NSAID"));
    assert.ok(warningResult.safety_alert_hi?.includes("सुरक्षा चेतावनी"));
  });

  test("correctly flags dosage mismatch when detected strength differs from doctor prescription", () => {
    const mismatchResult: PillScanResult = {
      verified: false,
      status: "DOSAGE_MISMATCH",
      detected_name: "Paracetamol",
      detected_dose: "1000 mg",
      confidence: 0.92,
      safety_alert: "Medication matches Paracetamol, but detected strength (1000 mg) does not match prescribed strength (500 mg).",
      safety_alert_hi: "दवा Paracetamol से मेल खाती है, लेकिन मात्रा (1000 mg) अलग है।",
      spoken_summary_en: "Attention. Dose mismatch.",
      spoken_summary_hi: "सावधानी। खुराक में अंतर है।",
      matched_medication: {
        id: "med_1",
        name: "Paracetamol",
        dose: "500 mg",
      },
    };

    assert.equal(mismatchResult.verified, false);
    assert.equal(mismatchResult.status, "DOSAGE_MISMATCH");
    assert.ok(mismatchResult.safety_alert?.includes("1000 mg"));
  });
});
