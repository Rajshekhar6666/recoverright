import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.directory import group_plan, humanize_audit, patient_detail, patient_summary, patients_index, read_audit  # noqa: E402


def meta(rid, name="Anita Singh", status="needs_review", created="2026-10-19T10:00:00+00:00", counts=None, approved=False):
    return {"run_id": rid, "filename": f"{rid}.pdf", "created_at": created, "status": status, "approved": approved,
            "patient": {"name": name, "language": "hi", "phone": "+91 98765 43210", "guardian_name": "", "guardian_phone": ""},
            "counts": counts}


class TestDirectory(unittest.TestCase):
    def test_summary_fields_and_to_check(self):
        s = patient_summary(meta("r1", counts={"agreed": 9, "review": 1, "conflict": 1, "rejected": 0}), {"active": 2, "critical_active": 1, "total": 3})
        self.assertEqual((s["id"], s["name"], s["to_check"], s["help_active"], s["help_critical_active"]), ("r1", "Anita Singh", 2, 2, 1))
        self.assertIsNone(patient_summary(meta("r2"))["to_check"], "no counts yet means unknown, not zero")
        self.assertEqual(patient_summary({"run_id": "r3"})["status"], "queued")

    def test_index_puts_people_needing_help_first_then_newest(self):
        runs = [meta("old", created="2026-10-17T00:00:00+00:00"), meta("new", created="2026-10-19T00:00:00+00:00"),
                meta("help", created="2026-10-10T00:00:00+00:00"), meta("crit", created="2026-10-01T00:00:00+00:00")]
        idx = patients_index(runs, {"help": {"active": 1, "critical_active": 0, "total": 1}, "crit": {"active": 1, "critical_active": 1, "total": 1}})
        self.assertEqual([r["id"] for r in idx], ["crit", "help", "new", "old"])
        self.assertEqual(patients_index([{"nope": 1}]), [], "a run without an id is skipped, not a crash")

    def test_read_audit_skips_damaged_lines(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "audit.jsonl"
            self.assertEqual(read_audit(p), [])
            p.write_text('{"action":"run.created"}\n\n{broken\n{"action":"plan.approved"}\n', encoding="utf-8")
            self.assertEqual([a["action"] for a in read_audit(p)], ["run.created", "plan.approved"])

    def test_humanize(self):
        h = humanize_audit({"ts": "t", "actor": "nurse", "action": "plan.approved", "items": 11})
        self.assertEqual((h["tone"], h["text"]), ("ok", "Plan approved and locked (11 items)"))
        self.assertEqual(humanize_audit({"action": "run.created", "filename": "x.pdf"})["text"], "Document uploaded: x.pdf")
        self.assertEqual(humanize_audit({"action": "field.reject", "field_id": "f3"})["tone"], "bad")
        self.assertEqual(humanize_audit({"action": "mystery"})["text"], "mystery")
        self.assertEqual(humanize_audit({"action": "x"})["actor"], "system")

    def test_group_plan_order_and_summaries(self):
        plan = {"items": [
            {"category": "follow_ups", "field_id": "f4", "attrs": {"what": "Physio", "when": "in 2 weeks", "where": None}, "decision": "confirmed"},
            {"category": "medications", "field_id": "f1", "attrs": {"name": "Placebex", "dose": "1 tablet", "frequency": "As needed", "duration": None}, "decision": "edited", "decided_by": "Nurse"},
            {"category": "zzz_custom", "field_id": "f9", "attrs": {"a": "b"}},
            {"category": "wound_care", "field_id": "f2", "attrs": {"instruction": "Keep dry"}}]}
        g = group_plan(plan)
        self.assertEqual([x["category"] for x in g], ["medications", "wound_care", "follow_ups", "zzz_custom"])
        self.assertEqual(g[0]["items"][0]["summary"], "Placebex · 1 tablet · As needed")
        self.assertTrue(g[0]["items"][0]["edited"])
        self.assertEqual(g[2]["items"][0]["summary"], "Physio · in 2 weeks")
        self.assertEqual(g[3]["label"], "Zzz Custom")
        self.assertEqual(group_plan(None), [])
        self.assertEqual(group_plan({"items": []}), [])

    def test_detail_counts_only_unresolved_help_and_reverses_activity(self):
        help_items = [{"status": "open", "severity": "critical"}, {"status": "resolved", "severity": "critical"}, {"status": "acknowledged", "severity": "concern"}]
        d = patient_detail(meta("r1", status="approved", approved=True), None, [{"action": "run.created", "ts": "1"}, {"action": "plan.approved", "ts": "2"}], help_items)
        self.assertEqual((d["summary"]["help_active"], d["summary"]["help_critical_active"], d["summary"]["help_total"]), (2, 1, 3))
        self.assertEqual([a["action"] for a in d["activity"]], ["plan.approved", "run.created"])
        self.assertEqual(d["plan"], [])
        json.dumps(d)  # must be JSON-serialisable as-is


if __name__ == "__main__":
    unittest.main()
