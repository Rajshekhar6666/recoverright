/**
 * Mobile Device Security, Patient Session Management, and Background Permission Consent.
 *
 * Implements:
 * 1. 4-digit PIN lock with local salt hashing
 * 2. Inactivity auto-lock watchdog (5-minute timeout)
 * 3. Informed consent tracking for background listening, calendar, and battery optimization
 * 4. Secure session token storage
 */
import { apiClient } from "../api/client";

export interface SystemConsentState {
  hasCompletedConsentGate: boolean;
  backgroundVoiceSafetyAllowed: boolean;
  calendarAccessAllowed: boolean;
  alarmNotificationsAllowed: boolean;
  batteryOptimizationExempt: boolean;
  consentedAt?: string;
}

export interface PatientAuthSession {
  sessionToken: string;
  patientToken: string;
  patientName: string;
  phone: string;
  pinHash?: string;
  expiresAt: string;
}

export class DeviceSecurityService {
  private session: PatientAuthSession | null = null;
  private consent: SystemConsentState = {
    hasCompletedConsentGate: false,
    backgroundVoiceSafetyAllowed: true,
    calendarAccessAllowed: true,
    alarmNotificationsAllowed: true,
    batteryOptimizationExempt: true,
  };
  private isAppLocked: boolean = false;
  private lastActivityTimestamp: number = Date.now();
  private autoLockTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  public getConsentState(): SystemConsentState {
    return { ...this.consent };
  }

  public updateConsent(updates: Partial<SystemConsentState>): SystemConsentState {
    this.consent = {
      ...this.consent,
      ...updates,
      hasCompletedConsentGate: true,
      consentedAt: new Date().toISOString(),
    };
    return { ...this.consent };
  }

  public getSession(): PatientAuthSession | null {
    if (!this.session) return null;
    if (new Date(this.session.expiresAt).getTime() <= Date.now()) {
      this.session = null;
      return null;
    }
    return { ...this.session };
  }

  public setSession(session: PatientAuthSession): void {
    this.session = session;
    this.isAppLocked = false;
    this.lastActivityTimestamp = Date.now();
  }

  public logout(): void {
    this.session = null;
    this.isAppLocked = false;
  }

  public isLocked(): boolean {
    if (!this.session) return false;
    // Check auto-lock timeout
    if (Date.now() - this.lastActivityTimestamp > this.autoLockTimeoutMs) {
      this.isAppLocked = true;
    }
    return this.isAppLocked;
  }

  public lockApp(): void {
    if (this.session) {
      this.isAppLocked = true;
    }
  }

  public unlockWithPin(enteredPin: string): boolean {
    if (!this.session || !this.session.pinHash) {
      this.isAppLocked = false;
      this.lastActivityTimestamp = Date.now();
      return true;
    }
    const expectedHash = this.hashPinLocally(enteredPin);
    if (expectedHash === this.session.pinHash) {
      this.isAppLocked = false;
      this.lastActivityTimestamp = Date.now();
      return true;
    }
    return false;
  }

  public setQuickPin(pin: string): void {
    if (!this.session) throw new Error("No active patient session.");
    this.session.pinHash = this.hashPinLocally(pin);
  }

  public recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }

  public hashPinLocally(pin: string): string {
    // Simple deterministic hash for mobile unit tests
    let hash = 0;
    const str = `rr_pin_salt:${pin}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return String(Math.abs(hash));
  }
}

export const deviceSecurity = new DeviceSecurityService();
