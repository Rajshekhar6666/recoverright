# Verification evidence (Stage 1)
- `screenshots/`: frames captured by the browser tests (calm dashboard, alert state, inbox, patient record, phone layout).
- `harness/`: the scripts that produced the browser results. `dev_server.py` is a plain-Python HTTP server that exposes the same routes as the
  FastAPI routers and calls the REAL `app/services/help_store.py` and `directory.py`. It uses sandbox paths (/home/claude/...), so it is for transparency, not for running unchanged on your PC.
- The 39 Python tests are in `api/tests/` and DO run on your machine (see README_STAGE1.md).
