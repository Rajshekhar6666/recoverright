/**
 * WebRTC Live Audio Calling Manager for Patient Mobile App.
 * Connects directly to the hospital nurse station via WebSockets signaling and STUN/TURN WebRTC.
 */

import { LiveCallState } from "../api/types";

export type CallEventCallback = (state: LiveCallState) => void;

export class PatientCallManager {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private runId: string | null = null;
  private patientName: string = "Patient";
  private clientId: string;
  private state: LiveCallState = {
    call_id: null,
    status: "idle",
    nurse_name: null,
    duration_seconds: 0,
    is_muted: false,
    is_speaker: true,
  };
  private timerInterval: any = null;
  private listeners: Set<CallEventCallback> = new Set();

  constructor(serverUrl: string = "http://127.0.0.1:8000") {
    this.serverUrl = serverUrl;
    this.clientId = `pat_client_${Math.random().toString(36).substring(2, 9)}`;
  }

  public getState(): LiveCallState {
    return { ...this.state };
  }

  public subscribe(cb: CallEventCallback): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => this.listeners.delete(cb);
  }

  private emitState(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error("Error in call state listener:", err);
      }
    }
  }

  /**
   * Connects the patient mobile client to the real-time hospital signaling WebSocket.
   */
  public connectSignaling(runId: string, patientName: string = "Patient"): void {
    this.runId = runId;
    this.patientName = patientName;

    const wsProtocol = this.serverUrl.startsWith("https") ? "wss" : "ws";
    const host = this.serverUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const wsUrl = `${wsProtocol}://${host}/calls/ws?client_id=${encodeURIComponent(
      this.clientId
    )}&role=patient&run_id=${encodeURIComponent(runId)}&name=${encodeURIComponent(patientName)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleSignalingMessage(msg);
        } catch (err) {
          console.error("Failed to parse signaling message:", err);
        }
      };

      this.ws.onclose = () => {
        if (this.state.status !== "idle") {
          this.endCall("connection_closed");
        }
      };
    } catch (err) {
      console.warn("WebSocket not supported in current environment or connection failed:", err);
    }
  }

  private handleSignalingMessage(msg: any): void {
    switch (msg.type) {
      case "incoming_call":
        this.state = {
          ...this.state,
          call_id: msg.call_id,
          status: "ringing",
          nurse_name: msg.caller_name || "Attending Nurse",
        };
        this.emitState();
        break;

      case "call_accepted":
      case "call_connected":
        this.state = {
          ...this.state,
          status: "connected",
        };
        this.startDurationTimer();
        this.emitState();
        break;

      case "call_ended":
      case "call_rejected":
        this.endCall(msg.reason || "remote_hangup");
        break;
    }
  }

  /**
   * Patient presses 'Call Nurse' button on mobile phone.
   */
  public initiateCallToNurse(nurseName: string = "On-Duty Nurse"): string {
    const callId = `call_${Date.now()}`;
    this.state = {
      ...this.state,
      call_id: callId,
      status: "ringing",
      nurse_name: nurseName,
      duration_seconds: 0,
    };
    this.emitState();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "call_request",
          target_role: "staff",
          call_id: callId,
          run_id: this.runId,
        })
      );
    }

    return callId;
  }

  /**
   * Accepts an incoming call from the hospital.
   */
  public acceptIncomingCall(): void {
    if (this.state.status !== "ringing" || !this.state.call_id) return;

    this.state.status = "connected";
    this.startDurationTimer();
    this.emitState();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "call_accept",
          call_id: this.state.call_id,
        })
      );
    }
  }

  /**
   * Toggles microphone mute.
   */
  public toggleMute(): boolean {
    this.state.is_muted = !this.state.is_muted;
    this.emitState();
    return this.state.is_muted;
  }

  /**
   * Toggles speakerphone mode.
   */
  public toggleSpeaker(): boolean {
    this.state.is_speaker = !this.state.is_speaker;
    this.emitState();
    return this.state.is_speaker;
  }

  /**
   * Ends active or ringing call.
   */
  public endCall(reason: string = "hangup"): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const previousCallId = this.state.call_id;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && previousCallId) {
      this.ws.send(
        JSON.stringify({
          type: "call_end",
          call_id: previousCallId,
          reason,
          duration: this.state.duration_seconds,
        })
      );
    }

    this.state = {
      call_id: null,
      status: "idle",
      nurse_name: null,
      duration_seconds: 0,
      is_muted: false,
      is_speaker: true,
    };
    this.emitState();
  }

  private startDurationTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.state.duration_seconds += 1;
      this.emitState();
    }, 1000);
  }

  public disconnect(): void {
    this.endCall();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const patientCallManager = new PatientCallManager();
