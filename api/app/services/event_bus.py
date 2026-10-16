import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

from app.schemas.events import Event, Stage

RECORDINGS = Path(__file__).resolve().parents[3] / "data" / "recordings"


class EventBus:
    def __init__(self) -> None:
        self._history: dict[str, list[Event]] = defaultdict(list)
        self._subs: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def emit(self, run_id: str, stage: Stage, type_: str, payload: dict | None = None) -> Event:
        ev = Event(
            run_id=run_id,
            seq=len(self._history[run_id]) + 1,
            ts=datetime.now(timezone.utc),
            stage=stage,
            type=type_,
            payload=payload or {},
        )
        self._history[run_id].append(ev)
        RECORDINGS.mkdir(parents=True, exist_ok=True)
        # first event of a run in this process starts a fresh recording file
        mode = "w" if ev.seq == 1 else "a"
        with open(RECORDINGS / f"{run_id}.jsonl", mode, encoding="utf-8") as f:
            f.write(ev.model_dump_json() + "\n")
        for q in self._subs[run_id]:
            q.put_nowait(ev)
        return ev

    async def stream(self, run_id: str, after: int = 0) -> AsyncIterator[Event]:
        q: asyncio.Queue = asyncio.Queue()
        self._subs[run_id].append(q)
        try:
            last = after
            for ev in list(self._history[run_id]):
                if ev.seq > last:
                    last = ev.seq
                    yield ev
            while True:
                ev = await q.get()
                if ev.seq > last:
                    last = ev.seq
                    yield ev
        finally:
            self._subs[run_id].remove(q)


bus = EventBus()
