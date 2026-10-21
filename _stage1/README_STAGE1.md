# Stage 1: Care-team console (`/staff`)

## Why `/staff` was thin, and what changed
Your console had a dashboard, an upload form and the review screen. **Help requests and Patients were "Coming next" stubs**, and the
backend had no help or patient endpoints (`main.py` mounted 2 of 5 routers; `patients.py`, `plans.py`, `webhooks.py` were empty files).
That is also why the patient app said it could not reach the hospital. Nothing was listening.

New: a live **Help requests inbox**, an alert bar on every page, a rebuilt **dashboard**, a **Patients** list and **Patient record** page,
and the API behind them. Your review/approval flow, upload page, pipeline, patient app and Live Theater are **untouched**.

## Install (Windows PowerShell). Start the API first, or every page says "Cannot reach the API"
```powershell
Set-Location E:\recoverright
Expand-Archive -Force .\recoverright_stage1_staff.zip -DestinationPath .\_stage1
powershell -ExecutionPolicy Bypass -File .\_stage1\apply.ps1       # backs up everything it overwrites
Set-Location E:\recoverright\api
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -t .                          # 39 tests, no extra packages needed
uvicorn app.main:app --reload --port 8000                          # use whatever command you normally use; main.py changed, so restart it
```
In a second PowerShell:
```powershell
Set-Location E:\recoverright\web
npm run build        # your authoritative type-check/lint (see "Not verified")
npm run dev
```
Try it: open `http://localhost:3000/staff` in one window and `http://localhost:3000/p/demo` in another. Say "I need help" (or press the red
button). Within about 2.5 seconds the staff window shows the red alert bar, the sidebar badge, and the request in the inbox.
For a demo with data: upload a document, then `python -m tools.seed_help` (and `python -m tools.seed_help --clear` to remove only those).

## What it does
- **Alert bar on every staff page** while any patient is waiting. It cannot be dismissed; only acknowledging clears it. Optional alert sound.
- **Help requests inbox**: most urgent first; patient's exact words; response-time countdown against a target (critical 2 min, concern 10 min,
  turns red when overdue); Call patient / guardian (opens the phone dialer and logs the call); Acknowledge, Escalate, Resolve (reason required),
  Add note; full history of who did what and when. Your name (top right) is written into every action.
- **Dashboard**: "Needs attention now" panel with one-click Acknowledge, five KPIs, tabbed work queue, activity feed, system status.
- **Patients**: list with help badges and search; record page with contacts, the approved plan by category, readable activity, help history,
  links to review / live theater / patient app, and a copy-link button.
- Reliability: API outage keeps the last known requests on screen and recovers by itself; the timers use the server's clock (a wrong
  laptop clock cannot make a request look overdue); the patient app's retries can never create a second request; works on a phone.

## API added
`POST /help` · `GET /help?status=active|all|open|acknowledged|escalated|resolved&include_test=` · `GET /help/summary` · `GET /help/{id}` ·
`POST /help/{id}/action` (acknowledge | call | escalate | resolve | note) · `GET /patients` · `GET /patients/{run_id}`.
Rules live in `app/services/help_store.py` (pure Python, unit-tested). Requests are stored as JSON files in `data/help/`.

## Verified
- **39 Python tests**: the state machine (every legal and illegal transition), duplicate protection, urgency ordering, response-time numbers,
  persistence, a damaged file not taking the inbox down, 12 threads sending the same alert creating exactly one request, 10 threads logging
  10 calls losing none, path-traversal tokens refused, patient directory and plan grouping, the seed script.
- **92 browser checks** in real Chromium with real React 19 **in StrictMode**, against a server that runs the **real Python core modules**
  (the patient app's alert is simulated by a POST to it): alert appears on every page, acknowledge / call / escalate / resolve flows and what the
  backend stored, deep links, demo and placeholder phone numbers, outage and recovery, clock skew, overdue states, search and tabs, the patient
  record, your review screen still rendering inside the new shell, and no horizontal overflow or console errors at 1920 / 1280 / 390 px.
- Type-check of every file I added or changed: 0 errors (partial, see below). Screenshots in `verification/screenshots/`.
- Bugs this testing caught in my own work, now fixed: the Acknowledge button text was invisible in the banner (white on white), the detail
  panel went blank right after acting on a request, the inbox could not follow a request to its next tab, a hidden label widened the whole
  page on phones, the work-queue action icons were clipped.

## Not verified. Please check these yourself
- **The FastAPI routers were not run under real FastAPI/uvicorn** (not installed where this was built). I called the handler functions directly
  with stand-ins for FastAPI/pydantic, and ran the same core behind a plain Python HTTP server. Start the API, open `/docs`, and confirm the
  new `/help` and `/patients` routes appear; tell me if any route misbehaves.
- `npm run build` and lint were not run. My type-check uses a hand-written React stub.
- **"Call" opens the device's phone dialer (a `tel:` link). It is not hospital telephony** and nothing is connected or recorded by a phone system.
  The app logs that a call was started, not that it was answered.
- **No login.** These endpoints are open and "your name" is typed, not authenticated. Add authentication before any real use.
  The patient link token is still the run id, and the patient page reads the staff `/review` endpoint.
- Alert sound was not heard. `apply.ps1` was not executed. Approve/edit actions in the review screen were not exercised.
- Polling every 2.5 s, not push. One API process only (the lock is in-process).

## Tip for sending me code again
`Compress-Archive -Path web\app, api\app ...` merges the two `app` folders into one. Zip `web` and `api` as two separate archives.
