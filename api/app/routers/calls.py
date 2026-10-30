"""API endpoints and WebSocket signaling for Real-Time Patient-Staff Calls."""
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.schemas.calls import CallActionRequest, CallHistoryItem, CallSession, IceConfigResponse
from app.services.call_manager import call_manager
from app.services.storage import store

logger = logging.getLogger("recoverright.calls_router")

router = APIRouter(tags=["calls"])


@router.get("/calls/config/ice", response_model=IceConfigResponse)
def get_ice_servers():
    """Returns ICE/STUN/TURN configuration for WebRTC client initialization."""
    return call_manager.get_ice_config()


@router.get("/calls/history/{patient_id}", response_model=list[CallHistoryItem])
def get_call_history(patient_id: str):
    """Returns persistent call logs for a specific patient run."""
    run_id = store.resolve_run_id(patient_id) or patient_id
    if not store.exists(run_id):
        raise HTTPException(status_code=404, detail="Patient record not found")
    records = call_manager.get_call_history(run_id)
    return [CallHistoryItem.model_validate(r) for r in records]


@router.get("/calls/active/{patient_id}")
def get_active_call(patient_id: str):
    """Returns any current active call session for this patient."""
    run_id = store.resolve_run_id(patient_id) or patient_id
    session = call_manager.get_active_call_for_run(run_id)
    if not session:
        return {"active": False, "session": None}
    return {"active": True, "session": session.model_dump()}


@router.post("/calls/end")
async def end_call_rest(body: CallActionRequest):
    """REST fallback to end a call if socket dropped."""
    success = await call_manager.end_call(
        call_id=body.call_id,
        ended_by="rest_client",
        reason=body.reason or "hangup",
        duration_seconds=body.duration_seconds or 0,
    )
    return {"success": success}


@router.websocket("/ws/calls/{client_id}")
async def call_signaling_websocket(
    websocket: WebSocket,
    client_id: str,
    role: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
):
    """WebSocket signaling endpoint for WebRTC audio calls."""
    await websocket.accept()

    # If query parameters are provided, register right away
    registered = False
    cur_role = role or "staff"
    cur_run_id = store.resolve_run_id(run_id or "") or (run_id or "default")
    cur_name = name or ("Staff Nurse" if cur_role == "staff" else "Patient")

    if role and run_id:
        await call_manager.register(
            client_id=client_id,
            websocket=websocket,
            role=cur_role,
            run_id=cur_run_id,
            name=cur_name,
        )
        registered = True
        await websocket.send_text(
            json.dumps({
                "type": "registered",
                "client_id": client_id,
                "role": cur_role,
                "run_id": cur_run_id,
            })
        )

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
            except Exception:
                continue

            msg_type = data.get("type")

            if msg_type == "register":
                cur_role = data.get("role", cur_role)
                raw_run = data.get("run_id", cur_run_id)
                cur_run_id = store.resolve_run_id(raw_run) or raw_run
                cur_name = data.get("name", cur_name)
                await call_manager.register(
                    client_id=client_id,
                    websocket=websocket,
                    role=cur_role,
                    run_id=cur_run_id,
                    name=cur_name,
                )
                registered = True
                await websocket.send_text(
                    json.dumps({
                        "type": "registered",
                        "client_id": client_id,
                        "role": cur_role,
                        "run_id": cur_run_id,
                    })
                )

            elif msg_type == "call_initiate":
                call_id = data.get("call_id")
                req_run_id = store.resolve_run_id(data.get("run_id") or cur_run_id) or cur_run_id
                caller_role = data.get("caller_role", cur_role)
                caller_name = data.get("caller_name", cur_name)
                target_role = data.get("target_role", "patient" if caller_role == "staff" else "staff")
                offer_sdp = data.get("sdp", "")

                result = await call_manager.initiate_call(
                    call_id=call_id,
                    run_id=req_run_id,
                    caller_id=client_id,
                    caller_role=caller_role,
                    caller_name=caller_name,
                    target_role=target_role,
                    offer_sdp=offer_sdp,
                )
                await websocket.send_text(
                    json.dumps({"type": "call_initiate_response", **result})
                )

            elif msg_type == "call_answer":
                call_id = data.get("call_id")
                answer_sdp = data.get("sdp", "")
                success = await call_manager.answer_call(
                    call_id=call_id,
                    responder_id=client_id,
                    answer_sdp=answer_sdp,
                )
                if not success:
                    await websocket.send_text(
                        json.dumps({"type": "call_error", "message": "Could not answer call session."})
                    )

            elif msg_type == "ice_candidate":
                call_id = data.get("call_id")
                candidate = data.get("candidate")
                await call_manager.relay_ice_candidate(
                    call_id=call_id,
                    sender_id=client_id,
                    candidate=candidate,
                )

            elif msg_type == "call_reject":
                call_id = data.get("call_id")
                reason = data.get("reason", "declined")
                await call_manager.reject_call(
                    call_id=call_id,
                    rejector_id=client_id,
                    reason=reason,
                )

            elif msg_type == "call_end":
                call_id = data.get("call_id")
                reason = data.get("reason", "hangup")
                duration = data.get("duration_seconds", 0)
                await call_manager.end_call(
                    call_id=call_id,
                    ended_by=client_id,
                    reason=reason,
                    duration_seconds=duration,
                )

            elif msg_type == "call_mute":
                call_id = data.get("call_id")
                is_muted = bool(data.get("is_muted"))
                await call_manager.relay_mute_state(
                    call_id=call_id,
                    sender_id=client_id,
                    is_muted=is_muted,
                )

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for client %s", client_id)
    except Exception as exc:
        logger.error("Error in call signaling websocket: %s", exc)
    finally:
        if registered:
            await call_manager.unregister(client_id)



# ── Feature: Automated Voice Call Dispatch (Gap 7 Telephony Fallback) ───────

from pydantic import BaseModel

class AutomatedCallRequest(BaseModel):
    run_id: str
    recipient_phone: Optional[str] = None
    reason: str = "medication_reminder"
    language: str = "en"


@router.post("/calls/dispatch-automated-call")
def trigger_automated_voice_call(body: AutomatedCallRequest):
    """Dispatches an automated IVR voice phone call in English or Hindi.

    Gap 7 & 12 (Rural Health Evidence S12): For patients who do not use
    smartphones, have low digital literacy (~11% in rural Indian elderly),
    or miss reminders, automated voice calls provide a vital voice safety net.
    """
    from app.services.telephony import dispatch_automated_voice_call
    real_run_id = store.resolve_run_id(body.run_id) or body.run_id
    if not store.exists(real_run_id):
        raise HTTPException(status_code=404, detail="Run not found")

    meta = store.read(real_run_id, "meta.json") if store.has(real_run_id, "meta.json") else {}
    patient = meta.get("patient") or {}

    # Target phone: explicit body param, caregiver-first phone, or patient phone
    phone = (
        body.recipient_phone
        or (patient.get("guardian_phone") if patient.get("caregiver_first") else None)
        or patient.get("phone")
        or "+91 98000 00000"
    )

    lang = body.language or patient.get("language") or "en"
    patient_name = patient.get("name") or "Patient"

    return dispatch_automated_voice_call(
        run_id=real_run_id,
        recipient_phone=phone,
        call_reason=body.reason,
        language=lang,
        patient_name=patient_name,
    )
