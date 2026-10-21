"""
REFERENCE ONLY, NOT TESTED. I could not see your API code and FastAPI was not available where this was written.
It documents the contract the patient app's help alert expects, so the backend can implement it.

The web app (web/lib/voice/help.ts) POSTs JSON to  {API}{NEXT_PUBLIC_HELP_PATH, default "/help"}
and says "Your care team was alerted" ONLY if the response status is 2xx. Anything else is shown to the
patient as "Help has NOT been sent".

Adapt names and storage to your app. Anything that shows these to a nurse (e.g. your /staff/help page) is a
separate piece of work: the staff console was deliberately not modified.
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
HELP_REQUESTS: list[dict] = []  # replace with your real storage


class HelpPayload(BaseModel):
    token: str                                   # the patient link token (run id)
    patient_name: str = ""
    heard: str                                   # what was said, or "I pressed the help button"
    severity: Literal["critical", "concern"]
    label: str = ""                              # e.g. "trouble breathing"
    source: Literal["voice", "button", "test"] = "voice"   # staff can filter out "test"
    demo: bool = False                           # True for the /p/demo plan
    client_time: str = ""


@router.post("/help", status_code=201)
def create_help_request(p: HelpPayload):
    item = {**p.model_dump(), "id": len(HELP_REQUESTS) + 1,
            "received_at": datetime.now(timezone.utc).isoformat(), "status": "open"}
    HELP_REQUESTS.append(item)
    return {"id": item["id"]}


@router.get("/help")
def list_help_requests():
    return list(reversed(HELP_REQUESTS))
