"""Cryptographic Tamper-Evident Audit Chain Service (FDA 21 CFR Part 11 & ABDM Compliance).

Clinical Safety & Legal Accountability:
Hospital regulations mandate that clinical review decisions, medication alterations,
and patient distress logs cannot be modified, deleted, or backdated after the fact.
This service seals each audit entry into an immutable SHA-256 cryptographic hash chain:
  H_n = SHA-256(H_{n-1} + timestamp + actor + action + data)
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel

from app.services.storage import store

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


class CryptographicAuditEntry(BaseModel):
    index: int
    timestamp: str
    run_id: str
    actor: str
    action: str
    data: dict[str, Any]
    prev_hash: str
    entry_hash: str


def compute_entry_hash(prev_hash: str, timestamp: str, actor: str, action: str, data: dict[str, Any]) -> str:
    """Computes deterministic SHA-256 hash for an audit entry."""
    canonical_payload = json.dumps(
        {
            "prev_hash": prev_hash,
            "timestamp": timestamp,
            "actor": actor,
            "action": action,
            "data": data,
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def append_cryptographic_audit(run_id: str, actor: str, action: str, **details: Any) -> CryptographicAuditEntry:
    """Appends an event to the tamper-evident cryptographic audit chain for a run."""
    with store.lock(run_id):
        chain_file = "audit_chain.json"
        entries_raw: list[dict[str, Any]] = store.read(run_id, chain_file) if store.has(run_id, chain_file) else []
        
        index = len(entries_raw)
        prev_hash = entries_raw[-1]["entry_hash"] if index > 0 else GENESIS_HASH
        timestamp = datetime.now(timezone.utc).isoformat()
        
        entry_hash = compute_entry_hash(prev_hash, timestamp, actor, action, details)
        
        entry = CryptographicAuditEntry(
            index=index,
            timestamp=timestamp,
            run_id=run_id,
            actor=actor,
            action=action,
            data=details,
            prev_hash=prev_hash,
            entry_hash=entry_hash,
        )
        
        entries_raw.append(entry.model_dump())
        store.write(run_id, chain_file, entries_raw)
        return entry


def verify_audit_chain_integrity(run_id: str) -> dict[str, Any]:
    """Verifies that the entire audit trail has not been tampered with or modified."""
    if not store.exists(run_id):
        raise KeyError(f"Run '{run_id}' not found.")

    chain_file = "audit_chain.json"
    if not store.has(run_id, chain_file):
        return {
            "run_id": run_id,
            "total_entries": 0,
            "is_valid": True,
            "genesis_valid": True,
            "tampered_at_index": None,
            "message": "Audit chain empty or newly initialized.",
        }

    entries = store.read(run_id, chain_file)
    expected_prev = GENESIS_HASH

    for idx, e in enumerate(entries):
        # 1. Check prev_hash linkage
        if e.get("prev_hash") != expected_prev:
            return {
                "run_id": run_id,
                "total_entries": len(entries),
                "is_valid": False,
                "tampered_at_index": idx,
                "message": f"Linkage broken at index {idx}: expected prev_hash '{expected_prev}', found '{e.get('prev_hash')}'",
            }

        # 2. Re-compute hash of this entry
        recalculated = compute_entry_hash(
            e.get("prev_hash", ""),
            e.get("timestamp", ""),
            e.get("actor", ""),
            e.get("action", ""),
            e.get("data", {}),
        )
        if recalculated != e.get("entry_hash"):
            return {
                "run_id": run_id,
                "total_entries": len(entries),
                "is_valid": False,
                "tampered_at_index": idx,
                "message": f"Hash mismatch at index {idx}: entry contents were modified after signing.",
            }

        expected_prev = e["entry_hash"]

    return {
        "run_id": run_id,
        "total_entries": len(entries),
        "is_valid": True,
        "latest_hash": expected_prev,
        "genesis_valid": True,
        "message": "Cryptographic audit chain intact. Zero tampering detected.",
    }
