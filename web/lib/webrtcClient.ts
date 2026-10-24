/**
 * WebRTC Client & Signaling Coordinator for Real-Time Two-Way Patient-Staff Audio Calls.
 *
 * Implements:
 * - WebSocket-based SDP & ICE signaling
 * - Hardware microphone stream capture with echo cancellation
 * - Remote audio stream playback via HTMLAudioElement
 * - Connection lifecycle: idle -> calling -> ringing -> connecting_audio -> connected -> ended
 * - Robust cleanup: track release, peer connection closing, and audio element teardown
 */

import { api, API } from "./api";
import type { CallRole, CallStatus } from "./types";

export interface IncomingCallEvent {
  call_id: string;
  run_id: string;
  caller_id: string;
  caller_name: string;
  caller_role: CallRole;
  sdp: string;
  timestamp: string;
}

export interface CallClientOptions {
  clientId: string;
  role: CallRole;
  runId: string;
  displayName: string;
  onStatusChange?: (status: CallStatus, errorMsg?: string) => void;
  onIncomingCall?: (call: IncomingCallEvent) => void;
  onPeerStatus?: (peer: { role: string; status: "online" | "offline" }) => void;
  onPeerMuteChange?: (isMuted: boolean) => void;
  onDurationTick?: (durationSeconds: number) => void;
}

export class WebRTCClient {
  private opts: CallClientOptions;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private status: CallStatus = "idle";
  private currentCallId: string | null = null;
  private pendingIncomingCall: IncomingCallEvent | null = null;
  private isMuted: boolean = false;
  private durationSeconds: number = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private isDestroyed: boolean = false;

  constructor(opts: CallClientOptions) {
    this.opts = opts;
    if (typeof window !== "undefined") {
      this.initWebSocket();
    }
  }

  public getStatus(): CallStatus {
    return this.status;
  }

  public getCurrentCallId(): string | null {
    return this.currentCallId;
  }

  public getDurationSeconds(): number {
    return this.durationSeconds;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  private setStatus(newStatus: CallStatus, errorMsg?: string) {
    this.status = newStatus;
    this.opts.onStatusChange?.(newStatus, errorMsg);
  }

  // -------------------------------------------------- Signaling Connection
  private getWsUrl(): string {
    const wsBase = (process.env.NEXT_PUBLIC_WS_URL || API).replace(/^http/, "ws");
    const params = new URLSearchParams({
      role: this.opts.role,
      run_id: this.opts.runId,
      name: this.opts.displayName,
    });
    return `${wsBase}/ws/calls/${encodeURIComponent(this.opts.clientId)}?${params.toString()}`;
  }

  private initWebSocket() {
    if (this.isDestroyed) return;
    try {
      const url = this.getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        if (this.status === "connecting_signaling" || this.status === "idle") {
          this.setStatus("ready");
        }
        // Heartbeat ping
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      this.ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          await this.handleSignalingMessage(msg);
        } catch {
          /* ignore parse errors */
        }
      };

      this.ws.onerror = () => {
        /* let onclose handle reconnection */
      };

      this.ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        if (!this.isDestroyed) {
          // Attempt reconnect after backoff
          setTimeout(() => {
            if (!this.isDestroyed) this.initWebSocket();
          }, 3000);
        }
      };
    } catch {
      /* ignore socket construct errors */
    }
  }

  private sendSignaling(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // -------------------------------------------------- Signaling Dispatch
  private async handleSignalingMessage(msg: Record<string, any>) {
    const type = msg.type;

    if (type === "peer_status") {
      this.opts.onPeerStatus?.({ role: msg.role, status: msg.status });
    } else if (type === "incoming_call") {
      // If already in a call, reject as busy
      if (this.currentCallId && this.status === "connected") {
        this.sendSignaling({
          type: "call_reject",
          call_id: msg.call_id,
          reason: "busy",
        });
        return;
      }
      this.pendingIncomingCall = msg as IncomingCallEvent;
      this.currentCallId = msg.call_id;
      this.setStatus("ringing");
      this.opts.onIncomingCall?.(this.pendingIncomingCall);
    } else if (type === "call_initiate_response") {
      if (msg.status === "ringing") {
        this.setStatus("ringing");
      } else if (msg.status === "unavailable") {
        this.setStatus("unavailable", msg.message);
        this.cleanupMedia();
      } else if (msg.status === "error" || msg.status === "failed") {
        this.setStatus("error", msg.message || "Call initiation failed.");
        this.cleanupMedia();
      }
    } else if (type === "call_answered") {
      if (msg.call_id === this.currentCallId && this.pc) {
        this.setStatus("connecting_audio");
        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
      }
    } else if (type === "ice_candidate") {
      if (msg.call_id === this.currentCallId && this.pc && msg.candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {
          /* ignore duplicate/stale ice candidates */
        }
      }
    } else if (type === "peer_mute_change") {
      if (msg.call_id === this.currentCallId) {
        this.opts.onPeerMuteChange?.(Boolean(msg.is_muted));
      }
    } else if (type === "call_rejected") {
      if (msg.call_id === this.currentCallId) {
        this.setStatus("rejected", msg.reason || "Declined");
        this.cleanupMedia();
      }
    } else if (type === "call_ended") {
      if (msg.call_id === this.currentCallId) {
        this.setStatus("ended", msg.reason || "Call completed");
        this.cleanupMedia();
      }
    }
  }

  // -------------------------------------------------- WebRTC Audio Engine
  private async createPeerConnection(): Promise<RTCPeerConnection> {
    let iceServers: RTCIceServer[] = [
      { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ];

    try {
      const cfg = await api.getIceServers();
      if (cfg && cfg.ice_servers && cfg.ice_servers.length > 0) {
        iceServers = cfg.ice_servers;
      }
    } catch {
      /* fallback to default STUN */
    }

    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.currentCallId) {
        this.sendSignaling({
          type: "ice_candidate",
          call_id: this.currentCallId,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (remoteStream) {
        this.setupRemoteAudio(remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        this.setStatus("connected");
        this.startDurationTimer();
      } else if (state === "disconnected" || state === "failed") {
        if (this.status === "connected") {
          this.setStatus("reconnecting");
        }
      } else if (state === "closed") {
        if (this.status === "connected" || this.status === "reconnecting") {
          this.setStatus("ended");
        }
      }
    };

    return pc;
  }

  private setupRemoteAudio(stream: MediaStream) {
    if (typeof window === "undefined") return;
    if (!this.remoteAudio) {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
    }
    this.remoteAudio.srcObject = stream;
    this.remoteAudio.play().catch(() => {
      /* browser autoplay click-to-play required */
    });
  }

  // -------------------------------------------------- Call Actions
  public async initiateCall(targetRole?: CallRole): Promise<boolean> {
    if (this.status === "calling" || this.status === "connected") return false;

    this.setStatus("calling");
    this.currentCallId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    this.durationSeconds = 0;

    try {
      // 1. Capture microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize PeerConnection
      this.pc = await this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });

      // 3. Create SDP Offer
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
      });
      await this.pc.setLocalDescription(offer);

      // 4. Send call_initiate over WebSocket
      this.sendSignaling({
        type: "call_initiate",
        call_id: this.currentCallId,
        run_id: this.opts.runId,
        caller_role: this.opts.role,
        caller_name: this.opts.displayName,
        target_role: targetRole || (this.opts.role === "staff" ? "patient" : "staff"),
        sdp: offer.sdp,
      });

      return true;
    } catch (err: any) {
      const isPermissionDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      this.setStatus(
        "error",
        isPermissionDenied
          ? "Microphone access was denied. Please allow microphone permissions in your browser."
          : `Failed to start audio call: ${err?.message || "Device error"}`
      );
      this.cleanupMedia();
      return false;
    }
  }

  public async answerCall(): Promise<boolean> {
    if (!this.pendingIncomingCall || !this.currentCallId) return false;

    this.setStatus("connecting_audio");

    try {
      // 1. Capture microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize PeerConnection
      this.pc = await this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });

      // 3. Set Remote Description from Offer
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({
          type: "offer",
          sdp: this.pendingIncomingCall.sdp,
        })
      );

      // 4. Create Answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // 5. Send Answer SDP
      this.sendSignaling({
        type: "call_answer",
        call_id: this.currentCallId,
        sdp: answer.sdp,
      });

      return true;
    } catch (err: any) {
      const isPermissionDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      this.setStatus(
        "error",
        isPermissionDenied
          ? "Microphone access was denied. Please allow microphone permissions to answer."
          : `Failed to answer audio call: ${err?.message || "Device error"}`
      );
      this.rejectCall("microphone_error");
      return false;
    }
  }

  public rejectCall(reason = "declined") {
    if (this.currentCallId) {
      this.sendSignaling({
        type: "call_reject",
        call_id: this.currentCallId,
        reason,
      });
    }
    this.setStatus("rejected", reason);
    this.cleanupMedia();
  }

  public endCall(reason = "hangup") {
    if (this.currentCallId) {
      this.sendSignaling({
        type: "call_end",
        call_id: this.currentCallId,
        reason,
        duration_seconds: this.durationSeconds,
      });
      // Fallback REST call in case socket disconnects
      api.endCallRest(this.currentCallId, reason, this.durationSeconds).catch(() => {});
    }
    this.setStatus("ended", reason);
    this.cleanupMedia();
  }

  public toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });

    if (this.currentCallId) {
      this.sendSignaling({
        type: "call_mute",
        call_id: this.currentCallId,
        is_muted: this.isMuted,
      });
    }
    return this.isMuted;
  }

  private startDurationTimer() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationSeconds = 0;
    this.durationTimer = setInterval(() => {
      this.durationSeconds += 1;
      this.opts.onDurationTick?.(this.durationSeconds);
    }, 1000);
  }

  private cleanupMedia() {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }
    this.isMuted = false;
    this.pendingIncomingCall = null;
  }

  public destroy() {
    this.isDestroyed = true;
    this.cleanupMedia();
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
