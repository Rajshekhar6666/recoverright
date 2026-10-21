# Verification evidence

- `screenshots/` : frames captured by the browser tests (demo mid-run, review, approved, failures, offline, 1920/1366/390 px, presentation mode, patient emergency screen).
- `sandbox-harness/` : the scripts that produced those results. They use sandbox-specific absolute paths (/home/claude/...) and stand-ins for the files that were
  not in your ZIP (`shadow/`, `lib/api.ts`), so they are provided for transparency and are not meant to be run unchanged on your PC.
  `patient-e2e.mjs`, `live-e2e.mts`, `perf.mts` are the test and measurement scripts; `fake-speech.js` is the injected fake SpeechRecognition.
- `../web/tests/` : the 53 portable unit tests (these DO run on your machine, see the main README).
- `../tools/art/gen.py` : how the pixel sprites and bitmap font were generated.
