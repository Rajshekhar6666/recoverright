# RecoverRight update: Live Theater + patient voice fix

Only `web/` files are included (your ZIP had no `package.json` and no API code). `/staff` was **not touched**.
`/staff`, `/p/demo` and `/live` remain three separate interfaces.

## Install (Windows PowerShell)

```powershell
Set-Location E:\recoverright
Expand-Archive -Force .\recoverright_voice_theater_update.zip -DestinationPath .\_update
powershell -ExecutionPolicy Bypass -File .\_update\apply.ps1      # backs up what it overwrites to web_backup_<time>
Set-Location E:\recoverright\web
npm install                                                       # only if node_modules is missing; no new dependencies
npm run build                                                     # YOUR authoritative type-check/lint (see "Not verified")
npm run dev
```

Open: `http://localhost:3000/staff`, `http://localhost:3000/p/demo`, `http://localhost:3000/live` (newest real run),
`http://localhost:3000/live/demo` (clearly-labelled simulation, works with the API off).
Use `localhost` (or https): browsers refuse the microphone on plain `http://<LAN-IP>`.
Voice needs Chrome or Edge. Firefox has no speech recognition (the app says so and the help button still works).

Unit tests (53, no browser needed, Node 22):
```powershell
Set-Location E:\recoverright\web
npx tsx --test (Get-ChildItem tests\*.test.ts).FullName
```

Optional `web\.env.local`:
```
NEXT_PUBLIC_HELP_PATH=/help              # where the help alert POSTs (see Backend)
NEXT_PUBLIC_EMERGENCY_NUMBER=            # your local emergency number; shows an extra "Call emergency services" button
```

## Backend changes required

**Patient help alert needs an endpoint.** The app POSTs JSON to `{API}/help` and shows "Your care team was alerted"
**only on a 2xx response**. Without the endpoint the patient sees "Help has NOT been sent" plus a call button. That is
the honest behaviour, and it is what you will see until this exists. Contract + reference code: `backend/help_endpoint_example.py`
(**untested**, assumes FastAPI). If your API already has a help route, set `NEXT_PUBLIC_HELP_PATH` to it, or send me
`lib/api.ts` and the route and I will match the payload. Showing alerts to a nurse (your `/staff/help` page) is not done.

Nothing else on the backend changes. The Theater reads the same endpoints as before (`/runs`, `/runs/:id`, `/runs/:id/review`,
`/runs/:id/events`).

## Voice: what was actually wrong (found by reading `useSafetyMic.ts`, then proven with tests)

| Bug in the old code | Effect | Fix |
|---|---|---|
| Negation regex applied to the whole sentence | "no pain but I can't breathe" produced **no alert** | Negation judged locally, per phrase |
| "cannot / can not / can’t (curly)" not matched | "I cannot breathe" **silent** (old regex missed 5 of 12 emergency phrasings in my test) | Text normalised first |
| React StrictMode double-mount | stale recognizer restarted itself; two recognizers fought | Every session has a generation id; stale ones are unhooked |
| UI said "Listening" the instant `start()` was called | showed Listening while permission was pending or denied | "Listening" only after the browser reports audio |
| 20-second cooldown | a real second emergency after "I'm okay" was ignored | Episode logic + immediate re-arm on dismissal |
| `network` error → restart every 250 ms | hot loop, still said "Listening" | Capped backoff, honest "Reconnecting…" |
| Nothing audible, no real API call | alert could not truly reach anyone | Spoken reply + alarm tone + real POST |
| Demo plan call button | would have dialled `+91 00000 00000` | Placeholder numbers are never dialled |
| (my own, caught by StrictMode test) save effect overwrote saved dose ticks with empty state | **data loss on reload** | Hydration flag is state, not a ref |

Also: continuous listening restarts itself (watchdog, recycle before the browser stalls a session, wake on tab-visible/online);
the app's own speech is filtered out by text overlap rather than muting (muting made it deaf to a patient speaking over it);
a manual red **I need help now** button and a **Test without a microphone** box use the same pipeline.
Test phrases and the button send real alerts marked `source: "test"` / `"button"`.

## Live Theater

Pixel-art control room (canvas, 384×216 scaled with integer steps), driven only by real events: nodes change state from event
types, particles are spawned by `effectsFor(event)`, approval only when the polled run status is `approved`.
Shows actual model names from `extract.*.started`, field-by-field A vs B (paired by drug name, then order; differing attribute named),
reconciled result, quote verification, per-stage timings, event rate, connection/API state, patient impact.
States: standby, connecting, no-signal, live, reconnecting, stalled (>20 s without events), stream closed, API lost, reader failed,
run failed, awaiting review, approved, replay (scrub/speed), and **SIMULATED DEMO** (labelled in the pill, a banner and the connection panel).
Keys: `F` present · `R` replay · `L` live · `S` sound (off by default) · `D` demo. Presentation mode fits one 1080p screen.
Respects `prefers-reduced-motion`.

## Verified vs not verified

**Verified** (details and scripts in `verification/`):
- 53 unit tests pass: phrase detection, the voice state machine (fake recogniser + manual clock), help sender, theater model.
- 52 checks in real Chromium with real React 19 **in StrictMode** against a mock API: every requested phrase, interim detection,
  real POST, "alerted" only after 201, 404 → "NOT sent" + retries + confirm-to-close, dismissal then immediate second emergency,
  echo, negation, medicine by voice and tap, permission denied / network / unsupported, manual button, mobile layout.
- 59 checks in real Chromium (StrictMode) for the Theater over real Server-Sent Events: demo, live run, real model names, approval from
  status, dropped stream and recovery, reader failure, run failure, API offline, empty run shows nothing, replay, presentation mode
  (one screen, no scroll), keyboard, reduced motion, 1920/1366/390 px with no overflow or console errors.
- Type-check of all new/changed files: 0 errors (partial, see below). Screenshots: `verification/screenshots/`.

**Not verified. Please check these yourself:**
- **`npm run build` and lint were not run** (no `package.json`, no Next.js here). My type-check used a hand-written minimal React stub
  (`noImplicitAny` off for `.tsx`), so it is weaker than yours. `lib/api.ts`, `lib/types.ts`, `lib/review.ts` were missing: I used
  stand-ins inferred from your code. If a field shape differs in the real files, the Theater could misread it.
- **Real speech recognition was never exercised.** Headless Chromium cannot hear, so recognition was faked. Real Chrome behaviour
  (service errors, session timeouts, Android duplicate results) is simulated, not observed. Safari and Firefox untested.
  Phrase detection is English (en-IN) plus a few romanised/Devanagari Hindi phrases.
- Spoken replies and the alarm tone were checked as calls/state, **not heard**. Browsers may block sound until a tap; the alert then says so.
- The API contract used by the tests is **my reconstruction from your client code**, not your real backend. `/help` is an assumption.
- Frame rate: measured only in a CPU-only headless browser: about 35–50 fps at 1080p, 50 fps at 1366×768, occasional long frames (worst
  ~140 ms). Real GPU hardware should be better, but I could not measure it. An adaptive 30 fps limiter engages on slow machines.
- Screen-reader use and formal contrast audit not done. `apply.ps1` was not executed (no PowerShell here).
- Dose/task ticks are saved **on the device only** (the UI says so). There is no backend endpoint for them.
- Run `npm run build` and tell me about any error, and I will fix it.
