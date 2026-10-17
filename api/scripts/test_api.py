"""End-to-end test of the API with a fake extractor (no model calls).  Run:  python -m scripts.test_api"""
import json
import os
import tempfile
import time

os.environ["RR_RUNS_DIR"] = tempfile.mkdtemp()
os.environ["RR_CACHE_DIR"] = tempfile.mkdtemp()

from fastapi.testclient import TestClient  # noqa: E402

import app.pipeline.orchestrator as orch  # noqa: E402
from app.main import app  # noqa: E402
from app.pipeline.review import ReviewError, apply_decision  # noqa: E402
from app.schemas.reconcile import ReconciledField  # noqa: E402
from app.schemas.review import ReviewField  # noqa: E402
from scripts.fixtures import SAMPLE, Fixtures  # noqa: E402

fx = Fixtures()


async def fake_extract(doc, run_id):
    return fx.plan_a(), fx.plan_b()


orch.extract_both = fake_extract
passed = 0


def check(name, cond):
    global passed
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        raise SystemExit(1)
    passed += 1


# --- rules that need no server ---
rej = ReviewField(field=ReconciledField(field_id="x:u1", category="medications", status="rejected", critical=True))
try:
    apply_decision([rej], "x:u1", "confirm")
    ok = False
except ReviewError:
    ok = True
check("cannot confirm a field that has no verified value", ok)

with TestClient(app) as c:
    check("health", c.get("/health").json() == {"status": "ok"})
    bad = c.post("/runs", files={"file": ("notes.txt", b"hello", "text/plain")})
    check("wrong file type is refused (415)", bad.status_code == 415)

    with open(SAMPLE, "rb") as f:
        r = c.post("/runs", files={"file": ("sample_knee.docx", f, "application/octet-stream")},
                   data={"patient_name": "Jane Example", "language": "hi", "use_cache": "false"})
    check("upload accepted", r.status_code == 200)
    rid = r.json()["run_id"]

    for _ in range(100):
        meta = c.get(f"/runs/{rid}").json()
        if meta["status"] in ("needs_review", "failed"):
            break
        time.sleep(0.1)
    check("pipeline finishes in needs_review", meta["status"] == "needs_review")
    check("counts recorded", meta["counts"] == {"agreed": 10, "review": 3, "conflict": 0, "rejected": 0})

    rv = c.get(f"/runs/{rid}/review").json()
    check("review returns blocks and fields", len(rv["blocks"]) == 23 and len(rv["fields"]) == 13)
    check("cannot approve yet", rv["can_approve"] is False and len(rv["blockers"]) > 0)
    early = c.post(f"/runs/{rid}/approve", json={"by": "nurse"})
    check("approve is refused while fields are undecided (409)", early.status_code == 409)

    # decide every blocker like a nurse would
    ids = {f["field"]["field_id"]: f["field"] for f in rv["fields"]}
    for b in rv["blockers"]:
        f = ids[b["field_id"]]
        if f["category"] == "contacts":
            act = {"action": "reject", "note": "fragment of the warning sentence"}
        elif f["category"] == "follow_ups" and "Wound check" in (f["quote"] or ""):
            act = {"action": "edit", "attrs": {"what": "Wound check", "when": "11 Nov 2026, 10:00", "where": "surgical clinic"}}
        elif f["category"] == "medications" and "Placebex" in (f["quote"] or ""):
            act = {"action": "edit", "attrs": {"name": "Placebex", "dose": "1 tablet", "frequency": "As needed",
                                                "duration": "Until review"}, "note": "dose confirmed with prescriber"}
        else:
            act = {"action": "confirm"}
        resp = c.patch(f"/runs/{rid}/fields/{b['field_id']}", json={**act, "by": "nurse"})
        check(f"decision saved for {b['field_id']}", resp.status_code == 200)

    rv = c.get(f"/runs/{rid}/review").json()
    check("no blockers left after the nurse's decisions", rv["blockers"] == [] and rv["can_approve"])

    bad_edit = c.patch(f"/runs/{rid}/fields/{rv['fields'][0]['field']['field_id']}", json={"action": "edit", "attrs": {}})
    check("an empty edit is refused (422)", bad_edit.status_code == 422)

    ap = c.post(f"/runs/{rid}/approve", json={"by": "nurse"})
    check("approval succeeds", ap.status_code == 200)
    plan = ap.json()
    cats = [i["category"] for i in plan["items"]]
    check("rejected contacts are not in the plan", "contacts" not in cats and len(plan["removed"]) == 1)
    placebex = next(i for i in plan["items"] if i["attrs"].get("name") == "Placebex")
    check("edited dose is in the plan with its original kept for audit",
          placebex["attrs"]["dose"] == "1 tablet" and placebex["edited_from"]["dose"] == "1-2 tablets")
    check("every item keeps its source quote", all(i["source"]["quote"] for i in plan["items"]))
    check("plan is locked afterwards (409)", c.patch(f"/runs/{rid}/fields/{plan['items'][0]['field_id']}",
                                                      json={"action": "confirm"}).status_code == 409)
    check("approved plan can be fetched", c.get(f"/runs/{rid}/plan").json()["approved_by"] == "nurse")

    log = c.get(f"/runs/{rid}/events/log").json()
    types = [e["type"] for e in log]
    check("events cover every stage", all(t in types for t in
          ("run.uploaded", "parse.done", "ground.a.done", "ground.b.done", "reconcile.done",
           "review.ready", "review.edit", "plan.approved")))
    check("event sequence numbers are 1..n", [e["seq"] for e in log] == list(range(1, len(log) + 1)))

    seen = 0
    with c.stream("GET", f"/runs/{rid}/events", params={"replay": "true", "speed": 1000}) as s:
        for line in s.iter_lines():
            if line.startswith("data:"):
                seen += 1
    check("replay streams the whole recording", seen == len(log))

    # second upload of the same file with caching on: first run fills the cache, second replays it
    def upload(use_cache):
        with open(SAMPLE, "rb") as f:
            rid2 = c.post("/runs", files={"file": ("sample_knee.docx", f, "application/octet-stream")},
                          data={"use_cache": use_cache}).json()["run_id"]
        for _ in range(100):
            m = c.get(f"/runs/{rid2}").json()
            if m["status"] in ("needs_review", "failed"):
                return rid2, m
            time.sleep(0.1)
        return rid2, m

    _, m1 = upload("true")
    rid3, m2 = upload("true")
    check("first cached-mode run calls the extractor, second reuses the cache", m1["cached"] is False and m2["cached"] is True)
    types3 = [e["type"] for e in c.get(f"/runs/{rid3}/events/log").json()]
    check("cached runs still emit extraction events for the theater",
          "extract.a.started" in types3 and "extract.b.done" in types3 and "extract.a.field" in types3)
    check("cached and fresh runs give identical review counts", m1["counts"] == m2["counts"] == meta["counts"])

    audit = (__import__("pathlib").Path(os.environ["RR_RUNS_DIR"]) / rid / "audit.jsonl").read_text().splitlines()
    check("audit trail records who decided what", any('"actor": "nurse"' in a and "field.edit" in a for a in audit))
    check("run list works, newest first", rid in [m["run_id"] for m in c.get("/runs").json()] and len(c.get("/runs").json()) == 3)

print(f"\nall {passed} checks passed")
