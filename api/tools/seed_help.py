"""Creates a few sample help requests so the care-team console has something to show in a demo.

    Set-Location E:\\recoverright\\api
    python -m tools.seed_help           # attach sample requests to your existing patients (safe to run twice)
    python -m tools.seed_help --clear   # remove only the requests this script created

Every request it makes is marked source="test" (the inbox has a 'Hide test alerts' switch) and has a client_id that
starts with "seed-", so it is never mistaken for a real patient request and never touches one.
"""
import json
import sys
from pathlib import Path
from typing import Optional

from app.services.help_store import HelpStore, _help_dir_default, help_store

SAMPLES = [
    ("critical", "I can't breathe", "trouble breathing"),
    ("concern", "I feel dizzy", "feeling dizzy"),
    ("concern", "I need help with my pain", "needing help"),
]


def _runs(runs_dir: Path) -> list[dict]:
    metas = []
    for p in sorted(runs_dir.glob("*/meta.json")):
        try:
            metas.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    metas.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return metas


def seed(runs_dir: Path, store: HelpStore) -> list[dict]:
    """One sample request per existing patient (newest first), up to the number of samples. Idempotent."""
    made = []
    for i, (meta, (sev, heard, label)) in enumerate(zip(_runs(runs_dir), SAMPLES), 1):
        item, _ = store.create(run_id=meta["run_id"], heard=heard, severity=sev, label=label, source="test",
                               client_id=f"seed-{i}", patient=meta.get("patient"))
        made.append(item)
    return made


def clear(store: HelpStore) -> int:
    n = 0
    for p in store.dir().glob("hr_*.json"):
        try:
            if str(json.loads(p.read_text(encoding="utf-8")).get("client_id") or "").startswith("seed-"):
                p.unlink()
                n += 1
        except (OSError, json.JSONDecodeError):
            continue
    return n


def main(argv: Optional[list[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if "--clear" in argv:
        print(f"Removed {clear(help_store)} sample request(s).")
        return 0
    runs_dir = _help_dir_default().parent / "runs"
    made = seed(runs_dir, help_store)
    if not made:
        print(f"No patients found in {runs_dir}. Upload a discharge document first, then run this again.")
        return 1
    for m in made:
        print(f"{m['severity']:<8} {m['patient_name']}: {m['heard']}")
    print("Open http://localhost:3000/staff/help to see them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
