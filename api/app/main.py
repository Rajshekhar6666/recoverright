import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import analytics, auth, calls, caregivers, demo, events, help, patients, plans, privacy, reminders, runs, vitals, voice, webhooks, wellness
from app.services.storage import store, runs_dir
from app.services.help_store import help_store
from app.services.scheduler import start_scheduler, stop_scheduler, get_scheduler_status

logger = logging.getLogger("recoverright")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background services on startup; shut them down on exit."""
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="RecoverRight API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def security_and_tracing_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.perf_counter()
    try:
        response: Response = await call_next(request)
    except Exception as exc:
        req_id = request_id
        logger.error("Unhandled error for request %s: %s", req_id, exc, exc_info=True)
        response = JSONResponse(
            status_code=500,
            content={
                "error": "InternalServerError",
                "message": "An unexpected server error occurred.",
                "request_id": req_id,
            },
        )
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    # Ingest security headers & tracing
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{duration_ms}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "unknown")
    logger.error("Unhandled error for request %s: %s", req_id, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected server error occurred.",
            "request_id": req_id,
        },
        headers={"X-Request-ID": req_id},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)

app.include_router(events.router)
app.include_router(auth.router)
app.include_router(runs.router)
app.include_router(help.router)
app.include_router(patients.router)
app.include_router(plans.router)
app.include_router(analytics.router)
app.include_router(reminders.router)
app.include_router(caregivers.router)
app.include_router(demo.router)
app.include_router(calls.router)
app.include_router(webhooks.router)
app.include_router(vitals.router)
app.include_router(voice.router)
app.include_router(privacy.router)
app.include_router(wellness.router, prefix="/wellness", tags=["wellness"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    try:
        test_dir = runs_dir()
        test_dir.mkdir(parents=True, exist_ok=True)
        probe_file = test_dir / ".ready_probe"
        probe_file.write_text("ok", encoding="utf-8")
        probe_file.unlink(missing_ok=True)
        return {
            "status": "ready",
            "storage": "accessible",
            "runs_dir": str(test_dir),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Storage not accessible: {e}")


@app.get("/system/metrics")
def system_metrics():
    """Operational monitoring metrics without PHI/PII leakage."""
    all_runs = store.list_runs()
    total_runs = len(all_runs)
    approved_runs = sum(1 for r in all_runs if r.get("status") in ("approved", "reapproved"))
    needs_review = sum(1 for r in all_runs if r.get("status") == "needs_review")
    active_help = len(help_store.list("active"))

    return {
        "status": "operational",
        "service": "RecoverRight API",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "runs": {
            "total": total_runs,
            "approved": approved_runs,
            "needs_review": needs_review,
        },
        "help_requests": {
            "active": active_help,
        },
        "scheduler": get_scheduler_status(),
    }
