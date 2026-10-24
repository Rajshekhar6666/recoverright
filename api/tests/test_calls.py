"""Unit and integration tests for real-time patient-staff WebRTC calling and signaling."""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.call_manager import CallManager, call_manager
from app.services.storage import store


class TestCallsApiAndSignaling(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.run_id = "run_demo_straightforward"

    def test_ice_config(self):
        """ICE configuration returns Google STUN servers by default."""
        res = self.client.get("/calls/config/ice")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("ice_servers", data)
        self.assertTrue(len(data["ice_servers"]) > 0)
        urls = data["ice_servers"][0]["urls"]
        self.assertTrue(any("stun.l.google.com" in u for u in urls))

    def test_active_and_history_endpoints(self):
        """Active call and history endpoints respond properly."""
        res = self.client.get(f"/calls/active/{self.run_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["active"])

        res_hist = self.client.get(f"/calls/history/{self.run_id}")
        self.assertEqual(res_hist.status_code, 200)
        self.assertIsInstance(res_hist.json(), list)

    def test_websocket_single_client_lifecycle(self):
        """Tests connecting, registering, ping/pong, and initiating when recipient is offline."""
        with self.client.websocket_connect("/ws/calls/staff_test_offline?role=staff&run_id=run_demo_ambiguous&name=Nurse%20Alex") as ws:
            reg = json.loads(ws.receive_text())
            self.assertEqual(reg["type"], "registered")

            # Ping/pong
            ws.send_text(json.dumps({"type": "ping"}))
            pong = json.loads(ws.receive_text())
            self.assertEqual(pong["type"], "pong")

            # Call initiate when target is offline
            call_id = "test_offline_single"
            ws.send_text(
                json.dumps({
                    "type": "call_initiate",
                    "call_id": call_id,
                    "run_id": "run_demo_ambiguous",
                    "caller_role": "staff",
                    "caller_name": "Nurse Alex",
                    "target_role": "patient",
                    "sdp": "offer_sdp_test",
                })
            )
            res = json.loads(ws.receive_text())
            self.assertEqual(res["type"], "call_initiate_response")
            self.assertEqual(res["status"], "unavailable")


class TestCallManagerAsyncFlows(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.cm = CallManager()
        self.run_id = "run_demo_straightforward"

    async def test_full_call_cycle_and_audit(self):
        """Tests complete call cycle: register -> initiate -> answer -> ICE -> mute -> end -> storage."""
        ws_staff = AsyncMock()
        ws_patient = AsyncMock()

        # 1. Register staff & patient
        await self.cm.register("staff_1", ws_staff, "staff", self.run_id, "Nurse Sarah")
        await self.cm.register("patient_1", ws_patient, "patient", self.run_id, "Priya Sharma")

        # Staff should have received online peer_status
        ws_staff.send_text.assert_called()
        last_staff_msg = json.loads(ws_staff.send_text.call_args[0][0])
        self.assertEqual(last_staff_msg["type"], "peer_status")
        self.assertEqual(last_staff_msg["status"], "online")

        # 2. Staff initiates call
        call_id = "call_async_test_01"
        res = await self.cm.initiate_call(
            call_id=call_id,
            run_id=self.run_id,
            caller_id="staff_1",
            caller_role="staff",
            caller_name="Nurse Sarah",
            target_role="patient",
            offer_sdp="v=0\r\no=staff 123 1 IN IP4 127.0.0.1\r\n",
        )
        self.assertEqual(res["status"], "ringing")
        self.assertEqual(res["target_id"], "patient_1")

        # Patient receives incoming_call
        last_patient_msg = json.loads(ws_patient.send_text.call_args[0][0])
        self.assertEqual(last_patient_msg["type"], "incoming_call")
        self.assertEqual(last_patient_msg["call_id"], call_id)
        self.assertEqual(last_patient_msg["caller_name"], "Nurse Sarah")

        # 3. Patient answers call
        ans_ok = await self.cm.answer_call(
            call_id=call_id,
            responder_id="patient_1",
            answer_sdp="v=0\r\no=patient 456 1 IN IP4 127.0.0.1\r\n",
        )
        self.assertTrue(ans_ok)
        answered_staff_msg = json.loads(ws_staff.send_text.call_args[0][0])
        self.assertEqual(answered_staff_msg["type"], "call_answered")
        self.assertEqual(answered_staff_msg["call_id"], call_id)

        # 4. ICE candidate relay
        ice_cand = {"candidate": "candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host", "sdpMid": "0"}
        ice_ok = await self.cm.relay_ice_candidate(call_id, "staff_1", ice_cand)
        self.assertTrue(ice_ok)
        ice_rx = json.loads(ws_patient.send_text.call_args[0][0])
        self.assertEqual(ice_rx["type"], "ice_candidate")
        self.assertEqual(ice_rx["candidate"], ice_cand)

        # 5. Mute state relay
        mute_ok = await self.cm.relay_mute_state(call_id, "patient_1", True)
        self.assertTrue(mute_ok)
        mute_rx = json.loads(ws_staff.send_text.call_args[0][0])
        self.assertEqual(mute_rx["type"], "peer_mute_change")
        self.assertTrue(mute_rx["is_muted"])

        # 6. End call
        ended = await self.cm.end_call(call_id, "staff_1", "hangup", 52)
        self.assertTrue(ended)
        end_rx = json.loads(ws_patient.send_text.call_args[0][0])
        self.assertEqual(end_rx["type"], "call_ended")
        self.assertEqual(end_rx["duration_seconds"], 52)

        # Verify active session cleared
        self.assertIsNone(self.cm.get_active_call_for_run(self.run_id))

        # Verify call history recorded in store
        history = self.cm.get_call_history(self.run_id)
        matching = [c for c in history if c["call_id"] == call_id]
        self.assertTrue(len(matching) > 0)
        self.assertEqual(matching[0]["status"], "ended")
        self.assertEqual(matching[0]["duration_seconds"], 52)

    async def test_call_rejection(self):
        """Tests call rejection by patient."""
        ws_staff = AsyncMock()
        ws_patient = AsyncMock()

        await self.cm.register("staff_2", ws_staff, "staff", self.run_id, "Dr Patel")
        await self.cm.register("patient_2", ws_patient, "patient", self.run_id, "Priya")

        call_id = "call_reject_test"
        await self.cm.initiate_call(
            call_id=call_id,
            run_id=self.run_id,
            caller_id="staff_2",
            caller_role="staff",
            caller_name="Dr Patel",
            target_role="patient",
            offer_sdp="offer_test",
        )

        # Patient declines
        rejected = await self.cm.reject_call(call_id, "patient_2", "patient_resting")
        self.assertTrue(rejected)

        reject_staff_msg = json.loads(ws_staff.send_text.call_args[0][0])
        self.assertEqual(reject_staff_msg["type"], "call_rejected")
        self.assertEqual(reject_staff_msg["reason"], "patient_resting")

    async def test_simultaneous_call_prevention(self):
        """Prevents initiating multiple calls for the same patient simultaneously."""
        ws_staff1 = AsyncMock()
        ws_staff2 = AsyncMock()
        ws_patient = AsyncMock()

        await self.cm.register("staff_a", ws_staff1, "staff", self.run_id, "Nurse 1")
        await self.cm.register("staff_b", ws_staff2, "staff", self.run_id, "Nurse 2")
        await self.cm.register("patient_a", ws_patient, "patient", self.run_id, "Priya")

        # 1. Staff A calls Patient
        res1 = await self.cm.initiate_call("call_first", self.run_id, "staff_a", "staff", "Nurse 1", "patient", "sdp1")
        self.assertEqual(res1["status"], "ringing")

        # 2. Staff B tries to call Patient at the same time
        res2 = await self.cm.initiate_call("call_second", self.run_id, "staff_b", "staff", "Nurse 2", "patient", "sdp2")
        self.assertEqual(res2["status"], "error")
        self.assertEqual(res2["error"], "patient_busy")

        # Cleanup
        await self.cm.end_call("call_first", "staff_a", "hangup")

    async def test_unexpected_disconnect_cleans_call(self):
        """Unexpected disconnect cleans up call and alerts other party."""
        ws_staff = AsyncMock()
        ws_patient = AsyncMock()

        await self.cm.register("staff_d", ws_staff, "staff", self.run_id, "Nurse D")
        await self.cm.register("patient_d", ws_patient, "patient", self.run_id, "Patient D")

        call_id = "call_dc_test"
        await self.cm.initiate_call(call_id, self.run_id, "staff_d", "staff", "Nurse D", "patient", "sdp")
        await self.cm.answer_call(call_id, "patient_d", "answer_sdp")

        # Patient unexpectedly disconnects
        await self.cm.unregister("patient_d")

        # Staff should have received call_ended with reason peer_disconnected
        all_msgs = [json.loads(c[0][0]) for c in ws_staff.send_text.call_args_list]
        call_ended_msgs = [m for m in all_msgs if m.get("type") == "call_ended"]
        self.assertTrue(len(call_ended_msgs) > 0)
        self.assertEqual(call_ended_msgs[0]["reason"], "peer_disconnected")


if __name__ == "__main__":
    unittest.main()
