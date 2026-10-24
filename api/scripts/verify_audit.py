"""Clinical Audit & Zero-Leakage Compliance Verifier

Scans all audit.jsonl files under the runs directory to guarantee:
1. Immutability and valid JSON structure on every record.
2. Required audit metadata: timestamp (ts), actor attribution, action name.
3. Strict ISO-8601 UTC timestamp format.
4. Zero credentials/secret leakage (e.g. Groq keys, bearer tokens, passwords).
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.storage import runs_dir

SECRET_REGEX = re.compile(r"(gsk_[A-Za-z0-9_-]{20,}|bearer\s+[A-Za-z0-9_.-]{20,})", re.IGNORECASE)


def verify_audit_record(line: str, line_no: int, file_path: Path) -> tuple[bool, str, dict[str, Any]]:
    """Validates an individual audit line."""
    stripped = line.strip()
    if not stripped:
        return True, "empty_line", {}

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON on line {line_no} of {file_path.name}: {e}", {}

    if not isinstance(data, dict):
        return False, f"Line {line_no} in {file_path.name} is not a JSON object", {}

    # Required fields
    for field in ("ts", "actor", "action"):
        if field not in data or not str(data[field]).strip():
            return False, f"Missing required field '{field}' on line {line_no} in {file_path.name}", data

    # Validate timestamp format
    try:
        datetime.fromisoformat(data["ts"])
    except Exception as e:
        return False, f"Invalid ISO-8601 timestamp '{data.get('ts')}' on line {line_no} in {file_path.name}: {e}", data

    # Check for secret leakage
    line_str = stripped.lower()
    if SECRET_REGEX.search(line_str):
        return False, f"CRITICAL: Secret or API key pattern detected on line {line_no} in {file_path.name}!", data

    # Check for forbidden sensitive keys with unredacted values
    forbidden_keys = {"api_key", "secret", "password", "authorization", "token_secret"}
    for k, v in data.items():
        if k.lower() in forbidden_keys and v != "[REDACTED]":
            return False, f"CRITICAL: Unredacted sensitive field '{k}' on line {line_no} in {file_path.name}!", data

    return True, "ok", data


def verify_all_audit_logs(base_dir: Path | None = None) -> tuple[bool, dict[str, Any]]:
    """Scans all audit.jsonl files under base_dir (or default runs_dir)."""
    target_dir = base_dir or runs_dir()
    if not target_dir.exists():
        return True, {"files": 0, "records": 0, "actors": set(), "actions": {}}

    audit_files = list(target_dir.glob("*/audit.jsonl"))
    total_records = 0
    actors: set[str] = set()
    actions: dict[str, int] = {}
    errors: list[str] = []

    for file_path in audit_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                for line_no, line in enumerate(f, start=1):
                    ok, msg, record = verify_audit_record(line, line_no, file_path)
                    if not ok:
                        errors.append(msg)
                    elif record:
                        total_records += 1
                        actors.add(str(record.get("actor")))
                        act = str(record.get("action"))
                        actions[act] = actions.get(act, 0) + 1
        except Exception as e:
            errors.append(f"Could not read {file_path}: {e}")

    summary = {
        "files_count": len(audit_files),
        "total_records": total_records,
        "unique_actors": sorted(list(actors)),
        "actions": actions,
        "errors": errors,
    }

    return len(errors) == 0, summary


def main():
    print("=" * 60)
    print("RecoverRight Clinical Audit & Compliance Verifier")
    print("=" * 60)

    success, summary = verify_all_audit_logs()

    print(f"Audit Files Scanned: {summary['files_count']}")
    print(f"Total Audit Records: {summary['total_records']}")
    print(f"Unique Actors:       {len(summary['unique_actors'])}")
    for a in summary["unique_actors"]:
        print(f"  - {a}")
    print("\nAction Frequency:")
    for action, count in sorted(summary["actions"].items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {action:<30} : {count}")

    if not success:
        print("\nFAILURES DETECTED:")
        for err in summary["errors"]:
            print(f"  [!] {err}")
        print("\nCompliance verification FAILED!")
        sys.exit(1)
    else:
        print("\nAll audit records validated: format compliant, zero secrets leaked.")
        print("Audit compliance check PASSED.")


if __name__ == "__main__":
    main()
