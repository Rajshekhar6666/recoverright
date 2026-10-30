/**
 * Background Voice Safety and Bilingual Emergency Distress Detector.
 * Runs in the mobile background (via audio foreground service / background audio mode),
 * analyzing ambient speech for critical distress phrases in English and Hindi.
 */

import { DistressPhrase, VoiceDistressDetection } from "../api/types";

export const BILINGUAL_DISTRESS_DICTIONARY: DistressPhrase[] = [
  // English Critical
  { phrase: "help", language: "en", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "help me", language: "en", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "emergency", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "i cannot breathe", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "can't breathe", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "shortness of breath", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "chest pain", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "chest pressure", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "i fell", language: "en", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "fell down", language: "en", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "fainted", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "passing out", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "severe bleeding", language: "en", severity: "critical", confidence_threshold: 0.9 },
  { phrase: "bleeding profusely", language: "en", severity: "critical", confidence_threshold: 0.9 },
  { phrase: "stitches tore", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "wound opened", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "call an ambulance", language: "en", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "call 108", language: "en", severity: "critical", confidence_threshold: 0.9 },

  // English Concern
  { phrase: "i feel dizzy", language: "en", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "feeling dizzy", language: "en", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "i need a nurse", language: "en", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "call doctor", language: "en", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "headache", language: "en", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "high fever", language: "en", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "throwing up", language: "en", severity: "concern", confidence_threshold: 0.75 },

  // Hindi Critical (Devanagari & Romanized Transliteration)
  { phrase: "बचाओ", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "bachao", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "मदद करो", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "madad karo", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "सांस नहीं आ रही", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "saans nahi aa rahi", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "saans lene me takleef", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "saans phool rahi", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "सांस लेने में तकलीफ", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "सीने में दर्द", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "seene mein dard", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "chhati me dard", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "छाती में दर्द", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "बहुत ज्यादा दर्द", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "bahut zyada dard", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "khoon nikal raha", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "khoon beh raha", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "खून निकल रहा", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "खून बह रहा", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "gir gaya", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "gir gayi", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "गिर गया", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "गिर गई", language: "hi", severity: "critical", confidence_threshold: 0.8 },
  { phrase: "behosh", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "behosh ho raha", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "बेहोश", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "taanke toot gaye", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "taanke khul gaye", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "टांके टूट गए", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "टांके खुल गए", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "ambulance bulao", language: "hi", severity: "critical", confidence_threshold: 0.85 },
  { phrase: "एंबुलेंस बुलाओ", language: "hi", severity: "critical", confidence_threshold: 0.85 },

  // Hindi Concern
  { phrase: "चक्कर आ रहे हैं", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "chakkar aa rahe", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "नर्स को बुलाओ", language: "hi", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "nurse ko bulao", language: "hi", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "doctor ko phone karo", language: "hi", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "डॉक्टर को फोन करो", language: "hi", severity: "concern", confidence_threshold: 0.8 },
  { phrase: "ulti ho rahi", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "उल्टी हो रही", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "bukhar hai", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "बुखार है", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "sujan aa gayi", language: "hi", severity: "concern", confidence_threshold: 0.75 },
  { phrase: "सूजन आ गई", language: "hi", severity: "concern", confidence_threshold: 0.75 },
];

export class BackgroundVoiceSafetyService {
  private isListening: boolean = false;
  private lastAlertTimestamp: number = 0;
  private dedupeWindowMs: number = 20000; // 20s deduplication window
  private distressCallbacks: Array<(detection: VoiceDistressDetection) => void> = [];

  public startListening(): boolean {
    this.isListening = true;
    return true;
  }

  public stopListening(): boolean {
    this.isListening = false;
    return false;
  }

  public isBackgroundListeningActive(): boolean {
    return this.isListening;
  }

  /**
   * Normalizes text for speech-recognition comparison: removes punctuation, converts to lowercase.
   */
  public normalizeSpeech(text: string): string {
    return (text || "")
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'।]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Evaluates spoken utterance against the bilingual distress dictionary.
   */
  public analyzeUtterance(spokenText: string): VoiceDistressDetection {
    const normalized = this.normalizeSpeech(spokenText);
    if (!normalized) {
      return {
        detected: false,
        heard_text: spokenText,
        severity: "concern",
        language: "en",
        timestamp: new Date().toISOString(),
      };
    }

    for (const entry of BILINGUAL_DISTRESS_DICTIONARY) {
      const target = this.normalizeSpeech(entry.phrase);
      // Direct substring match or whole phrase match
      if (normalized === target || normalized.includes(target)) {
        return {
          detected: true,
          matched_phrase: entry.phrase,
          heard_text: spokenText,
          severity: entry.severity,
          language: entry.language,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      detected: false,
      heard_text: spokenText,
      severity: "concern",
      language: "en",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Ingests ambient speech buffer from the native microphone in background.
   * If emergency distress is detected, triggers registered callbacks.
   */
  public processAmbientAudioChunk(transcribedText: string): VoiceDistressDetection | null {
    if (!this.isListening) return null;

    const result = this.analyzeUtterance(transcribedText);
    if (!result.detected) return result;

    const now = Date.now();
    // Deduplication check: avoid firing consecutive emergency alerts for the same sentence
    if (now - this.lastAlertTimestamp < this.dedupeWindowMs) {
      return null;
    }

    this.lastAlertTimestamp = now;
    for (const cb of this.distressCallbacks) {
      try {
        cb(result);
      } catch (err) {
        console.error("Error in voice distress callback:", err);
      }
    }

    return result;
  }

  public onDistressDetected(cb: (detection: VoiceDistressDetection) => void): () => void {
    this.distressCallbacks.push(cb);
    return () => {
      this.distressCallbacks = this.distressCallbacks.filter((c) => c !== cb);
    };
  }
}

export const voiceSafety = new BackgroundVoiceSafetyService();
