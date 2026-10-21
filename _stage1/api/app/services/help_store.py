"""Help requests: a patient asks for help, the care team acknowledges, calls, escalates and resolves.

Pure standard library on purpose (no FastAPI / pydantic imports): the rules below are unit-tested in isolation,
and the routers in app/routers/help.py are thin wrappers around this module.

State machine
    open --acknowledge--> acknowledged --escalate--> escalated
      |                        |                         |
      +--------------------- resolve ---------------------+--> resolved   (terminal)
    "call" logs a phone call and acknowledges an open request (a nurse who is calling has obviously seen it).
    "note" adds a comment at any time, even after resolution.
Every change is appended to the request's timeline (who, what, when) so the history can be audited.
"""
import json
import os
import re
import secrets
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

ROOT = Path(__file__).resolve().parents[3]  # E:\recoverright (same convention as storage.py)

SEVERITIES = ("critical", "concern")
SOURCES = ("voice", "button", "test")
STATUSES = ("open", "acknowledged", "escalated", "resolved")
ACTIVE = ("open", "acknowledged", "escalated")
ACTIONS = ("acknowledge", "call", "escalate", "resolve", "note")
CALL_TARGETS = ("patient", "guardian")
RESOLUTIONS = {
    "helped": "Helped over the phone",
    "visit": "Visit or review arranged",
    "emergency": "Referred to emergency services",
    "false_alarm": "False alarm",
    "test": "Test alert",
}
# Target time to first acknowledgement. Shown to staff as a countdown; not enforced.
SLA_SECONDS = {"critical": 120, "concern": 600}
DEDUPE_WINDOW_S = 30

RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_STATUS_RANK = {"open": 0, "escalated": 1, "acknowledged": 2, "resolved": 3}
_SEV_RANK = {"critical": 0, "concern": 1}


class HelpError(Exception):
    """A rule was broken. `status` is the HTTP status the router should answer with."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def _clean(text: Optional[str], limit: int) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()[:limit]


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def valid_run_id(token: str) -> bool:
    """Run ids become folder names, so anything but letters, digits, _ and - is refused (no path tricks)."""
    return bool(RUN_ID_RE.match(token or ""))


class HelpStore:
    def __init__(self, base: Optional[Path] = None, clock: Optional[Callable[[], datetime]] = None) -> None:
        self._base = base
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ storage
    def dir(self) -> Path:
        d = self._base or Path(os.getenv("RR_HELP_DIR", ROOT / "data" / "help"))
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _path(self, help_id: str) -> Path:
        return self.dir() / f"{help_id}.json"

    def _write(self, item: dict) -> None:
        path = self._path(item["id"])
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(item, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)  # atomic: a reader never sees a half-written file

    def _read_all(self) -> list[dict]:
        out = []
        for p in self.dir().glob("hr_*.json"):
            try:
                out.append(json.loads(p.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue  # a damaged file must not take the whole inbox down
        return out

    def now(self) -> datetime:
        return self._clock()

    # ------------------------------------------------------------------ create
    def create(self, *, run_id: str, heard: str, severity: str, label: str = "", source: str = "voice",
               demo: bool = False, client_id: Optional[str] = None, patient_name: str = "",
               patient: Optional[dict] = None, client_time: str = "") -> tuple[dict, bool]:
        """Returns (item, created). `created` is False when this is a repeat of a request already on file."""
        if not valid_run_id(run_id):
            raise HelpError(422, "invalid token")
        heard = _clean(heard, 500)
        if not heard:
            raise HelpError(422, "nothing was heard")
        if severity not in SEVERITIES:
            raise HelpError(422, f"severity must be one of {SEVERITIES}")
        if source not in SOURCES:
            raise HelpError(422, f"source must be one of {SOURCES}")
        client_id = _clean(client_id, 64) or None
        with self._lock:
            existing = self._read_all()
            if client_id:  # the app retries a failed send: the same alert must never page the team twice
                dup = next((i for i in existing if i.get("client_id") == client_id), None)
                if dup:
                    return dup, False
            now = self.now()
            for i in existing:  # same person repeating the same words while the first request is still live
                if (i["run_id"] == run_id and i["status"] in ACTIVE and i["source"] == source
                        and _norm(i["heard"]) == _norm(heard)
                        and (now - (_parse(i["created_at"]) or now)).total_seconds() <= DEDUPE_WINDOW_S):
                    return i, False
            snap = None
            if patient:
                snap = {k: _clean(str(patient.get(k) or ""), 120) for k in ("name", "language", "phone", "guardian_name", "guardian_phone")}
            item = {
                "id": self._new_id(),
                "client_id": client_id,
                "run_id": run_id,
                "patient": snap,
                "patient_name": _clean((snap or {}).get("name") or patient_name, 120) or "Unknown patient",
                "heard": heard,
                "label": _clean(label, 100),
                "severity": severity,
                "source": source,
                "demo": bool(demo),
                "status": "open",
                "created_at": _iso(now),
                "client_time": _clean(client_time, 40),
                "sla_seconds": SLA_SECONDS[severity],
                "acknowledged_at": None, "acknowledged_by": None,
                "escalated_at": None, "escalated_by": None,
                "resolved_at": None, "resolved_by": None, "resolution": None, "resolution_label": None,
                "calls": 0,
                "timeline": [{"at": _iso(now), "actor": "patient", "action": "created",
                              "note": f"Heard: “{heard}”" if source != "button" else "Patient pressed the help button"}],
            }
            self._write(item)
            return item, True

    def _new_id(self) -> str:
        while True:
            hid = "hr_" + secrets.token_hex(4)
            if not self._path(hid).exists():
                return hid

    # ------------------------------------------------------------------ read
    def get(self, help_id: str) -> dict:
        if not re.match(r"^hr_[0-9a-f]{8}$", help_id or ""):
            raise HelpError(404, "help request not found")
        p = self._path(help_id)
        if not p.exists():
            raise HelpError(404, "help request not found")
        return json.loads(p.read_text(encoding="utf-8"))

    def list(self, status: str = "active", run_id: Optional[str] = None, include_test: bool = True, limit: int = 200) -> list[dict]:
        wanted = self._wanted_statuses(status)
        items = [i for i in self._read_all()
                 if i["status"] in wanted
                 and (run_id is None or i["run_id"] == run_id)
                 and (include_test or i["source"] != "test")]
        items.sort(key=self._sort_key)
        return items[:max(1, limit)]

    @staticmethod
    def _wanted_statuses(status: str) -> Iterable[str]:
        if status in ("all", "", None):
            return STATUSES
        if status == "active":
            return ACTIVE
        parts = [s.strip() for s in status.split(",") if s.strip()]
        bad = [s for s in parts if s not in STATUSES]
        if bad:
            raise HelpError(422, f"unknown status {bad[0]!r}")
        return parts

    @staticmethod
    def _sort_key(i: dict):
        """Most urgent first: unacknowledged critical, then the rest of the unacknowledged, oldest first.
        Resolved requests go last, newest resolved first."""
        if i["status"] == "resolved":
            return (3, 0, -(_parse(i.get("resolved_at")) or datetime.min.replace(tzinfo=timezone.utc)).timestamp())
        return (_STATUS_RANK[i["status"]], _SEV_RANK[i["severity"]], (_parse(i["created_at"]) or datetime.min.replace(tzinfo=timezone.utc)).timestamp())

    def summary(self, include_test: bool = True) -> dict:
        items = [i for i in self._read_all() if include_test or i["source"] != "test"]
        now = self.now()
        unacked = [i for i in items if i["status"] == "open"]
        acks = []
        for i in items:
            a, c = _parse(i.get("acknowledged_at")), _parse(i["created_at"])
            if a and c:
                acks.append((a - c).total_seconds())
        overdue = [i for i in unacked if (now - (_parse(i["created_at"]) or now)).total_seconds() > i["sla_seconds"]]
        oldest = min((i["created_at"] for i in unacked), default=None)
        return {
            "total": len(items),
            "open": sum(1 for i in items if i["status"] == "open"),
            "acknowledged": sum(1 for i in items if i["status"] == "acknowledged"),
            "escalated": sum(1 for i in items if i["status"] == "escalated"),
            "resolved": sum(1 for i in items if i["status"] == "resolved"),
            "unacked": len(unacked),
            "critical_unacked": sum(1 for i in unacked if i["severity"] == "critical"),
            "overdue": len(overdue),
            "oldest_unacked_at": oldest,
            "avg_ack_seconds": round(sum(acks) / len(acks), 1) if acks else None,
            "server_time": _iso(now),
        }

    def counts_by_run(self) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for i in self._read_all():
            c = out.setdefault(i["run_id"], {"active": 0, "total": 0, "critical_active": 0})
            c["total"] += 1
            if i["status"] in ACTIVE:
                c["active"] += 1
                if i["severity"] == "critical":
                    c["critical_active"] += 1
        return out

    # ------------------------------------------------------------------ act
    def act(self, help_id: str, action: str, actor: str = "Care team", note: Optional[str] = None,
            resolution: Optional[str] = None, target: Optional[str] = None) -> dict:
        if action not in ACTIONS:
            raise HelpError(422, f"action must be one of {ACTIONS}")
        actor = _clean(actor, 80) or "Care team"
        note = _clean(note, 1000) or None
        with self._lock:
            item = self.get(help_id)
            status = item["status"]
            now = _iso(self.now())

            def log(act: str, n: Optional[str] = None) -> None:
                item["timeline"].append({"at": now, "actor": actor, "action": act, "note": n})

            def mark_ack() -> None:
                item["acknowledged_at"], item["acknowledged_by"] = now, actor
                item["status"] = "acknowledged"

            if action == "note":
                if not note:
                    raise HelpError(422, "a note cannot be empty")
                log("note", note)
            elif status == "resolved":
                raise HelpError(409, "this request is already resolved")
            elif action == "acknowledge":
                if status != "open":
                    raise HelpError(409, f"this request is already {status}")
                mark_ack()
                log("acknowledged", note)
            elif action == "call":
                target = target or "patient"
                if target not in CALL_TARGETS:
                    raise HelpError(422, f"target must be one of {CALL_TARGETS}")
                if status == "open":
                    mark_ack()
                    log("acknowledged", "Acknowledged by starting a call")
                item["calls"] += 1
                log("call", f"Called the {target}" + (f": {note}" if note else ""))
            elif action == "escalate":
                if status == "escalated":
                    raise HelpError(409, "this request is already escalated")
                if status == "open":
                    mark_ack()
                item["status"] = "escalated"
                item["escalated_at"], item["escalated_by"] = now, actor
                log("escalated", note or "Escalated to the on-call clinician")
            elif action == "resolve":
                if resolution not in RESOLUTIONS:
                    raise HelpError(422, f"resolution must be one of {tuple(RESOLUTIONS)}")
                if status == "open":
                    mark_ack()
                item["status"] = "resolved"
                item["resolved_at"], item["resolved_by"] = now, actor
                item["resolution"], item["resolution_label"] = resolution, RESOLUTIONS[resolution]
                log("resolved", f"{RESOLUTIONS[resolution]}" + (f": {note}" if note else ""))
            self._write(item)
            return item


help_store = HelpStore()
