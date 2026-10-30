"""Router handlers are plain functions. FastAPI and pydantic are not installed in the sandbox this was written in,
so minimal stand-ins are injected: this checks MY wiring (status codes, shapes, token safety), NOT a real FastAPI server."""
import importlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))

_ORIGINAL_MODULES = {}


def install_stubs(runs_dir: Path):
    global _ORIGINAL_MODULES
    for k in ("fastapi", "pydantic", "app.services.storage", "app.routers.help", "app.routers.patients"):
        if k in sys.modules and k not in _ORIGINAL_MODULES:
            _ORIGINAL_MODULES[k] = sys.modules[k]
    fa = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code, detail=None):
            self.status_code, self.detail = status_code, detail

    class APIRouter:
        def __init__(self, **kw): pass
        def get(self, *a, **k): return lambda f: f
        def post(self, *a, **k): return lambda f: f
        def put(self, *a, **k): return lambda f: f
        def delete(self, *a, **k): return lambda f: f

    fa.HTTPException, fa.APIRouter, fa.Query = HTTPException, APIRouter, (lambda default=None, **k: default)
    fa.File = fa.Form = (lambda *a, **k: None)
    fa.UploadFile = object
    pd = types.ModuleType("pydantic")

    class BaseModel:
        def __init__(self, **kw):
            ann = {}
            for c in reversed(type(self).__mro__):
                ann.update(getattr(c, "__annotations__", {}))
            for k in ann:
                if k in kw: setattr(self, k, kw[k])
                elif hasattr(type(self), k): setattr(self, k, getattr(type(self), k))
                else: raise TypeError(f"missing {k}")

        def model_dump_json(self):
            return json.dumps(getattr(self, "__dict__", {}), default=str)

        def model_dump(self, mode="python"):
            return getattr(self, "__dict__", {})

    pd.BaseModel = BaseModel
    pd.Field = lambda default=None, default_factory=None, **k: default if default is not None else (default_factory() if default_factory else None)
    st = types.ModuleType("app.services.storage")

    class FakeStore:
        def dir(self, rid): return runs_dir / rid
        def exists(self, rid): return (runs_dir / rid / "meta.json").exists()
        def has(self, rid, name): return (runs_dir / rid / name).exists()
        def read(self, rid, name): return json.loads((runs_dir / rid / name).read_text(encoding="utf-8"))
        def list_runs(self): return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(runs_dir.glob("*/meta.json"))]
        def resolve_run_id(self, rid): return rid if self.exists(rid) else None
        def audit(self, *a, **k): pass

    st.store = FakeStore()
    sys.modules.update({"fastapi": fa, "pydantic": pd, "app.services.storage": st})
    for m in ("app.routers.help", "app.routers.patients"):
        sys.modules.pop(m, None)


class TestRouters(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.runs = base / "runs"
        (self.runs / "run_a").mkdir(parents=True)
        (self.runs / "run_a" / "meta.json").write_text(json.dumps({"run_id": "run_a", "filename": "a.pdf", "created_at": "2026-10-19T10:00:00+00:00", "status": "approved", "approved": True,
            "patient": {"name": "Anita Singh", "language": "hi", "phone": "+919876543210", "guardian_name": "Ravi", "guardian_phone": "+919800000001"}}), encoding="utf-8")
        (self.runs / "run_a" / "plan_v1.json").write_text(json.dumps({"items": [{"category": "medications", "field_id": "f1", "attrs": {"name": "X", "dose": "5 mg"}}], "approved_at": "t"}), encoding="utf-8")
        (self.runs / "run_a" / "audit.jsonl").write_text('{"action":"run.created","ts":"1","filename":"a.pdf"}\n', encoding="utf-8")
        install_stubs(self.runs)
        hs = importlib.import_module("app.services.help_store")
        from pathlib import Path as P
        hs.help_store._base = base / "help"
        self.help = importlib.import_module("app.routers.help")
        self.patients = importlib.import_module("app.routers.patients")
        self.HTTPException = sys.modules["fastapi"].HTTPException

    def tearDown(self):
        self.tmp.cleanup()

    def body(self, **kw):
        d = dict(token="run_a", heard="I can't breathe", severity="critical", label="trouble breathing", source="voice")
        d.update(kw)
        return self.help.HelpIn(**d)

    def status_of(self, fn, *a):
        with self.assertRaises(self.HTTPException) as cm:
            fn(*a)
        return cm.exception.status_code

    def test_create_attaches_the_patient_from_the_run(self):
        r = self.help.create_help(self.body())
        self.assertEqual((r["status"], r["duplicate"]), ("open", False))
        self.assertEqual(r["item"]["patient"]["guardian_phone"], "+919800000001")
        self.assertEqual(r["item"]["patient_name"], "Anita Singh")

    def test_repeat_with_same_client_id_is_flagged_duplicate_not_created_twice(self):
        a = self.help.create_help(self.body(client_id="k1"))
        b = self.help.create_help(self.body(client_id="k1"))
        self.assertEqual((b["id"], b["duplicate"]), (a["id"], True))
        self.assertEqual(len(self.help.list_help("all", True, None, 200)["items"]), 1)

    def test_demo_and_unknown_runs_are_accepted_without_a_patient(self):
        self.assertIsNone(self.help.create_help(self.body(token="demo", patient_name="Priya"))["item"]["patient"])
        self.assertIsNone(self.help.create_help(self.body(token="run_gone", heard="help"))["item"]["patient"])

    def test_bad_tokens_are_refused_and_never_touch_the_file_store(self):
        for bad in ("../run_a", "run_a/../../x", "a b"):
            self.assertEqual(self.status_of(self.help.create_help, self.body(token=bad)), 422, bad)

    def test_validation_errors_become_422_and_missing_ids_404(self):
        self.assertEqual(self.status_of(self.help.create_help, self.body(heard="  ")), 422)
        self.assertEqual(self.status_of(self.help.list_help, "nonsense", True, None, 10), 422)
        self.assertEqual(self.status_of(self.help.get_help, "hr_00000000"), 404)

    def test_full_workflow_over_the_handlers(self):
        hid = self.help.create_help(self.body())["id"]
        act = lambda **kw: self.help.help_action(hid, self.help.ActionIn(**kw))
        self.assertEqual(act(action="acknowledge", by="Nurse Mehta")["status"], "acknowledged")
        self.assertEqual(self.status_of(self.help.help_action, hid, self.help.ActionIn(action="acknowledge")), 409)
        self.assertEqual(act(action="call", target="patient")["calls"], 1)
        self.assertEqual(self.status_of(self.help.help_action, hid, self.help.ActionIn(action="resolve")), 422)
        self.assertEqual(act(action="resolve", resolution="helped", note="settled")["status"], "resolved")
        listing = self.help.list_help("active", True, None, 200)
        self.assertEqual(listing["items"], [])
        self.assertEqual(listing["summary"]["resolved"], 1)
        self.assertIn("helped", listing["resolutions"])

    def test_patients_list_and_detail(self):
        self.help.create_help(self.body())
        lst = self.patients.list_patients()["items"]
        self.assertEqual((lst[0]["id"], lst[0]["help_active"], lst[0]["help_critical_active"]), ("run_a", 1, 1))
        d = self.patients.get_patient("run_a")
        self.assertEqual(d["plan"][0]["items"][0]["summary"], "X · 5 mg")
        self.assertEqual(d["activity"][0]["text"], "Document uploaded: a.pdf")
        self.assertEqual(len(d["help"]), 1)
        self.assertEqual(self.status_of(self.patients.get_patient, "nope"), 404)
        self.assertEqual(self.status_of(self.patients.get_patient, "../run_a"), 404)
        json.dumps(d)

    @classmethod
    def tearDownClass(cls):
        global _ORIGINAL_MODULES
        for k, v in _ORIGINAL_MODULES.items():
            sys.modules[k] = v


if __name__ == "__main__":
    unittest.main()
