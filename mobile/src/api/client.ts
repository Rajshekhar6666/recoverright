/**
 * RecoverRight Mobile REST Client.
 * Connects the patient mobile app directly to the RecoverRight backend in real time.
 */

import {
  EmergencyHelpRequest,
  PatientPlan,
  WarningSignActionCard,
} from "./types";

export class RecoverRightApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://192.168.1.7:8000") {
    // Normalise base URL (strip trailing slash)
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  public setBaseUrl(newUrl: string): void {
    this.baseUrl = newUrl.replace(/\/+$/, "");
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Fetches the current approved recovery plan using the secure patient token.
   */
  async getPatientPlan(patientToken: string): Promise<PatientPlan> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;
    try {
      const res = await fetch(`${this.baseUrl}/plans/${patientToken}`, {
        signal: controller ? controller.signal : undefined,
      });
      if (!res.ok) {
        if (res.status === 410) {
          throw new Error("This recovery plan link has expired (post-discharge window).");
        }
        if (res.status === 403) {
          throw new Error("The recovery plan is still being reviewed by clinicians.");
        }
        if (res.status === 404) {
          throw new Error("Patient recovery plan not found.");
        }
        throw new Error(`Failed to fetch plan: ${res.statusText} (${res.status})`);
      }
      return (await res.json()) as PatientPlan;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Records medication dose ingestion (self-reported taken or skipped).
   */
  async recordDoseAction(
    patientToken: string,
    medicationId: string,
    reportedTaken: boolean = true,
    via: string = "mobile_app",
    note?: string
  ): Promise<{ status: string; recorded: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/plans/${patientToken}/medications/${encodeURIComponent(medicationId)}/report-dose`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reported_taken: reportedTaken,
          via: via,
          note: note,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to record dose action: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Updates a recovery task status (e.g. complete, reset, snooze).
   */
  async updateTaskAction(
    patientToken: string,
    taskId: string,
    action: "complete" | "reset" | "snooze" | "cancel" = "complete",
    by: string = "patient"
  ): Promise<{ task: any }> {
    const res = await fetch(
      `${this.baseUrl}/plans/${patientToken}/tasks/${encodeURIComponent(taskId)}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action,
          by: by,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to update task action: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Acknowledges that the patient saw/heard the medication reminder.
   */
  async recordDoseAck(
    patientToken: string,
    medicationId: string,
    via: string = "mobile_alarm"
  ): Promise<{ acknowledged: boolean }> {
    const res = await fetch(
      `${this.baseUrl}/plans/${patientToken}/medications/${encodeURIComponent(medicationId)}/acknowledge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true, via }),
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to acknowledge reminder: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Dispatches an immediate emergency distress alert to the hospital nursing station.
   */
  async sendEmergencyDistress(
    request: EmergencyHelpRequest
  ): Promise<{ id: string; status: string; created: boolean }> {
    const payload = JSON.stringify({
      token: request.run_id,
      heard: request.heard,
      severity: request.severity,
      source: request.source,
      label: request.label,
      client_time: request.client_time || new Date().toISOString(),
    });
    let res = await fetch(`${this.baseUrl}/help`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${this.baseUrl}/help/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    }

    if (!res.ok) {
      throw new Error(`Failed to dispatch emergency help request: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Fetches plain-language emergency action cards derived from warning signs.
   */
  async getActionCards(patientToken: string, lang: string = "en"): Promise<WarningSignActionCard[]> {
    const res = await fetch(`${this.baseUrl}/plans/${patientToken}/action-cards?lang=${lang}`);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.cards || [];
  }

  /**
   * Records follow-up clinic appointment attendance (attended, confirmed, reschedule).
   */
  async recordFollowUpAttendance(
    patientToken: string,
    status: "confirmed" | "attended" | "reschedule_requested" | "missed",
    appointmentId?: string,
    notes?: string
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/plans/${patientToken}/follow-up/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        appointment_id: appointmentId,
        notes,
        by: "patient",
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to record appointment attendance: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Checks API server health and reachability.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Registers a self-managed patient and triggers clinical severity evaluation.
   * Auto-approves 7-15 day plan for non-severe, or warns if severe.
   */
  async selfRegister(payload: {
    patient_name: string;
    phone: string;
    language?: string;
    diagnosis_or_symptoms?: string;
    extracted_text?: string;
    medications?: any[];
    preferred_duration_days?: number;
    hospital_name?: string;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/patients/self-register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to register self-care recovery plan.");
    }
    return await res.json();
  }

  /**
   * Fetches official clinical discharge plan by hospital name and mobile number.
   */
  async fetchHospitalPlan(phone: string, hospitalName: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/patients/hospital-fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, hospital_name: hospitalName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Could not fetch records from ${hospitalName}.`);
    }
    return await res.json();
  }
}

export const apiClient = new RecoverRightApiClient("http://192.168.1.7:8000");
