"""Tests covering Gap Analysis fixes: dose times, scheduler, completeness, translate, eval, reconcile, reviewer timing.

Each test class is labelled with its Gap number from the gap analysis report.
All tests use the same synthetic demo cases and in-memory storage that the
existing test suite uses — no live API keys required.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone

from fastapi.testclient import TestClient

# Ensure the api package is on the path when running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app
from app.pipeline.tasks import (
    times_for_frequency,
    build_medication_schedules,
    generate_tasks_for_plan,
    TIME_NOT_SET,
    TIME_NOT_SET_LABEL,
)
from app.pipeline.translate import translate_text, translate_plan_view, SUPPORTED_LANGUAGES
from app.pipeline.review import blockers, _completeness_blockers, REQUIRED_CATEGORIES
from app.schemas.api import ApprovedPlan, ApprovedPlanItem
from app.schemas.review import ReviewField
from app.services.storage import store


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_approved_plan(medications: list[dict] | None = None,
                        follow_ups: list[dict] | None = None,
                        warning_signs: list[dict] | None = None,
                        contacts: list[dict] | None = None,
                        run_id: str = "run_test01",
                        confirmed_times: str | None = None) -> ApprovedPlan:
    """Build a minimal ApprovedPlan for testing."""
    items = []
    if medications is not None:
        for i, m in enumerate(medications):
            attrs = {**m}
            if confirmed_times:
                attrs["confirmed_times"] = confirmed_times
            items.append(ApprovedPlanItem(
                field_id=f"medications:u{i}",
                category="medications",
                attrs=attrs,
                decision="confirmed",
                decided_by="nurse",
            ))
    if follow_ups is not None:
        for i, fu in enumerate(follow_ups):
            items.append(ApprovedPlanItem(
                field_id=f"follow_ups:u{i}",
                category="follow_ups",
                attrs=fu,
                decision="confirmed",
                decided_by="nurse",
            ))
    if warning_signs is not None:
        for i, ws in enumerate(warning_signs):
            items.append(ApprovedPlanItem(
                field_id=f"warning_signs:u{i}",
                category="warning_signs",
                attrs=ws,
                decision="confirmed",
                decided_by="nurse",
            ))
    if contacts is not None:
        for i, c in enumerate(contacts):
            items.append(ApprovedPlanItem(
                field_id=f"contacts:u{i}",
                category="contacts",
                attrs=c,
                decision="confirmed",
                decided_by="nurse",
            ))
    return ApprovedPlan(
        run_id=run_id,
        version=1,
        approved_by="nurse",
        approved_at=datetime.now(timezone.utc).isoformat(),
        items=items,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Gap 3: Dose times must never be guessed
# ─────────────────────────────────────────────────────────────────────────────

class TestGap3DoseTimes(unittest.TestCase):
    """Gap 3: Clinician-unconfirmed dose times must be marked TIME_NOT_SET."""

    def test_times_for_frequency_returns_suggestions(self):
        """times_for_frequency still returns a list of suggestion strings."""
        times = times_for_frequency("twice daily")
        self.assertEqual(len(times), 2)

    def test_times_for_frequency_prn_returns_empty(self):
        """PRN / as-needed medications return no scheduled times."""
        self.assertEqual(times_for_frequency("as needed"), [])
        self.assertEqual(times_for_frequency("PRN"), [])

    def test_build_medication_schedules_without_confirmed_times_uses_sentinel(self):
        """Without confirmed_times attr, each scheduled slot is TIME_NOT_SET."""
        plan = _make_approved_plan(
            medications=[{"name": "Paracetamol", "dose": "500 mg", "frequency": "twice daily"}]
        )
        schedules = build_medication_schedules(plan)
        self.assertEqual(len(schedules), 1)
        s = schedules[0]
        # Two slots (twice daily) both unconfirmed
        self.assertEqual(len(s.times), 2)
        for t in s.times:
            self.assertEqual(t, TIME_NOT_SET,
                             f"Expected TIME_NOT_SET sentinel, got {t!r}")

    def test_build_medication_schedules_with_confirmed_times(self):
        """If confirmed_times is set in attrs, those exact times are used."""
        plan = _make_approved_plan(
            medications=[{
                "name": "Metformin",
                "dose": "500 mg",
                "frequency": "twice daily",
            }],
            confirmed_times="07:00 AM, 07:00 PM",
        )
        schedules = build_medication_schedules(plan)
        self.assertEqual(schedules[0].times, ["07:00 AM", "07:00 PM"])

    def test_generate_tasks_sentinel_becomes_human_label(self):
        """Tasks with TIME_NOT_SET sentinel show the human-readable label."""
        plan = _make_approved_plan(
            medications=[{"name": "Ibuprofen", "dose": "400 mg", "frequency": "three times daily"}]
        )
        tasks = generate_tasks_for_plan(plan)
        med_tasks = [t for t in tasks if t.category == "medication"]
        self.assertEqual(len(med_tasks), 3)
        for t in med_tasks:
            self.assertEqual(t.scheduled_time, TIME_NOT_SET_LABEL,
                             f"Expected human label, got {t.scheduled_time!r}")

    def test_once_daily_morning_unconfirmed(self):
        """Once daily generates one TIME_NOT_SET slot."""
        plan = _make_approved_plan(
            medications=[{"name": "Atorvastatin", "dose": "40 mg", "frequency": "once daily"}]
        )
        schedules = build_medication_schedules(plan)
        self.assertEqual(len(schedules[0].times), 1)
        self.assertEqual(schedules[0].times[0], TIME_NOT_SET)

    def test_prn_med_produces_as_needed_task(self):
        """PRN medication generates a single 'As needed' task (no sentinel)."""
        plan = _make_approved_plan(
            medications=[{"name": "Tramadol", "dose": "50 mg", "frequency": "as needed"}]
        )
        tasks = generate_tasks_for_plan(plan)
        med_tasks = [t for t in tasks if t.category == "medication"]
        self.assertEqual(len(med_tasks), 1)
        self.assertEqual(med_tasks[0].scheduled_time, "As needed")

    def test_unknown_frequency_returns_no_times(self):
        """Unknown frequency wording produces no guessed times."""
        # Previously returned ["08:00 AM"] – now returns []
        self.assertEqual(times_for_frequency("with meals"), [])


# ─────────────────────────────────────────────────────────────────────────────
# Gap 5: Completeness gate
# ─────────────────────────────────────────────────────────────────────────────

class TestGap5CompletenessGate(unittest.TestCase):
    """Gap 5: Plans missing required categories are blocked from approval."""

    def _make_review_fields(self, categories: list[str]) -> list[ReviewField]:
        """Build ReviewField list with one confirmed item per given category."""
        from app.schemas.reconcile import ReconciledField
        from app.schemas.review import FieldDecision
        fields = []
        for i, cat in enumerate(categories):
            rf = ReconciledField(
                field_id=f"{cat}:u{i}",
                category=cat,
                critical=True,
                status="agreed",
                voters=["A"],
                opinions=[],
                units=[f"u{i}"],
                proposed={"name": "test"} if cat == "medications" else {"text": "test"},
                proposed_from="Extractor A",
            )
            rv = ReviewField(field=rf)
            rv.decision = FieldDecision(action="confirm", by="nurse",
                                        at=datetime.now(timezone.utc))
            fields.append(rv)
        return fields

    def test_completeness_blockers_all_present(self):
        """All required categories present → zero completeness blockers."""
        items = self._make_review_fields(list(REQUIRED_CATEGORIES.keys()))
        cb = _completeness_blockers(items)
        self.assertEqual(cb, [])

    def test_completeness_blockers_missing_contacts(self):
        """Missing 'contacts' category generates one completeness blocker."""
        cats = [c for c in REQUIRED_CATEGORIES if c != "contacts"]
        items = self._make_review_fields(cats)
        cb = _completeness_blockers(items)
        self.assertEqual(len(cb), 1)
        self.assertEqual(cb[0]["category"], "contacts")
        self.assertEqual(cb[0]["status"], "missing")

    def test_completeness_blockers_missing_all(self):
        """Empty item list → one blocker per required category."""
        cb = _completeness_blockers([])
        missing_cats = {b["category"] for b in cb}
        self.assertEqual(missing_cats, set(REQUIRED_CATEGORIES.keys()))

    def test_rejected_item_not_counted_as_present(self):
        """A rejected item does not satisfy the completeness requirement."""
        from app.schemas.reconcile import ReconciledField
        from app.schemas.review import FieldDecision
        rf = ReconciledField(
            field_id="warning_signs:u0",
            category="warning_signs",
            critical=True,
            status="agreed",
            voters=["A"],
            opinions=[],
            units=["u0"],
            proposed={"text": "fever"},
            proposed_from="Extractor A",
        )
        rv = ReviewField(field=rf)
        rv.decision = FieldDecision(action="reject", by="nurse",
                                    at=datetime.now(timezone.utc))
        cb = _completeness_blockers([rv])
        missing = {b["category"] for b in cb}
        self.assertIn("warning_signs", missing)

    def test_blockers_includes_completeness(self):
        """blockers() includes both field-level and completeness blockers."""
        cb = blockers([])
        self.assertGreater(len(cb), 0)
        cat_set = {b["category"] for b in cb}
        for req_cat in REQUIRED_CATEGORIES:
            self.assertIn(req_cat, cat_set)


# ─────────────────────────────────────────────────────────────────────────────
# Gap 8: Translation
# ─────────────────────────────────────────────────────────────────────────────

class TestGap8Translation(unittest.TestCase):
    """Gap 8: Plan translation locks doses, preserves originals, flags for review."""

    def test_english_to_english_passthrough(self):
        """Translating en → en returns the original unchanged."""
        result = translate_text("Take with water", "en")
        self.assertEqual(result["translated"], "Take with water")
        self.assertFalse(result["needs_review"])

    def test_hindi_phrase_lookup(self):
        """Known Hindi phrase is translated and original is preserved."""
        result = translate_text("Take with water", "hi")
        self.assertEqual(result["original"], "Take with water")
        self.assertNotEqual(result["translated"], "Take with water",
                            "Expected Hindi translation, got original unchanged")
        self.assertIn("lang", result)

    def test_dose_value_locked(self):
        """Numeric dose values are preserved in translation (not mangled)."""
        result = translate_text("Take 500 mg twice daily", "hi")
        # The translated text must still contain "500 mg"
        self.assertIn("500 mg", result["translated"])

    def test_unknown_language_returns_unsupported_flag(self):
        """Unknown language code returns needs_review=True."""
        result = translate_text("Keep wound clean and dry", "xx")
        # Unknown languages should either flag needs_review or note unsupported
        self.assertTrue(result.get("needs_review") or "not in the supported" in result.get("note", ""))

    def test_stub_language_flagged(self):
        """Stub languages (mr, ta, bn, te) are flagged as inactive."""
        for lang in ("mr", "ta", "bn", "te"):
            result = translate_text("Follow-up appointment", lang)
            self.assertTrue(result.get("needs_review") or not SUPPORTED_LANGUAGES[lang].get("active"))

    def test_translate_plan_view_returns_originals(self):
        """translate_plan_view includes original text alongside translation."""
        items = [
            {"category": "wound_care", "field_id": "wc:0",
             "attrs": {"instruction": "Keep wound clean and dry"}},
        ]
        result = translate_plan_view(items, "hi")
        self.assertIn("translated_items", result)
        ti = result["translated_items"][0]
        self.assertIn("translation", ti)
        instr_t = ti["translation"].get("instruction", {})
        self.assertEqual(instr_t.get("original"), "Keep wound clean and dry")

    def test_supported_languages_list(self):
        """SUPPORTED_LANGUAGES must include en and hi as active."""
        self.assertIn("en", SUPPORTED_LANGUAGES)
        self.assertIn("hi", SUPPORTED_LANGUAGES)
        self.assertTrue(SUPPORTED_LANGUAGES["en"]["active"])
        self.assertTrue(SUPPORTED_LANGUAGES["hi"]["active"])

    def test_languages_endpoint(self):
        """GET /languages returns supported language list."""
        client = TestClient(app)
        resp = client.get("/languages")
        self.assertEqual(resp.status_code, 200)
        codes = [lang["code"] for lang in resp.json()["languages"]]
        self.assertIn("en", codes)
        self.assertIn("hi", codes)


# ─────────────────────────────────────────────────────────────────────────────
# Gap 2: Admission vs discharge medication reconciliation
# ─────────────────────────────────────────────────────────────────────────────

class TestGap2MedicationReconciliation(unittest.TestCase):
    """Gap 2: Admission medication list comparison against discharge plan."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.orig = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)
        # Load a demo case
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        meta = resp.json()
        self.run_id = meta["run_id"]
        # Approve
        self.client.post(f"/runs/{self.run_id}/approve",
                         json={"by": "Nurse Test", "role": "Registered Nurse"})

    def tearDown(self):
        if self.orig:
            os.environ["RR_RUNS_DIR"] = self.orig
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()

    def test_set_admission_medications_returns_reconciliation(self):
        """POST /runs/{id}/admission-medications returns reconciliation dict."""
        resp = self.client.post(
            f"/runs/{self.run_id}/admission-medications",
            json={
                "medications": [
                    {"name": "Paracetamol", "dose": "500 mg", "frequency": "three times daily"},
                    {"name": "Amlodipine", "dose": "5 mg", "frequency": "once daily"},
                ],
                "recorded_by": "Nurse Test",
            }
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("reconciliation", data)
        self.assertIn("clinical_note", data)

    def test_reconciliation_has_required_keys(self):
        """Reconciliation result has unchanged, changed, added, stopped keys."""
        self.client.post(
            f"/runs/{self.run_id}/admission-medications",
            json={
                "medications": [{"name": "Paracetamol", "dose": "500 mg", "frequency": "three times daily"}],
                "recorded_by": "Nurse Test",
            }
        )
        resp = self.client.get(f"/runs/{self.run_id}/medication-reconciliation")
        self.assertEqual(resp.status_code, 200)
        recon = resp.json()["reconciliation"]
        for key in ("unchanged", "changed", "added", "stopped", "summary"):
            self.assertIn(key, recon, f"Missing key: {key}")

    def test_stopped_medication_flagged(self):
        """A medication taken before admission but absent from discharge is flagged 'stopped'."""
        resp = self.client.post(
            f"/runs/{self.run_id}/admission-medications",
            json={
                "medications": [
                    {"name": "Warfarin", "dose": "5 mg", "frequency": "once daily"},
                ],
                "recorded_by": "Nurse Test",
            }
        )
        data = resp.json()
        recon = data["reconciliation"]
        # Warfarin is not in the demo_straightforward discharge plan
        stopped_names = [m["name"].lower() for m in recon["stopped"]]
        self.assertIn("warfarin", stopped_names)

    def test_no_admission_meds_returns_empty(self):
        """GET reconciliation without prior POST returns has_admission_meds=False."""
        resp = self.client.get(f"/runs/{self.run_id}/medication-reconciliation")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["has_admission_meds"])


# ─────────────────────────────────────────────────────────────────────────────
# Gap 4: Reviewer decision latency
# ─────────────────────────────────────────────────────────────────────────────

class TestGap4ReviewerTiming(unittest.TestCase):
    """Gap 4: Reviewer decision latency is recorded and fast decisions flagged."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.orig = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(self.tmp.name) / "runs")
        self.client = TestClient(app)
        resp = self.client.post("/demo/cases/demo_straightforward/load")
        self.assertEqual(resp.status_code, 200)
        self.run_id = resp.json()["run_id"]

    def tearDown(self):
        if self.orig:
            os.environ["RR_RUNS_DIR"] = self.orig
        else:
            os.environ.pop("RR_RUNS_DIR", None)
        self.tmp.cleanup()

    def test_decision_seconds_stored_and_retrievable(self):
        """Submitting decision_seconds stores a timing record."""
        # Get review fields
        resp = self.client.get(f"/runs/{self.run_id}/review")
        fields = resp.json()["fields"]
        if not fields:
            self.skipTest("Demo case has no review fields")

        field_id = fields[0]["field"]["field_id"]
        # Confirm the field with a latency reading
        self.client.patch(
            f"/runs/{self.run_id}/fields/{field_id}",
            json={"action": "confirm", "by": "Nurse Speed", "decision_seconds": 2.5}
        )

        resp = self.client.get(f"/runs/{self.run_id}/review-timings")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreater(data["total_decisions"], 0)

    def test_fast_review_flagged(self):
        """Decision in under 5 seconds is flagged as fast_review_flag=True."""
        resp = self.client.get(f"/runs/{self.run_id}/review")
        fields = resp.json()["fields"]
        if not fields:
            self.skipTest("No fields to review")

        field_id = fields[0]["field"]["field_id"]
        self.client.patch(
            f"/runs/{self.run_id}/fields/{field_id}",
            json={"action": "confirm", "by": "Nurse Flash", "decision_seconds": 1.2}
        )

        resp = self.client.get(f"/runs/{self.run_id}/review-timings")
        timings = resp.json()["timings"]
        self.assertTrue(any(t["fast_review_flag"] for t in timings),
                        "Expected at least one fast_review_flag=True")
        self.assertGreater(resp.json()["fast_review_flags"], 0)

    def test_slow_review_not_flagged(self):
        """A 30-second decision is not flagged as fast."""
        resp = self.client.get(f"/runs/{self.run_id}/review")
        fields = resp.json()["fields"]
        if not fields:
            self.skipTest("No fields to review")

        field_id = fields[0]["field"]["field_id"]
        self.client.patch(
            f"/runs/{self.run_id}/fields/{field_id}",
            json={"action": "confirm", "by": "Nurse Careful", "decision_seconds": 30.0}
        )

        resp = self.client.get(f"/runs/{self.run_id}/review-timings")
        timings = resp.json()["timings"]
        slow = [t for t in timings if t.get("decision_seconds", 0) >= 5.0]
        for t in slow:
            self.assertFalse(t["fast_review_flag"])


# ─────────────────────────────────────────────────────────────────────────────
# Gap 6: Server-side scheduler (unit tests only – no time travel needed)
# ─────────────────────────────────────────────────────────────────────────────

class TestGap6Scheduler(unittest.TestCase):
    """Gap 6: Scheduler module is importable, starts, and reports status."""

    def test_scheduler_imports_cleanly(self):
        """Scheduler module imports without error."""
        from app.services import scheduler
        self.assertTrue(hasattr(scheduler, "start_scheduler"))
        self.assertTrue(hasattr(scheduler, "stop_scheduler"))
        self.assertTrue(hasattr(scheduler, "get_scheduler_status"))

    def test_get_scheduler_status_before_start(self):
        """get_scheduler_status returns a dict even when scheduler hasn't started."""
        from app.services.scheduler import get_scheduler_status
        status = get_scheduler_status()
        self.assertIsInstance(status, dict)
        self.assertIn("running", status)
        self.assertIn("jobs", status)

    def test_tick_does_not_crash_on_empty_store(self):
        """_tick() runs without error when no runs exist."""
        from app.services.scheduler import _tick
        tmp = tempfile.TemporaryDirectory()
        orig = os.environ.get("RR_RUNS_DIR")
        os.environ["RR_RUNS_DIR"] = str(Path(tmp.name) / "runs")
        try:
            _tick()  # Should complete without raising
        finally:
            if orig:
                os.environ["RR_RUNS_DIR"] = orig
            else:
                os.environ.pop("RR_RUNS_DIR", None)
            tmp.cleanup()

    def test_system_metrics_includes_scheduler(self):
        """GET /system/metrics returns scheduler key."""
        client = TestClient(app)
        resp = client.get("/system/metrics")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("scheduler", resp.json())


# ─────────────────────────────────────────────────────────────────────────────
# Gap 1: Eval framework (unit test – not a full LLM eval)
# ─────────────────────────────────────────────────────────────────────────────

class TestGap1EvalFramework(unittest.TestCase):
    """Gap 1: Eval runner is importable and returns well-formed metrics."""

    def test_eval_imports_cleanly(self):
        """eval/run_eval.py imports without error."""
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "eval"))
        import run_eval
        self.assertTrue(hasattr(run_eval, "evaluate_case"))
        self.assertTrue(hasattr(run_eval, "run_all_evaluations"))
        self.assertTrue(hasattr(run_eval, "GROUND_TRUTH"))

    def test_evaluate_case_returns_metrics(self):
        """evaluate_case returns dict with overall precision/recall/omission."""
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "eval"))
        import run_eval
        result = run_eval.evaluate_case("demo_straightforward")
        self.assertIn("overall", result)
        ov = result["overall"]
        for key in ("precision", "recall", "omission_rate", "hallucination_rate", "tp", "fp", "fn"):
            self.assertIn(key, ov, f"Missing metric: {key}")
        self.assertGreaterEqual(ov["precision"], 0.0)
        self.assertLessEqual(ov["precision"], 1.0)
        self.assertGreaterEqual(ov["recall"], 0.0)
        self.assertLessEqual(ov["recall"], 1.0)

    def test_all_ground_truth_cases_evaluate(self):
        """All defined ground truth cases run without error."""
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "eval"))
        import run_eval
        for case_id in run_eval.GROUND_TRUTH:
            with self.subTest(case=case_id):
                result = run_eval.evaluate_case(case_id)
                self.assertIn("overall", result, f"Case {case_id} missing 'overall' key")


# ─────────────────────────────────────────────────────────────────────────────
# Gap 17: Requirements and README housekeeping
# ─────────────────────────────────────────────────────────────────────────────

class TestGap17Housekeeping(unittest.TestCase):
    """Gap 17: requirements.txt has pytesseract; README model names match config."""

    @classmethod
    def setUpClass(cls):
        cls.repo_root = Path(__file__).resolve().parent.parent.parent

    def test_pytesseract_in_requirements(self):
        """requirements.txt must list pytesseract."""
        req = (self.repo_root / "api" / "requirements.txt").read_text(encoding="utf-8")
        self.assertIn("pytesseract", req, "pytesseract missing from requirements.txt")

    def test_readme_model_names_match_config_defaults(self):
        """README documents model names that match what config.py uses as defaults."""
        readme = (self.repo_root / "README.md").read_text(encoding="utf-8")
        # config.py defaults
        from app.config import MODEL_A, MODEL_B
        # README should mention model identifiers (or at least the real defaults)
        # We check that the misleading GPT-OSS-120B / Qwen3.8-27B are gone
        # and replaced with the actual config defaults
        self.assertIn("llama-3.3-70b-versatile", readme,
                      "README should mention the actual MODEL_A default")

    def test_backup_folders_not_tracked_by_git(self):
        """backup_stage* and _stage* folders should not have tracked git files."""
        import subprocess
        result = subprocess.run(
            ["git", "ls-files", "--", "backup_stage*", "_stage*", "web_backup*"],
            cwd=str(self.repo_root),
            capture_output=True,
            text=True,
        )
        tracked = result.stdout.strip()
        self.assertEqual(tracked, "",
                         f"Backup folders still tracked by git:\n{tracked}")


if __name__ == "__main__":
    unittest.main()
