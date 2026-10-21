"""Test backend: stdlib HTTP server exposing the SAME routes as app/routers/*.py and calling the REAL Python core
(app.services.help_store / directory). Static files for the browser bundle, plus test-only controls under /__."""
import json, os, re, sys, tempfile, threading, time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, "/home/claude/p2/api")
from app.services.directory import patient_detail, patients_index, read_audit  # noqa: E402
from app.services.help_store import HelpError, HelpStore, RESOLUTIONS, valid_run_id  # noqa: E402

STATE = {"skew": 0, "down": False}
TMP = Path(tempfile.mkdtemp(prefix="rr_dev_"))
RUNS = TMP / "runs"; RUNS.mkdir()
store = HelpStore(TMP / "help", clock=lambda: datetime.now(timezone.utc) + timedelta(seconds=STATE["skew"]))

def iso(minutes_ago): return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
def meta(rid, name, status, mins, phone, gname="", gphone="", counts=None, approved=False, error=None, lang="en"):
    return {"run_id": rid, "filename": f"{rid.replace('run_', '')}_discharge.pdf", "created_at": iso(mins), "status": status,
            "patient": {"name": name, "language": lang, "phone": phone, "guardian_name": gname, "guardian_phone": gphone},
            "counts": counts, "error": error, "approved": approved, "approved_by": "Nurse Mehta" if approved else None}
def write(rid, name, obj, raw=None):
    d = RUNS / rid; d.mkdir(exist_ok=True)
    (d / name).write_text(raw if raw is not None else json.dumps(obj), encoding="utf-8")

def seed():
    write("run_anita", "meta.json", meta("run_anita", "Anita Singh", "needs_review", 22, "+919876543210", "Ravi Singh", "+919800000001", {"agreed": 9, "review": 1, "conflict": 1, "rejected": 0}, lang="hi"))
    write("run_priya", "meta.json", meta("run_priya", "Priya Sharma", "approved", 190, "+919811122233", counts={"agreed": 11, "review": 0, "conflict": 0, "rejected": 0}, approved=True))
    write("run_priya", "plan_v1.json", {"approved_at": iso(150), "removed": [], "items": [
        {"category": "medications", "field_id": "f1", "attrs": {"name": "Paracetamol", "dose": "500 mg", "frequency": "Every 6 hours", "duration": "5 days"}, "decision": "confirmed", "decided_by": "Nurse Mehta"},
        {"category": "medications", "field_id": "f2", "attrs": {"name": "Placebex", "dose": "1 tablet", "frequency": "As needed", "duration": None}, "decision": "edited", "decided_by": "Nurse Mehta"},
        {"category": "wound_care", "field_id": "f3", "attrs": {"instruction": "Keep the dressing clean and dry."}, "decision": "confirmed"},
        {"category": "follow_ups", "field_id": "f4", "attrs": {"what": "Physiotherapy review", "when": "in 2 weeks", "where": None}, "decision": "confirmed"}]})
    write("run_priya", "audit.jsonl", None, raw="\n".join(json.dumps(x) for x in [
        {"ts": iso(190), "actor": "system", "action": "run.created", "filename": "priya_discharge.pdf"},
        {"ts": iso(170), "actor": "Nurse Mehta", "action": "field.edit", "field_id": "f2"},
        {"ts": iso(150), "actor": "Nurse Mehta", "action": "plan.approved", "items": 4}]) + "\n{damaged line\n")
    write("run_vikram", "meta.json", meta("run_vikram", "Vikram Rao", "processing", 1, "+919822233344"))
    write("run_demoph", "meta.json", meta("run_demoph", "Demo Placeholder", "failed", 400, "+91 00000 00000", error="both readers failed: 429 rate limit"))
    blocks = [{"block_id": f"b{i}", "type": "paragraph", "page": 1, "text": t, "low_confidence": False, "table_id": None, "row_index": None, "cells": None} for i, t in enumerate(["Examplamol 500 mg every 6 hours", "Placebex 1-2 tablets as needed", "Wound check date to be confirmed"], 1)]
    def fld(i, cat, st, attrs, bid, issues):
        return {"field": {"field_id": f"f{i}", "category": cat, "status": st, "critical": st != "agreed", "proposed": attrs, "proposed_from": "A", "block_id": bid, "quote": blocks[int(bid[1:]) - 1]["text"], "units": [], "voters": ["A", "B"],
                "opinions": [{"voter": "A", "path": f"{cat}[0]", "attrs": attrs, "block_id": bid, "quote": "q", "units": [], "trusted": True, "ground_issues": []}], "issues": issues}, "decision": None}
    rv = {"run": meta("run_anita", "Anita Singh", "needs_review", 22, "+919876543210", "Ravi Singh", "+919800000001", {"agreed": 9, "review": 1, "conflict": 1, "rejected": 0}, lang="hi"), "blocks": blocks,
          "fields": [fld(1, "medications", "agreed", {"name": "Examplamol", "dose": "500 mg", "frequency": "Every 6 hours", "duration": "7 days"}, "b1", []),
                     fld(2, "medications", "review", {"name": "Placebex", "dose": "1-2 tablets", "frequency": "As needed", "duration": None}, "b2", ["Dose is a range"]),
                     fld(3, "follow_ups", "conflict", {"what": "Wound check", "when": None, "where": None}, "b3", ["Readers disagree"])],
          "blockers": [{"field_id": "f2", "category": "medications", "status": "review", "reason": "Dose is a range"}], "can_approve": False}
    write("run_anita", "review_view.json", rv)

def run_meta(rid): return json.loads((RUNS / rid / "meta.json").read_text(encoding="utf-8"))
def all_runs(): return sorted((json.loads(p.read_text(encoding="utf-8")) for p in RUNS.glob("*/meta.json")), key=lambda m: m["created_at"], reverse=True)

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def _send(self, code, obj=None, ctype="application/json", raw=None):
        body = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(code)
        for k, v in (("Content-Type", ctype), ("Content-Length", str(len(body))), ("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "*"), ("Access-Control-Allow-Methods", "*"), ("Cache-Control", "no-store")): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError: return None
    def do_OPTIONS(self): self._send(204, raw=b"")
    def _err(self, e): self._send(e.status, {"detail": e.message})
    def route(self, method):
        u = urlparse(self.path); p = u.path; q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if p.startswith("/__"):
            if p == "/__down": STATE["down"] = q.get("v") == "1"
            elif p == "/__skew": STATE["skew"] = int(q.get("s", 0))
            elif p == "/__reset":
                for f in (TMP / "help").glob("*.json"): f.unlink()
                STATE.update(skew=0, down=False)
            return self._send(200, {"ok": True, "state": STATE})
        if p in ("/staff.js", "/staff.css"):
            f = Path("/home/claude/h2") / p[1:]
            return self._send(200, raw=f.read_bytes(), ctype="text/css" if p.endswith("css") else "text/javascript") if f.exists() else self._send(404, {"detail": "nope"})
        if p == "/staff" or p.startswith("/staff/"):
            return self._send(200, raw=b'<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}</style><link rel=stylesheet href=/staff.css><div id=root></div><script>window.__API__=location.origin</script><script src=/staff.js></script>', ctype="text/html")
        if STATE["down"]: return self._send(503, {"detail": "down"})
        try:
            if p == "/runs" and method == "GET": return self._send(200, all_runs())
            m = re.match(r"^/runs/([\w-]+)(/review)?$", p)
            if m and method == "GET":
                rid = m.group(1)
                if not (RUNS / rid / "meta.json").exists(): return self._send(404, {"detail": "no such run"})
                if m.group(2):
                    f = RUNS / rid / "review_view.json"
                    return self._send(200, json.loads(f.read_text(encoding="utf-8"))) if f.exists() else self._send(409, {"detail": "not ready"})
                return self._send(200, run_meta(rid))
            if p == "/help" and method == "POST":
                b = self._body()
                if not isinstance(b, dict) or any(k not in b for k in ("token", "heard", "severity")): return self._send(422, {"detail": "missing fields"})
                meta_ = run_meta(b["token"]) if valid_run_id(b["token"]) and b["token"] != "demo" and (RUNS / b["token"] / "meta.json").exists() else None
                item, created = store.create(run_id=b["token"], heard=b["heard"], severity=b["severity"], label=b.get("label", ""), source=b.get("source", "voice"), demo=b.get("demo", False),
                                             client_id=b.get("client_id"), patient_name=b.get("patient_name", ""), patient=(meta_ or {}).get("patient"), client_time=b.get("client_time", ""))
                return self._send(201, {"id": item["id"], "status": item["status"], "duplicate": not created, "item": item})
            if p == "/help" and method == "GET":
                items = store.list(q.get("status", "active"), q.get("run_id"), q.get("include_test", "true") != "false", int(q.get("limit", 200)))
                return self._send(200, {"items": items, "summary": store.summary(q.get("include_test", "true") != "false"), "resolutions": RESOLUTIONS})
            if p == "/help/summary": return self._send(200, store.summary())
            m = re.match(r"^/help/([^/]+)(/action)?$", p)
            if m and method == "GET": return self._send(200, store.get(m.group(1)))
            if m and m.group(2) and method == "POST":
                b = self._body() or {}
                return self._send(200, store.act(m.group(1), b.get("action"), b.get("by", "Care team"), b.get("note"), b.get("resolution"), b.get("target")))
            if p == "/patients": return self._send(200, {"items": patients_index(all_runs(), store.counts_by_run())})
            m = re.match(r"^/patients/([^/]+)$", p)
            if m:
                rid = m.group(1)
                if not valid_run_id(rid) or not (RUNS / rid / "meta.json").exists(): return self._send(404, {"detail": "patient not found"})
                pf = RUNS / rid / "plan_v1.json"
                return self._send(200, patient_detail(run_meta(rid), json.loads(pf.read_text(encoding="utf-8")) if pf.exists() else None, read_audit(RUNS / rid / "audit.jsonl"), store.list("all", run_id=rid)))
        except HelpError as e: return self._err(e)
        return self._send(404, {"detail": "not found"})
    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")

seed()
if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4180
    print("dev server on", port, "data", TMP, flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
