import json
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.help_store import HelpError, HelpStore, RESOLUTIONS, valid_run_id  # noqa: E402

PATIENT = {"name": "Anita Singh", "language": "hi", "phone": "+919876543210", "guardian_name": "Ravi", "guardian_phone": "+919800000001", "extra": "ignored"}


class Clock:
    def __init__(self):
        self.t = datetime(2026, 10, 19, 10, 0, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.t

    def advance(self, s):
        self.t += timedelta(seconds=s)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = Clock()
        self.s = HelpStore(Path(self.tmp.name), self.clock)

    def tearDown(self):
        self.tmp.cleanup()

    def new(self, **kw):
        a = dict(run_id="run_abc", heard="I can't breathe", severity="critical", label="trouble breathing", source="voice", patient=PATIENT)
        a.update(kw)
        return self.s.create(**a)[0]

    def err(self, status, fn, *a, **kw):
        with self.assertRaises(HelpError) as cm:
            fn(*a, **kw)
        self.assertEqual(cm.exception.status, status, cm.exception.message)


class TestCreate(Base):
    def test_creates_open_item_with_snapshot_sla_and_timeline(self):
        i, created = self.s.create(run_id="run_abc", heard="  I can't   breathe ", severity="critical", label="trouble breathing", patient=PATIENT)
        self.assertTrue(created)
        self.assertEqual(i["status"], "open")
        self.assertEqual(i["heard"], "I can't breathe")
        self.assertEqual(i["patient_name"], "Anita Singh")
        self.assertEqual(i["patient"]["guardian_phone"], "+919800000001")
        self.assertNotIn("extra", i["patient"])
        self.assertEqual(i["sla_seconds"], 120)
        self.assertEqual(i["timeline"][0]["action"], "created")
        self.assertRegex(i["id"], r"^hr_[0-9a-f]{8}$")

    def test_concern_has_longer_sla_and_demo_has_no_patient(self):
        i = self.new(severity="concern", run_id="demo", patient=None, patient_name="Priya")
        self.assertEqual(i["sla_seconds"], 600)
        self.assertIsNone(i["patient"])
        self.assertEqual(i["patient_name"], "Priya")
        self.assertEqual(self.new(run_id="demo2", patient=None)["patient_name"], "Unknown patient")

    def test_validation(self):
        for bad in ("", "../x", "a b", "a/b", "x" * 65, "run;rm", "..\\x"):
            self.assertFalse(valid_run_id(bad), bad)
            self.err(422, self.s.create, run_id=bad, heard="help", severity="concern")
        self.err(422, self.s.create, run_id="r", heard="   ", severity="concern")
        self.err(422, self.s.create, run_id="r", heard="help", severity="urgent")
        self.err(422, self.s.create, run_id="r", heard="help", severity="concern", source="sms")

    def test_long_text_is_truncated_not_rejected(self):
        i = self.new(heard="help " * 400)
        self.assertLessEqual(len(i["heard"]), 500)

    def test_client_id_makes_retries_idempotent(self):
        a, c1 = self.s.create(run_id="r1", heard="help", severity="concern", client_id="abc")
        self.clock.advance(500)
        b, c2 = self.s.create(run_id="r1", heard="help", severity="concern", client_id="abc")
        self.assertEqual((c1, c2), (True, False))
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(len(self.s.list("all")), 1)

    def test_same_words_within_window_dedupe_but_not_after_or_across_patients(self):
        a = self.new()
        self.clock.advance(10)
        _, created = self.s.create(run_id="run_abc", heard="I can't breathe!", severity="critical", source="voice")
        self.assertFalse(created, "same words, same patient, 10 s later")
        self.clock.advance(25)
        _, created = self.s.create(run_id="run_abc", heard="I can't breathe", severity="critical", source="voice")
        self.assertTrue(created, "35 s later it is a new request")
        _, created = self.s.create(run_id="run_other", heard="I can't breathe", severity="critical", source="voice")
        self.assertTrue(created, "different patient")
        self.s.act(a["id"], "resolve", "N", resolution="helped")
        _, created = self.s.create(run_id="run_abc", heard="different words", severity="critical")
        self.assertTrue(created)

    def test_resolved_request_does_not_swallow_a_new_identical_alert(self):
        a = self.new()
        self.s.act(a["id"], "resolve", "N", resolution="false_alarm")
        self.clock.advance(5)
        _, created = self.s.create(run_id="run_abc", heard="I can't breathe", severity="critical", source="voice")
        self.assertTrue(created, "a real second emergency right after a resolved one must page the team")


class TestActions(Base):
    def test_acknowledge(self):
        i = self.new()
        self.clock.advance(42)
        j = self.s.act(i["id"], "acknowledge", "  Nurse   Mehta ")
        self.assertEqual((j["status"], j["acknowledged_by"]), ("acknowledged", "Nurse Mehta"))
        self.assertEqual(j["timeline"][-1]["action"], "acknowledged")
        self.err(409, self.s.act, i["id"], "acknowledge", "X")

    def test_call_acknowledges_open_request_and_counts(self):
        i = self.new()
        j = self.s.act(i["id"], "call", "N", target="guardian", note="no answer")
        self.assertEqual((j["status"], j["calls"]), ("acknowledged", 1))
        self.assertEqual([t["action"] for t in j["timeline"]], ["created", "acknowledged", "call"])
        self.assertIn("guardian", j["timeline"][-1]["note"])
        j = self.s.act(i["id"], "call", "N")
        self.assertEqual(j["calls"], 2)
        self.err(422, self.s.act, i["id"], "call", "N", target="neighbour")

    def test_escalate(self):
        i = self.new()
        j = self.s.act(i["id"], "escalate", "N", note="chest pain")
        self.assertEqual(j["status"], "escalated")
        self.assertIsNotNone(j["acknowledged_at"], "escalating implies it was seen")
        self.err(409, self.s.act, i["id"], "escalate", "N")
        k = self.new(run_id="r2")
        self.s.act(k["id"], "acknowledge", "N")
        self.assertEqual(self.s.act(k["id"], "escalate", "N")["status"], "escalated")

    def test_resolve_requires_a_valid_reason_and_is_terminal(self):
        i = self.new()
        self.err(422, self.s.act, i["id"], "resolve", "N")
        self.err(422, self.s.act, i["id"], "resolve", "N", resolution="because")
        self.assertEqual(self.s.get(i["id"])["status"], "open", "a rejected resolve must change nothing")
        self.clock.advance(90)
        j = self.s.act(i["id"], "resolve", "N", resolution="emergency", note="ambulance sent")
        self.assertEqual(j["status"], "resolved")
        self.assertEqual(j["resolution_label"], RESOLUTIONS["emergency"])
        self.assertIsNotNone(j["acknowledged_at"])
        for a in ("acknowledge", "call", "escalate"):
            self.err(409, self.s.act, i["id"], a, "N")
        self.err(409, self.s.act, i["id"], "resolve", "N", resolution="helped")

    def test_notes_allowed_anytime_but_not_empty(self):
        i = self.new()
        self.s.act(i["id"], "resolve", "N", resolution="helped")
        j = self.s.act(i["id"], "note", "N", note="Followed up next day")
        self.assertEqual(j["timeline"][-1]["note"], "Followed up next day")
        self.err(422, self.s.act, i["id"], "note", "N", note="   ")

    def test_unknown_action_and_unknown_id(self):
        i = self.new()
        self.err(422, self.s.act, i["id"], "delete", "N")
        self.err(404, self.s.act, "hr_00000000", "acknowledge", "N")
        for bad in ("../../etc/passwd", "hr_zzzz", "", "hr_1234567"):
            self.err(404, self.s.get, bad)

    def test_actor_defaults_and_is_bounded(self):
        i = self.new()
        self.assertEqual(self.s.act(i["id"], "acknowledge", "   ")["acknowledged_by"], "Care team")
        self.assertLessEqual(len(self.s.act(i["id"], "note", "x" * 500, note="n")["timeline"][-1]["actor"]), 80)


class TestListAndSummary(Base):
    def test_urgency_ordering(self):
        self.new(run_id="r_concern_old", severity="concern", heard="a")
        self.clock.advance(5)
        crit_new = self.new(run_id="r_crit_new", heard="b")
        self.clock.advance(5)
        ack = self.new(run_id="r_ack", heard="c")
        self.s.act(ack["id"], "acknowledge", "N")
        esc = self.new(run_id="r_esc", heard="d")
        self.s.act(esc["id"], "escalate", "N")
        done = self.new(run_id="r_done", heard="e")
        self.s.act(done["id"], "resolve", "N", resolution="helped")
        order = [i["run_id"] for i in self.s.list("all")]
        self.assertEqual(order, ["r_crit_new", "r_concern_old", "r_esc", "r_ack", "r_done"])
        self.assertEqual(self.s.list("all")[0]["id"], crit_new["id"])

    def test_resolved_newest_first_and_filters(self):
        a, b = self.new(run_id="ra", heard="a"), self.new(run_id="rb", heard="b")
        self.s.act(a["id"], "resolve", "N", resolution="helped")
        self.clock.advance(60)
        self.s.act(b["id"], "resolve", "N", resolution="helped")
        self.assertEqual([i["run_id"] for i in self.s.list("resolved")], ["rb", "ra"])
        self.assertEqual(self.s.list("active"), [])
        self.assertEqual(len(self.s.list("open,resolved")), 2)
        self.assertEqual(len(self.s.list("all", run_id="ra")), 1)
        self.err(422, self.s.list, "bogus")

    def test_include_test_and_limit(self):
        self.new(run_id="r1", heard="a", source="test")
        self.new(run_id="r2", heard="b", source="voice")
        self.new(run_id="r3", heard="c", source="button")
        self.assertEqual(len(self.s.list("all", include_test=False)), 2)
        self.assertEqual(len(self.s.list("all", limit=1)), 1)
        self.assertEqual(self.s.summary(include_test=False)["total"], 2)

    def test_summary_numbers_overdue_and_avg_ack(self):
        a = self.new(run_id="ra", heard="a")                      # critical, SLA 120 s
        self.new(run_id="rb", heard="b", severity="concern")      # concern, SLA 600 s
        self.clock.advance(130)
        s = self.s.summary()
        self.assertEqual((s["open"], s["unacked"], s["critical_unacked"], s["overdue"]), (2, 2, 1, 1))
        self.assertIsNone(s["avg_ack_seconds"])
        self.s.act(a["id"], "acknowledge", "N")
        s = self.s.summary()
        self.assertEqual((s["open"], s["acknowledged"], s["critical_unacked"], s["overdue"]), (1, 1, 0, 0))
        self.assertEqual(s["avg_ack_seconds"], 130.0)
        self.assertEqual(s["oldest_unacked_at"], self.s.list("open")[0]["created_at"])

    def test_counts_by_run(self):
        a = self.new(run_id="ra", heard="a")
        self.new(run_id="ra", heard="b", severity="concern")
        self.s.act(a["id"], "resolve", "N", resolution="helped")
        c = self.s.counts_by_run()["ra"]
        self.assertEqual(c, {"active": 1, "total": 2, "critical_active": 0})


class TestPersistence(Base):
    def test_survives_restart_and_leaves_no_temp_files(self):
        i = self.new()
        self.s.act(i["id"], "acknowledge", "N")
        again = HelpStore(Path(self.tmp.name), self.clock)
        self.assertEqual(again.get(i["id"])["status"], "acknowledged")
        self.assertEqual(list(Path(self.tmp.name).glob("*.tmp")), [])

    def test_a_corrupt_file_does_not_take_the_inbox_down(self):
        self.new()
        (Path(self.tmp.name) / "hr_deadbeef.json").write_text("{not json", encoding="utf-8")
        self.assertEqual(len(self.s.list("all")), 1)
        self.assertEqual(self.s.summary()["total"], 1)

    def test_concurrent_identical_retries_create_exactly_one_request(self):
        results, errs = [], []

        def go():
            try:
                results.append(self.s.create(run_id="r1", heard="help", severity="concern", client_id="same-alert")[1])
            except Exception as e:  # pragma: no cover
                errs.append(e)

        ts = [threading.Thread(target=go) for _ in range(12)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        self.assertEqual(errs, [])
        self.assertEqual(results.count(True), 1)
        self.assertEqual(len(self.s.list("all")), 1)

    def test_concurrent_actions_never_lose_a_call(self):
        i = self.new()
        ts = [threading.Thread(target=lambda: self.s.act(i["id"], "call", "N")) for _ in range(10)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        j = self.s.get(i["id"])
        self.assertEqual(j["calls"], 10)
        self.assertEqual(sum(1 for t in j["timeline"] if t["action"] == "call"), 10)


if __name__ == "__main__":
    unittest.main()
