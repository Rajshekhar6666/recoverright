/**
 * Vital Signs and MEWS Surveillance Client for RecoverRight Mobile.
 */
import { apiClient } from "../api/client";

export interface MobileVitalsReading {
  id?: string;
  systolic_bp: number;
  diastolic_bp?: number;
  heart_rate: number;
  respiratory_rate: number;
  temperature: number;
  temperature_unit: "C" | "F";
  spo2: number;
  consciousness: "Alert" | "Voice" | "Pain" | "Unresponsive";
  notes?: string;
  recorded_at?: string;
  mews_score?: number;
  risk_level?: "normal" | "low_medium" | "medium_high" | "critical";
}

export function calculateLocalMews(reading: MobileVitalsReading): {
  score: number;
  risk: "normal" | "low_medium" | "medium_high" | "critical";
} {
  let score = 0;
  // BP
  if (reading.systolic_bp <= 70) score += 3;
  else if (reading.systolic_bp <= 80) score += 2;
  else if (reading.systolic_bp <= 100) score += 1;
  else if (reading.systolic_bp >= 200) score += 2;

  // HR
  if (reading.heart_rate < 40) score += 2;
  else if (reading.heart_rate <= 50) score += 1;
  else if (reading.heart_rate > 100 && reading.heart_rate <= 110) score += 1;
  else if (reading.heart_rate > 110 && reading.heart_rate <= 129) score += 2;
  else if (reading.heart_rate >= 130) score += 3;

  // RR
  if (reading.respiratory_rate < 9) score += 2;
  else if (reading.respiratory_rate > 20 && reading.respiratory_rate <= 29) score += 2;
  else if (reading.respiratory_rate >= 30) score += 3;

  // SpO2
  if (reading.spo2 < 92) score += 3;
  else if (reading.spo2 <= 93) score += 2;
  else if (reading.spo2 <= 95) score += 1;

  let risk: "normal" | "low_medium" | "medium_high" | "critical" = "normal";
  if (score >= 7 || reading.spo2 < 90 || reading.systolic_bp <= 70) {
    risk = "critical";
  } else if (score >= 5) {
    risk = "medium_high";
  } else if (score >= 3) {
    risk = "low_medium";
  }

  return { score, risk };
}

export class DeviceVitalsService {
  private history: MobileVitalsReading[] = [];

  public getHistory(): MobileVitalsReading[] {
    return [...this.history];
  }

  public async recordVitals(
    patientToken: string,
    reading: MobileVitalsReading
  ): Promise<MobileVitalsReading> {
    const { score, risk } = calculateLocalMews(reading);
    const localRecord: MobileVitalsReading = {
      ...reading,
      id: `vit_${Date.now()}`,
      recorded_at: new Date().toISOString(),
      mews_score: score,
      risk_level: risk,
    };

    try {
      const resp = await fetch(`${apiClient.getBaseUrl()}/plans/${patientToken}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reading),
      });

      if (resp.ok) {
        const serverData = await resp.json();
        localRecord.mews_score = serverData.mews_score;
        localRecord.risk_level = serverData.risk_level;
      }
    } catch {
      // Offline: keep local record with computed MEWS
    }

    this.history.unshift(localRecord);
    return localRecord;
  }
}

export const deviceVitals = new DeviceVitalsService();
