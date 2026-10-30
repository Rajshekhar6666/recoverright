/**
 * Patient Settings Service and Configuration Validator.
 */

export interface SupportedLanguage {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi (हिंदी)" },
  { code: "mr", label: "Marathi (मराठी)" },
  { code: "ta", label: "Tamil (தமிழ்)" },
];

export function isValidServerUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export interface PatientAppSettings {
  serverUrl: string;
  language: string;
  backgroundVoiceListening: boolean;
  syncIntervalMinutes: number;
}

export class DeviceSettingsService {
  private settings: PatientAppSettings = {
    serverUrl: "http://127.0.0.1:8000",
    language: "en",
    backgroundVoiceListening: true,
    syncIntervalMinutes: 15,
  };

  getSettings(): PatientAppSettings {
    return { ...this.settings };
  }

  updateServerUrl(url: string): boolean {
    if (!isValidServerUrl(url)) return false;
    this.settings.serverUrl = url.trim();
    return true;
  }

  setLanguage(lang: string): boolean {
    if (!SUPPORTED_LANGUAGES.some((l) => l.code === lang)) return false;
    this.settings.language = lang;
    return true;
  }

  setBackgroundVoiceListening(enabled: boolean): void {
    this.settings.backgroundVoiceListening = enabled;
  }

  setSyncInterval(minutes: number): void {
    this.settings.syncIntervalMinutes = minutes;
  }
}

export const deviceSettings = new DeviceSettingsService();
