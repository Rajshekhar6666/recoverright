/**
 * Shared Type Definitions for the RecoverRight Patient Mobile Companion.
 * Synchronized with the RecoverRight FastAPI Server contracts.
 */

export interface MedicationSchedule {
  medication_id: string;
  name: string;
  dose: string;
  frequency: string;
  instructions: string;
  times: string[]; // e.g. ["08:00 AM", "08:00 PM"]
  confirmed_times?: string[];
  requires_time_setting: boolean;
  status?: "pending" | "taken" | "snoozed" | "missed";
  last_taken_at?: string;
  acknowledged?: boolean;
}

export interface FollowUpAppointment {
  field_id: string;
  what: string;
  when: string;
  where: string;
  doctor?: string;
  calendar_event_id?: string;
  synced_to_calendar?: boolean;
}

export interface WarningSignActionCard {
  card_id: string;
  warning_text: string;
  severity: "critical" | "warning";
  plain_language_action: string;
  who_to_call: {
    label: string;
    phone: string;
    is_emergency: boolean;
  };
}

export interface PatientProfile {
  name: string;
  language: string;
  phone: string;
  patient_token: string;
  caregiver_first?: boolean;
  guardian_name?: string;
  guardian_phone?: string;
}

export interface PatientPlan {
  run_id: string;
  patient_name: string;
  phone: string;
  language: string;
  version: number;
  approved_at: string;
  plan_duration_days?: number;
  medications: MedicationSchedule[];
  instructions: Record<string, string[]>;
  follow_ups: FollowUpAppointment[];
  contacts: Array<{ label: string; value: string }>;
  action_cards?: WarningSignActionCard[];
  patient_slug?: string;
  hospital_name?: string;
  is_self_managed?: boolean;
  severity?: string;
}

export interface DeviceCalendarEvent {
  id?: string;
  title: string;
  startDate: Date;
  endDate: Date;
  location: string;
  notes: string;
  alarms?: number[]; // minutes before event to trigger alarms
}

export interface LocalNotificationAlarm {
  id: string;
  medication_id: string;
  medication_name: string;
  dose: string;
  scheduled_time: string; // "08:00 AM"
  hour: number;
  minute: number;
  repeating: boolean;
  active: boolean;
  action_taken?: boolean;
  spoken_alarm_script?: string;
}

export interface DistressPhrase {
  phrase: string;
  language: "en" | "hi";
  severity: "critical" | "concern";
  confidence_threshold: number;
}

export interface VoiceDistressDetection {
  detected: boolean;
  matched_phrase?: string;
  heard_text: string;
  severity: "critical" | "concern";
  language: "en" | "hi";
  timestamp: string;
}

export interface EmergencyHelpRequest {
  id?: string;
  run_id: string;
  heard: string;
  severity: "critical" | "concern";
  source: "voice" | "button" | "alarm_timeout";
  label: string;
  patient_name: string;
  client_time: string;
}

export interface SyncStatus {
  online: boolean;
  last_synced_at: string | null;
  server_reachable: boolean;
  pending_offline_actions: number;
  active_websocket: boolean;
}

export interface LiveCallState {
  call_id: string | null;
  status: "idle" | "ringing" | "connecting" | "connected" | "ended";
  nurse_name: string | null;
  duration_seconds: number;
  is_muted: boolean;
  is_speaker: boolean;
}
