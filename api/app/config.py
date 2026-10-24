import os
from pathlib import Path

ENV_FILE = next((p / ".env" for p in Path(__file__).resolve().parents if (p / ".env").exists()), Path("/app/.env"))


def _read_env(path: Path) -> dict:
    """Read KEY=VALUE lines directly, ignoring hidden characters."""
    values = {}
    if not path.is_file():
        return values
    text = path.read_text(encoding="utf-8-sig", errors="ignore")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


_values = _read_env(ENV_FILE)


def _get(name: str, default: str = "") -> str:
    return _values.get(name) or os.getenv(name) or default


GROQ_API_KEY = _get("GROQ_API_KEY")
MODEL_A = _get("MODEL_A", "llama-3.3-70b-versatile")
MODEL_B = _get("MODEL_B", "openai/gpt-oss-20b")
HAS_KEY = bool(GROQ_API_KEY)

if not HAS_KEY:
    print(f"[config] No GROQ_API_KEY found. File: {ENV_FILE} (exists: {ENV_FILE.is_file()}), "
          f"names parsed: {list(_values.keys())}")