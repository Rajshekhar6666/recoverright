"""Real-Time Call Manager and Signaling Coordinator for WebRTC Patient-Staff Calls.

Manages:
- WebSocket signaling connections for staff and patient clients
- Bidirectional SDP offer/answer exchange
- Trickle ICE candidate relay
- Call lifecycle (calling -> ringing -> connected -> ended / rejected / timeout / busy)
- Audio call duration tracking and persistence to RunStore
- Cross-patient isolation: calls strictly bounded by run_id
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set
from fastapi import WebSocket

from app.schemas.calls import CallHistoryItem, CallSession, IceConfigResponse, IceServer
from app.services.storage import store

logger = logging.getLogger("recoverright.calls")


class CallManager:
    def __init__(self):
        # client_id -> WebSocket
        self._connections: Dict[str, WebSocket] = {}
        # client_id -> metadata {role, run_id, name, connected_at}
        self._metadata: Dict[str, dict] = {}
        # run_id -> set of client_ids
        self._run_clients: Dict[str, Set[str]] = {}
        # call_id -> CallSession
        self._active_calls: Dict[str, CallSession] = {}
        # call_id -> asyncio.Task (for ringing timeout)
        self._timeout_tasks: Dict[str, asyncio.Task] = {}
        # lock for state modifications
        self._lock = asyncio.Lock()

    def get_ice_config(self) -> IceConfigResponse:
        """Returns ICE server configuration for WebRTC negotiation."""
        stun_urls = [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
        ]
        servers = [IceServer(urls=stun_urls)]

        turn_url = os.environ.get("TURN_SERVER_URL")
        if turn_url:
            servers.append(
                IceServer(
                    urls=[turn_url],
                    username=os.environ.get("TURN_USERNAME"),
                    credential=os.environ.get("TURN_CREDENTIAL"),
                )
            )
        return IceConfigResponse(ice_servers=servers)

    async def register(self, client_id: str, websocket: WebSocket, role: str, run_id: str, name: str) -> None:
        async with self._lock:
            self._connections[client_id] = websocket
            self._metadata[client_id] = {
                "role": role,
                "run_id": run_id,
                "name": name,
                "connected_at": datetime.now(timezone.utc).isoformat(),
            }
            if run_id not in self._run_clients:
                self._run_clients[run_id] = set()
            self._run_clients[run_id].add(client_id)

            logger.info("Client registered: %s (role=%s, run_id=%s)", client_id, role, run_id)

        # Notify peers in the same run that a counterpart is online
        await self._broadcast_peer_status(run_id, client_id, "online")

    async def unregister(self, client_id: str) -> None:
        run_id = None
        active_call_id = None

        async with self._lock:
            if client_id in self._metadata:
                run_id = self._metadata[client_id].get("run_id")
            if client_id in self._connections:
                del self._connections[client_id]
            if client_id in self._metadata:
                del self._metadata[client_id]
            if run_id and run_id in self._run_clients:
                self._run_clients[run_id].discard(client_id)
                if not self._run_clients[run_id]:
                    del self._run_clients[run_id]

            # Find if this client was in an active call
            for cid, session in list(self._active_calls.items()):
                if session.caller_id == client_id or session.target_id == client_id:
                    active_call_id = cid
                    break

        if active_call_id:
            await self.end_call(
                call_id=active_call_id,
                ended_by=client_id,
                reason="peer_disconnected",
                duration_seconds=0,
            )

        if run_id:
            await self._broadcast_peer_status(run_id, client_id, "offline")

        logger.info("Client unregistered: %s", client_id)

    async def _broadcast_peer_status(self, run_id: str, client_id: str, status: str) -> None:
        """Notifies other clients in the same patient workspace about peer availability."""
        recipients = []
        async with self._lock:
            clients = self._run_clients.get(run_id, set())
            meta = self._metadata.get(client_id, {})
            role = meta.get("role", "unknown")
            for cid in clients:
                if cid != client_id and cid in self._connections:
                    recipients.append(self._connections[cid])

        msg = {
            "type": "peer_status",
            "client_id": client_id,
            "role": role,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for ws in recipients:
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                pass

    async def initiate_call(
        self,
        call_id: str,
        run_id: str,
        caller_id: str,
        caller_role: str,
        caller_name: str,
        target_role: str,
        offer_sdp: str,
    ) -> dict:
        """Starts an outgoing call and alerts matching recipients in the run."""
        resolved_run_id = store.resolve_run_id(run_id) or run_id
        now_iso = datetime.now(timezone.utc).isoformat()

        target_clients: list[tuple[str, WebSocket]] = []
        async with self._lock:
            # Check if caller already in an active call
            for s in self._active_calls.values():
                if s.caller_id == caller_id or s.target_id == caller_id:
                    return {"status": "error", "error": "caller_already_in_call", "message": "You are already in an active call."}
                if s.run_id == resolved_run_id and s.status in ("calling", "ringing", "connected"):
                    return {"status": "error", "error": "patient_busy", "message": "Patient is currently in another active call."}

            # Locate targets in this run
            run_cids = self._run_clients.get(resolved_run_id, set())
            for cid in run_cids:
                if cid != caller_id:
                    cmeta = self._metadata.get(cid, {})
                    if cmeta.get("role") == target_role and cid in self._connections:
                        target_clients.append((cid, self._connections[cid]))

            if not target_clients:
                # Target is offline
                return {
                    "status": "unavailable",
                    "call_id": call_id,
                    "run_id": resolved_run_id,
                    "message": f"Recipient ({target_role}) is currently offline. Please try again shortly.",
                }

            # Target selected
            target_id, target_ws = target_clients[0]

            session = CallSession(
                call_id=call_id,
                run_id=resolved_run_id,
                caller_id=caller_id,
                caller_role=caller_role,  # type: ignore
                caller_name=caller_name,
                target_id=target_id,
                target_role=target_role,  # type: ignore
                status="ringing",
                created_at=now_iso,
            )
            self._active_calls[call_id] = session

        # Send incoming_call event to target
        incoming_payload = {
            "type": "incoming_call",
            "call_id": call_id,
            "run_id": resolved_run_id,
            "caller_id": caller_id,
            "caller_name": caller_name,
            "caller_role": caller_role,
            "sdp": offer_sdp,
            "timestamp": now_iso,
        }
        try:
            await target_ws.send_text(json.dumps(incoming_payload))
        except Exception as exc:
            logger.error("Failed to deliver incoming call to %s: %s", target_id, exc)
            async with self._lock:
                self._active_calls.pop(call_id, None)
            return {"status": "failed", "error": "delivery_failed", "message": "Could not deliver call to recipient."}

        # Schedule 35-second ringing timeout
        timeout_task = asyncio.create_task(self._handle_call_timeout(call_id))
        self._timeout_tasks[call_id] = timeout_task

        return {
            "status": "ringing",
            "call_id": call_id,
            "target_id": target_id,
            "target_name": self._metadata.get(target_id, {}).get("name", "Recipient"),
            "run_id": resolved_run_id,
        }

    async def _handle_call_timeout(self, call_id: str) -> None:
        try:
            await asyncio.sleep(35)
            session = self._active_calls.get(call_id)
            if session and session.status in ("calling", "ringing"):
                logger.info("Call %s timed out with no answer", call_id)
                await self.end_call(
                    call_id=call_id,
                    ended_by="system",
                    reason="no_answer",
                    duration_seconds=0,
                )
        except asyncio.CancelledError:
            pass

    async def answer_call(self, call_id: str, responder_id: str, answer_sdp: str) -> bool:
        """Answers an incoming call and delivers the answer SDP to the caller."""
        caller_ws = None
        now_iso = datetime.now(timezone.utc).isoformat()

        async with self._lock:
            session = self._active_calls.get(call_id)
            if not session or session.target_id != responder_id:
                return False

            session.status = "connected"
            session.connected_at = now_iso

            # Cancel ringing timeout
            if call_id in self._timeout_tasks:
                self._timeout_tasks[call_id].cancel()
                del self._timeout_tasks[call_id]

            if session.caller_id in self._connections:
                caller_ws = self._connections[session.caller_id]

        if caller_ws:
            payload = {
                "type": "call_answered",
                "call_id": call_id,
                "responder_id": responder_id,
                "sdp": answer_sdp,
                "connected_at": now_iso,
            }
            try:
                await caller_ws.send_text(json.dumps(payload))
                return True
            except Exception as e:
                logger.error("Failed to forward answer to caller %s: %s", session.caller_id, e)
                return False
        return False

    async def relay_ice_candidate(self, call_id: str, sender_id: str, candidate: Any) -> bool:
        """Relays WebRTC ICE candidate to the opposite peer."""
        target_ws = None
        async with self._lock:
            session = self._active_calls.get(call_id)
            if not session:
                return False
            other_id = session.target_id if sender_id == session.caller_id else session.caller_id
            if other_id in self._connections:
                target_ws = self._connections[other_id]

        if target_ws:
            payload = {
                "type": "ice_candidate",
                "call_id": call_id,
                "sender_id": sender_id,
                "candidate": candidate,
            }
            try:
                await target_ws.send_text(json.dumps(payload))
                return True
            except Exception:
                return False
        return False

    async def relay_mute_state(self, call_id: str, sender_id: str, is_muted: bool) -> bool:
        """Notifies peer of microphone mute/unmute state."""
        target_ws = None
        async with self._lock:
            session = self._active_calls.get(call_id)
            if not session:
                return False
            other_id = session.target_id if sender_id == session.caller_id else session.caller_id
            if other_id in self._connections:
                target_ws = self._connections[other_id]

        if target_ws:
            payload = {
                "type": "peer_mute_change",
                "call_id": call_id,
                "sender_id": sender_id,
                "is_muted": is_muted,
            }
            try:
                await target_ws.send_text(json.dumps(payload))
                return True
            except Exception:
                return False
        return False

    async def reject_call(self, call_id: str, rejector_id: str, reason: str = "declined") -> bool:
        """Rejects incoming call and informs caller."""
        caller_ws = None
        session = None

        async with self._lock:
            session = self._active_calls.pop(call_id, None)
            if call_id in self._timeout_tasks:
                self._timeout_tasks[call_id].cancel()
                del self._timeout_tasks[call_id]

            if not session:
                return False

            session.status = "rejected"
            session.ended_at = datetime.now(timezone.utc).isoformat()
            session.end_reason = reason

            if session.caller_id in self._connections:
                caller_ws = self._connections[session.caller_id]

        # Record call outcome
        self._record_call(session)

        if caller_ws:
            payload = {
                "type": "call_rejected",
                "call_id": call_id,
                "rejector_id": rejector_id,
                "reason": reason,
            }
            try:
                await caller_ws.send_text(json.dumps(payload))
            except Exception:
                pass
        return True

    async def end_call(self, call_id: str, ended_by: str, reason: str = "hangup", duration_seconds: int = 0) -> bool:
        """Terminates an active call, notifies counterpart, and persists call audit record."""
        notify_ws = []
        session = None

        async with self._lock:
            session = self._active_calls.pop(call_id, None)
            if call_id in self._timeout_tasks:
                self._timeout_tasks[call_id].cancel()
                del self._timeout_tasks[call_id]

            if not session:
                return False

            session.status = "ended"
            session.ended_at = datetime.now(timezone.utc).isoformat()
            session.duration_seconds = max(duration_seconds, 0)
            session.end_reason = reason

            for participant_id in (session.caller_id, session.target_id):
                if participant_id != ended_by and participant_id in self._connections:
                    notify_ws.append(self._connections[participant_id])

        self._record_call(session)

        payload = {
            "type": "call_ended",
            "call_id": call_id,
            "ended_by": ended_by,
            "reason": reason,
            "duration_seconds": session.duration_seconds,
        }
        for ws in notify_ws:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                pass

        return True

    def _record_call(self, session: CallSession) -> None:
        """Stores call history record in patient storage directory."""
        try:
            record = session.model_dump()
            store.save_call_record(session.run_id, record)
            logger.info("Saved call record for run %s: status=%s, dur=%ds", session.run_id, session.status, session.duration_seconds)
        except Exception as e:
            logger.error("Failed to save call record: %s", e)

    def get_active_call_for_run(self, run_id: str) -> Optional[CallSession]:
        resolved = store.resolve_run_id(run_id) or run_id
        for s in self._active_calls.values():
            if s.run_id == resolved and s.status in ("calling", "ringing", "connected"):
                return s
        return None

    def get_call_history(self, run_id: str) -> list[dict]:
        resolved = store.resolve_run_id(run_id) or run_id
        return store.get_call_history(resolved)


call_manager = CallManager()
