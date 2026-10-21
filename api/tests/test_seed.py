import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.help_store import HelpStore  # noqa: E402
from tools.seed_help import clear, seed  # noqa: E402


class TestSeed(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.runs = base / "runs"
        for i, name in enumerate(["Newest", "Middle", "Oldest", "Extra"]):
            d = self.runs / f"run_{i}"
            d.mkdir(parents=True)
            (d / "meta.json").write_text(json.dumps({"run_id": f"run_{i}", "created_at": f"2026-10-0{4 - i}T00:00:00+00:00", "patient": {"name": name, "phone": "+919800000000"}}), encoding="utf-8")
        (self.runs / "run_bad").mkdir()
        (self.runs / "run_bad" / "meta.json").write_text("{broken", encoding="utf-8")
        self.s = HelpStore(base / "help")

    def tearDown(self):
        self.tmp.cleanup()

    def test_seeds_newest_patients_as_test_requests_and_is_idempotent(self):
        made = seed(self.runs, self.s)
        self.assertEqual([m["patient_name"] for m in made], ["Newest", "Middle", "Oldest"])
        self.assertTrue(all(m["source"] == "test" for m in made))
        self.assertEqual(made[0]["severity"], "critical")
        seed(self.runs, self.s)
        self.assertEqual(len(self.s.list("all")), 3, "running it twice must not duplicate")

    def test_clear_removes_only_seeded_requests(self):
        seed(self.runs, self.s)
        real, _ = self.s.create(run_id="run_3", heard="a genuine request", severity="critical", source="voice")
        self.assertEqual(clear(self.s), 3)
        self.assertEqual([i["id"] for i in self.s.list("all")], [real["id"]])

    def test_no_patients_means_nothing_seeded(self):
        self.assertEqual(seed(self.runs / "nowhere", self.s), [])


if __name__ == "__main__":
    unittest.main()
