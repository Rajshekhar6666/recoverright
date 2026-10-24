"""Tiny file-based store: one folder per run under data/runs. Zero infrastructure, easy to inspect.

Supports versioned plans (plan_v1.json, plan_v2.json), patient token resolution,
task tracking, medication dose logs, and thread-safe atomic file writes.
"""
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]


def _safe_data_root() -> Path:
    """Return the repo/data root safely in both local dev and Docker.
    In Docker: __file__ = /app/app/services/storage.py → parents[3] = '/' (wrong).
    RR_RUNS_DIR is always set in Docker, so that path takes priority.
    """
    rr = os.getenv("RR_RUNS_DIR")
    if rr:
        return Path(rr).parent   # .../data/runs → .../data
    if ROOT.exists() and ROOT != Path("/"):
        return ROOT / "data"
    return Path("/app/data")


def runs_dir() -> Path:
    rr = os.getenv("RR_RUNS_DIR")
    if rr:
        return Path(rr)
    return _safe_data_root() / "runs"


def token_index_path() -> Path:
    return runs_dir().parent / "patient_tokens.json"


def caregiver_token_index_path() -> Path:
    return runs_dir().parent / "caregiver_tokens.json"


def _dump(obj: Any):
    if isinstance(obj, BaseModel):
        return obj.model_dump(mode="json")
    if isinstance(obj, list):
        return [_dump(o) for o in obj]
    if isinstance(obj, dict):
        return {k: _dump(v) for k, v in obj.items()}
    return obj


SENSITIVE_KEY_PATTERNS = {"api_key", "secret", "password", "authorization", "bearer", "token_secret", "private_key"}


def scrub_sensitive_data(obj: Any) -> Any:
    """Recursively scrub sensitive keys and token patterns from audit and log payloads."""
    if isinstance(obj, dict):
        scrubbed = {}
        for k, v in obj.items():
            k_lower = str(k).lower()
            if any(p in k_lower for p in SENSITIVE_KEY_PATTERNS):
                scrubbed[k] = "[REDACTED]"
            else:
                scrubbed[k] = scrub_sensitive_data(v)
        return scrubbed
    elif isinstance(obj, (list, tuple, set)):
        return [scrub_sensitive_data(item) for item in obj]
    elif isinstance(obj, str):
        if obj.startswith("gsk_") or "bearer " in obj.lower():
            return "[REDACTED]"
        return obj
    return obj


class RunStore:
    def __init__(self) -> None:
        self._locks: dict[str, threading.RLock] = {}
        self._global_lock = threading.RLock()

    def lock(self, run_id: str) -> threading.RLock:
        return self._locks.setdefault(run_id, threading.RLock())

    def dir(self, run_id: str) -> Path:
        return runs_dir() / run_id

    def exists(self, run_id: str) -> bool:
        return (self.dir(run_id) / "meta.json").exists()

    def write(self, run_id: str, name: str, obj: Any) -> None:
        d = self.dir(run_id)
        d.mkdir(parents=True, exist_ok=True)
        with self.lock(run_id):
            tmp = (d / f"{name}.tmp")
            tmp.write_text(json.dumps(_dump(obj), indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, d / name)

    def read(self, run_id: str, name: str) -> Any:
        return json.loads((self.dir(run_id) / name).read_text(encoding="utf-8"))

    def has(self, run_id: str, name: str) -> bool:
        return (self.dir(run_id) / name).exists()

    def update_meta(self, run_id: str, **changes) -> dict:
        with self.lock(run_id):
            meta = self.read(run_id, "meta.json")
            meta.update(changes)
            self.write(run_id, "meta.json", meta)
            return meta

    def audit(self, run_id: str, actor: str, action: str, **detail) -> None:
        clean_detail = scrub_sensitive_data(detail)
        line = json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "actor": actor,
                           "action": action, **clean_detail}, ensure_ascii=False)
        with self.lock(run_id):
            with open(self.dir(run_id) / "audit.jsonl", "a", encoding="utf-8") as f:
                f.write(line + "\n")

    def list_runs(self) -> list[dict]:
        base = runs_dir()
        if not base.exists():
            return []
        metas = []
        for p in base.glob("*/meta.json"):
            try:
                m = json.loads(p.read_text(encoding="utf-8"))
                if not isinstance(m, dict):
                    continue
                if "run_id" not in m:
                    m["run_id"] = p.parent.name
                if "status" not in m or not m["status"]:
                    m["status"] = "approved" if m.get("approved") else "needs_review"
                if "patient" not in m or not isinstance(m["patient"], dict):
                    m["patient"] = {"name": "Patient", "language": "en"}
                else:
                    m["patient"].setdefault("name", "Patient")
                    m["patient"].setdefault("language", "en")
                if "filename" not in m:
                    m["filename"] = m.get("stored_name") or "Discharge Document"
                if "created_at" not in m:
                    m["created_at"] = ""
                metas.append(m)
            except (OSError, json.JSONDecodeError):
                continue
        return sorted(metas, key=lambda m: m.get("created_at", ""), reverse=True)

    # -------------------------------------------------- Patient Token Mapping
    def generate_patient_slug(self, name: str) -> str:
        """Generates a clean, unique URL slug for a patient name (e.g. 'Neha Verma' -> 'neha-verma')."""
        import re
        base_slug = re.sub(r"[^a-z0-9]+", "-", (name or "patient").lower()).strip("-")
        if not base_slug:
            base_slug = "patient"

        existing = set()
        p = token_index_path()
        if p.exists():
            try:
                tokens = json.loads(p.read_text(encoding="utf-8"))
                for k in tokens.keys():
                    if not k.startswith("pat_") and not k.startswith("run_"):
                        existing.add(k.replace("demo/", ""))
            except (OSError, json.JSONDecodeError):
                pass

        candidate = base_slug
        counter = 2
        while candidate in existing:
            candidate = f"{base_slug}-{counter}"
            counter += 1
        return candidate

    def register_patient_slug(self, slug: str, run_id: str) -> None:
        """Registers a patient slug and demo route prefix in token index."""
        with self._global_lock:
            p = token_index_path()
            tokens = {}
            if p.exists():
                try:
                    tokens = json.loads(p.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    tokens = {}
            tokens[slug] = run_id
            tokens[f"demo/{slug}"] = run_id
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(tokens, indent=2), encoding="utf-8")

    def register_patient_token(self, token: str, run_id: str) -> None:
        """Maps a secure patient_token to its run_id."""
        with self._global_lock:
            p = token_index_path()
            tokens = {}
            if p.exists():
                try:
                    tokens = json.loads(p.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    tokens = {}
            tokens[token] = run_id
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(tokens, indent=2), encoding="utf-8")

    def resolve_run_id(self, token_or_run_id: str) -> Optional[str]:
        """Resolves a patient token, slug, or run_id to a valid run_id.

        Handles:
        - Secure patient tokens (pat_xxx)
        - URL slugs (david-thomas) — case-insensitive
        - /p/demo/slug or demo/slug prefixed paths
        - Direct run_ids (run_xxx)
        """
        if not token_or_run_id:
            return None
        # Clean prefix if /p/demo/... or demo/... was passed
        token_or_run_id = token_or_run_id.strip("/")
        if token_or_run_id.startswith("p/demo/"):
            token_or_run_id = token_or_run_id[7:]
        elif token_or_run_id.startswith("p/"):
            token_or_run_id = token_or_run_id[2:]
        elif token_or_run_id.startswith("demo/"):
            token_or_run_id = token_or_run_id[5:]

        # Check direct run_id (exact, case-sensitive — run_ids are always lowercase hex)
        if self.exists(token_or_run_id):
            return token_or_run_id

        # Check index — first exact, then lowercase (slugs are lowercase, URLs may not be)
        p = token_index_path()
        if p.exists():
            try:
                tokens = json.loads(p.read_text(encoding="utf-8"))
                # Exact match
                if token_or_run_id in tokens and self.exists(tokens[token_or_run_id]):
                    return tokens[token_or_run_id]
                if f"demo/{token_or_run_id}" in tokens and self.exists(tokens[f"demo/{token_or_run_id}"]):
                    return tokens[f"demo/{token_or_run_id}"]
                # Case-insensitive slug fallback (handles David-Thomas -> david-thomas)
                lower = token_or_run_id.lower()
                if lower != token_or_run_id:
                    if lower in tokens and self.exists(tokens[lower]):
                        return tokens[lower]
                    if f"demo/{lower}" in tokens and self.exists(tokens[f"demo/{lower}"]):
                        return tokens[f"demo/{lower}"]
            except (OSError, json.JSONDecodeError):
                pass

        # Fallback: scan runs if not in index (also case-insensitive slug compare)
        lower = token_or_run_id.lower()
        base = runs_dir()
        if base.exists():
            for meta_path in base.glob("*/meta.json"):
                try:
                    m = json.loads(meta_path.read_text(encoding="utf-8"))
                    pt = m.get("patient_token") or m.get("patient", {}).get("patient_token")
                    slug = m.get("patient_slug") or m.get("patient", {}).get("patient_slug")
                    if pt == token_or_run_id or (slug and slug.lower() == lower):
                        rid = m.get("run_id")
                        if rid:
                            self.register_patient_token(token_or_run_id, rid)
                            return rid
                except (OSError, json.JSONDecodeError):
                    continue
        return None

    def register_caregiver_token(self, token: str, run_id: str) -> None:
        """Maps a secure caregiver_token to its run_id."""
        with self._global_lock:
            p = caregiver_token_index_path()
            tokens = {}
            if p.exists():
                try:
                    tokens = json.loads(p.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    tokens = {}
            tokens[token] = run_id
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(tokens, indent=2), encoding="utf-8")

    def resolve_caregiver_run_id(self, token: str) -> Optional[str]:
        """Resolves a caregiver token to run_id."""
        if not token:
            return None
        # Check direct index
        p = caregiver_token_index_path()
        if p.exists():
            try:
                tokens = json.loads(p.read_text(encoding="utf-8"))
                if token in tokens and self.exists(tokens[token]):
                    return tokens[token]
            except (OSError, json.JSONDecodeError):
                pass
        # Check if format is cg_<run_id> or cg_<case_id>
        if token.startswith("cg_"):
            candidate = token[3:]
            if self.exists(candidate):
                return candidate
            if self.exists(f"run_{candidate}"):
                return f"run_{candidate}"
        # Fallback: scan runs for caregiver token in meta
        base = runs_dir()
        if base.exists():
            for meta_path in base.glob("*/meta.json"):
                try:
                    m = json.loads(meta_path.read_text(encoding="utf-8"))
                    patient = m.get("patient") or {}
                    cgs = patient.get("caregivers") or []
                    for cg in cgs:
                        if cg.get("token") == token:
                            rid = m.get("run_id")
                            if rid:
                                self.register_caregiver_token(token, rid)
                                return rid
                except (OSError, json.JSONDecodeError):
                    continue
        return None

    # -------------------------------------------------- Versioned Plans
    def save_plan_version(self, run_id: str, plan: dict, version: int = 1) -> None:
        """Saves a specific version of an approved plan."""
        with self.lock(run_id):
            self.write(run_id, f"plan_v{version}.json", plan)
            # Maintain plan_v1.json as the baseline/primary artifact for backward compatibility
            if version == 1 or not self.has(run_id, "plan_v1.json"):
                self.write(run_id, "plan_v1.json", plan)
            # Record in meta
            meta = self.read(run_id, "meta.json") if self.has(run_id, "meta.json") else {}
            history = meta.get("plan_versions", [])
            history.append({
                "version": version,
                "approved_by": plan.get("approved_by", "staff"),
                "approved_at": plan.get("approved_at", datetime.now(timezone.utc).isoformat()),
                "items_count": len(plan.get("items", [])),
                "note": plan.get("approval_note"),
            })
            meta["current_version"] = version
            meta["plan_versions"] = history
            meta["approved"] = True
            meta["approved_by"] = plan.get("approved_by", "staff")
            meta["status"] = "approved"
            self.write(run_id, "meta.json", meta)

    def get_plan_version(self, run_id: str, version: Optional[int] = None) -> Optional[dict]:
        """Gets a specific or latest version of the approved plan."""
        if not self.exists(run_id):
            return None
        if version is not None:
            filename = f"plan_v{version}.json"
            if self.has(run_id, filename):
                return self.read(run_id, filename)
            return None
        # Latest or current version
        meta = self.read(run_id, "meta.json")
        curr = meta.get("current_version")
        if curr and self.has(run_id, f"plan_v{curr}.json"):
            return self.read(run_id, f"plan_v{curr}.json")
        if self.has(run_id, "plan_v1.json"):
            return self.read(run_id, "plan_v1.json")
        return None

    def list_plan_versions(self, run_id: str) -> list[int]:
        """Lists available plan version integers for this run."""
        d = self.dir(run_id)
        if not d.exists():
            return []
        versions = []
        import re
        for p in d.glob("plan_v*.json"):
            m = re.match(r"^plan_v(\d+)\.json$", p.name)
            if m:
                versions.append(int(m.group(1)))
        return sorted(set(versions))

    # -------------------------------------------------- Tasks & Doses Persistence
    def save_tasks(self, run_id: str, tasks: list[Any]) -> None:
        self.write(run_id, "tasks.json", tasks)

    def get_tasks(self, run_id: str) -> list[dict]:
        if self.has(run_id, "tasks.json"):
            return self.read(run_id, "tasks.json")
        return []

    def update_task_status(self, run_id: str, task_id: str, status: str,
                           completed_by: Optional[str] = None, notes: Optional[str] = None,
                           snooze_until: Optional[str] = None) -> Optional[dict]:
        with self.lock(run_id):
            tasks = self.get_tasks(run_id)
            updated = None
            for t in tasks:
                if t.get("task_id") == task_id:
                    t["status"] = status
                    if status == "completed":
                        t["completed_at"] = datetime.now(timezone.utc).isoformat()
                        t["completed_by"] = completed_by or "patient"
                    elif status == "pending":
                        t.pop("completed_at", None)
                        t.pop("completed_by", None)
                    if snooze_until:
                        t["snooze_until"] = snooze_until
                    if notes:
                        t["notes"] = notes
                    updated = t
                    break
            if updated:
                self.save_tasks(run_id, tasks)
                self.audit(run_id, completed_by or "patient", f"task.{status}", task_id=task_id, notes=notes)
            return updated

    def save_dose_records(self, run_id: str, doses: list[Any]) -> None:
        self.write(run_id, "doses.json", doses)

    def get_dose_records(self, run_id: str) -> list[dict]:
        if self.has(run_id, "doses.json"):
            return self.read(run_id, "doses.json")
        return []

    def save_reminders(self, run_id: str, reminders: list[Any]) -> None:
        self.write(run_id, "reminders.json", reminders)

    def get_reminders(self, run_id: str) -> list[dict]:
        if self.has(run_id, "reminders.json"):
            return self.read(run_id, "reminders.json")
        return []

    def record_dose_action(self, run_id: str, med_or_dose_id: str, reported_taken: bool = True,
                           via: str = "app_button", note: Optional[str] = None) -> dict:
        """Records patient-reported medication ingestion with audit distinction."""
        with self.lock(run_id):
            doses = self.get_dose_records(run_id)
            record = next((d for d in doses if d.get("dose_id") == med_or_dose_id or d.get("medication_id") == med_or_dose_id), None)
            now_iso = datetime.now(timezone.utc).isoformat()
            if not record:
                record = {
                    "dose_id": f"dose_{med_or_dose_id}",
                    "run_id": run_id,
                    "medication_id": med_or_dose_id,
                    "medication_name": med_or_dose_id,
                    "acknowledged": True,
                    "acknowledged_at": now_iso,
                    "reported_taken": reported_taken,
                    "reported_taken_at": now_iso if reported_taken else None,
                    "reported_via": via,
                    "notes": note,
                }
                doses.append(record)
            else:
                record["reported_taken"] = reported_taken
                if reported_taken:
                    record["reported_taken_at"] = now_iso
                record["reported_via"] = via
                if note:
                    record["notes"] = note
            self.save_dose_records(run_id, doses)
            self.audit(run_id, "patient", "medication.reported_taken" if reported_taken else "medication.skipped",
                       med_id=med_or_dose_id, via=via, note=note)
            return record

    def record_dose_ack(self, run_id: str, med_or_dose_id: str, acknowledged: bool = True,
                        via: str = "app_button") -> dict:
        """Records reminder acknowledgement (seeing/hearing reminder) distinct from taking dose."""
        with self.lock(run_id):
            doses = self.get_dose_records(run_id)
            record = next((d for d in doses if d.get("dose_id") == med_or_dose_id or d.get("medication_id") == med_or_dose_id), None)
            now_iso = datetime.now(timezone.utc).isoformat()
            if not record:
                record = {
                    "dose_id": f"dose_{med_or_dose_id}",
                    "run_id": run_id,
                    "medication_id": med_or_dose_id,
                    "medication_name": med_or_dose_id,
                    "acknowledged": acknowledged,
                    "acknowledged_at": now_iso if acknowledged else None,
                    "reported_taken": False,
                    "reported_taken_at": None,
                    "reported_via": via,
                }
                doses.append(record)
            else:
                record["acknowledged"] = acknowledged
                if acknowledged:
                    record["acknowledged_at"] = now_iso
            self.save_dose_records(run_id, doses)
            self.audit(run_id, "patient", "medication.reminder_ack", med_id=med_or_dose_id, via=via)
            return record

    def save_notification(self, run_id: str, notification: dict) -> None:
        with self.lock(run_id):
            notifs = self.get_notifications(run_id)
            notifs.append(notification)
            self.write(run_id, "notifications.json", notifs)

    def get_notifications(self, run_id: str) -> list[dict]:
        if self.has(run_id, "notifications.json"):
            try:
                return self.read(run_id, "notifications.json")
            except (OSError, json.JSONDecodeError):
                return []
        return []

    def save_call_record(self, run_id: str, record: dict) -> None:
        with self.lock(run_id):
            calls = self.get_call_history(run_id)
            calls.append(record)
            self.write(run_id, "call_history.json", calls)
            self.audit(
                run_id,
                record.get("caller_role", "staff"),
                f"call.{record.get('status', 'ended')}",
                call_id=record.get("call_id"),
                duration_seconds=record.get("duration_seconds", 0),
                caller_name=record.get("caller_name"),
            )

    def get_call_history(self, run_id: str) -> list[dict]:
        if self.has(run_id, "call_history.json"):
            try:
                return self.read(run_id, "call_history.json")
            except (OSError, json.JSONDecodeError):
                return []
        return []


store = RunStore()
