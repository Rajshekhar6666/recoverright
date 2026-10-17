"""Tiny file-based store: one folder per run under data/runs. Zero infrastructure, easy to inspect."""
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]


def runs_dir() -> Path:
    return Path(os.getenv("RR_RUNS_DIR", ROOT / "data" / "runs"))


def _dump(obj: Any):
    if isinstance(obj, BaseModel):
        return obj.model_dump(mode="json")
    if isinstance(obj, list):
        return [_dump(o) for o in obj]
    if isinstance(obj, dict):
        return {k: _dump(v) for k, v in obj.items()}
    return obj


class RunStore:
    def __init__(self) -> None:
        self._locks: dict[str, threading.RLock] = {}

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
            (d / name).write_text(json.dumps(_dump(obj), indent=2, ensure_ascii=False), encoding="utf-8")

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
        line = json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "actor": actor,
                           "action": action, **detail}, ensure_ascii=False)
        with self.lock(run_id):
            with open(self.dir(run_id) / "audit.jsonl", "a", encoding="utf-8") as f:
                f.write(line + "\n")

    def list_runs(self) -> list[dict]:
        base = runs_dir()
        if not base.exists():
            return []
        metas = [json.loads(p.read_text(encoding="utf-8")) for p in base.glob("*/meta.json")]
        return sorted(metas, key=lambda m: m.get("created_at", ""), reverse=True)


store = RunStore()
