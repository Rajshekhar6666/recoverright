"""Server-side APScheduler-based reminder engine.

Clinical Safety & Workflow Rules:
1. The scheduler fires due reminder jobs every minute via a background job.
2. Delivery is attempted through the configured channel; failures are retried
   up to ReminderJob.max_retries times before being marked failed.
3. Missed-dose escalation: a job that is still 'scheduled' 90+ minutes after
   its due time is marked 'missed' and an alert is written to the event bus.
4. Snoozed reminders are re-queued after their snooze_until time passes.
5. The scheduler is started on app startup and shut down on app teardown.
   It is deliberately single-threaded to avoid storage race conditions; the
   storage layer's per-run locking provides additional safety.

Gap 6 fix: Reminders now fire from the server even when no patient page is
open.  SMS and WhatsApp channels remain simulated until a real provider key
is configured (see reminder.py / whatsapp.py), but the scheduling loop and
missed-dose logging are fully operational.

Gap 12 fix: The tick loop also checks for critical unacknowledged help
requests.  Any request with severity='critical' that has been open or
acknowledged for more than 120 seconds is automatically escalated via
help_store.act(help_id, "escalate") and an on-call notification is emitted
to the event bus, triggering the shift owner's desk phone alert.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("recoverright.scheduler")

# ── lazy import to avoid circular deps ────────────────────────────────────────
_scheduler: Optional[object] = None  # APScheduler BackgroundScheduler


def _parse_scheduled_dt(job_dict: dict) -> Optional[datetime]:
    """Parse scheduled_date + scheduled_time into a UTC-aware datetime."""
    sdate = job_dict.get("scheduled_date") or ""
    stime = job_dict.get("scheduled_time") or ""
    if not sdate or not stime:
        return None
    # Normalise sentinel values produced by tasks.py
    if "not set" in stime.lower() or stime == "time_not_set":
        return None
    if stime.lower() in ("as needed", "prn"):
        return None
    try:
        # Parse "08:00 AM" style
        dt = datetime.strptime(f"{sdate} {stime}", "%Y-%m-%d %I:%M %p")
    except ValueError:
        try:
            dt = datetime.strptime(f"{sdate} {stime}", "%Y-%m-%d %H:%M")
        except ValueError:
            return None
    # Treat as IST (UTC+05:30) – the default for Indian deployments
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    return dt.replace(tzinfo=ist_offset)


def _tick():
    """One tick of the reminder delivery loop (runs every 60 seconds).

    Gap 12 fix: Also checks for critical unacknowledged help requests.
    Any help request with severity='critical' open for >120 seconds is
    escalated: status -> 'escalated', on-call nurse notified via event bus.
    """
    from app.services.storage import store
    from app.services.reminder import trigger_reminder
    from app.services.event_bus import bus
    from app.schemas.events import Stage

    now_utc = datetime.now(timezone.utc)
    missed_threshold = timedelta(minutes=90)
    critical_escalation_threshold = timedelta(seconds=120)

    try:
        all_runs = store.list_runs()
    except Exception as exc:
        logger.error("scheduler._tick: failed to list runs: %s", exc)
        return

    # -- Gap 12: Critical Help Request Escalation
    try:
        from app.services.help_store import help_store
        from app.services.cockpit import get_shift_owner
        active_requests = help_store.list("active")
        for req in active_requests:
            if req.get("severity") != "critical":
                continue
            created_str = req.get("created_at") or ""
            if not created_str:
                continue
            try:
                created_dt = datetime.fromisoformat(created_str)
                if created_dt.tzinfo is None:
                    from datetime import timezone as _tz
                    created_dt = created_dt.replace(tzinfo=_tz.utc)
            except ValueError:
                continue
            age = now_utc - created_dt
            if age > critical_escalation_threshold and req.get("status") != "escalated":
                req_id = req.get("id") or req.get("run_id", "unknown")
                # Escalate status
                help_store.update_status(req_id, "escalated")
                # Get on-call contact
                try:
                    shift = get_shift_owner()
                    on_call_phone = shift.get("desk_phone", "")
                    on_call_name = shift.get("nurse_name", "On-Call Nurse")
                except Exception:
                    on_call_phone = ""
                    on_call_name = "On-Call Nurse"
                # Emit escalation event
                run_id_for_req = req.get("run_id", "unknown")
                bus.emit(run_id_for_req, Stage.HELP, "help.escalated", {
                    "request_id": req_id,
                    "severity": "critical",
                    "age_seconds": round(age.total_seconds()),
                    "on_call_nurse": on_call_name,
                    "on_call_phone": on_call_phone,
                    "heard": req.get("heard", ""),
                })
                logger.warning(
                    "CRITICAL HELP ESCALATED: run=%s age=%.0fs on_call=%s phone=%s",
                    run_id_for_req, age.total_seconds(), on_call_name, on_call_phone
                )
    except Exception as exc:
        logger.error("scheduler._tick: critical escalation check failed: %s", exc)

    for run_meta in all_runs:
        run_id = run_meta.get("run_id")
        if not run_id:
            continue
        try:
            reminder_dicts = store.get_reminders(run_id)
        except Exception:
            continue

        for rd in reminder_dicts:
            status = rd.get("status")
            if status not in ("scheduled", "snoozed", "attempted"):
                continue

            # -- handle snoozed reminders
            if status == "snoozed":
                snooze_until_str = rd.get("snooze_until") or ""
                if snooze_until_str:
                    try:
                        snooze_until = datetime.fromisoformat(snooze_until_str)
                        if snooze_until > now_utc:
                            continue  # still snoozed
                        # Snooze expired - re-queue as scheduled
                        rd["status"] = "scheduled"
                        store.save_reminders(run_id, reminder_dicts)
                    except ValueError:
                        pass

            job_id = rd.get("job_id")
            if not job_id:
                continue

            due_dt = _parse_scheduled_dt(rd)
            if due_dt is None:
                continue  # no confirmed time - cannot fire automatically

            # -- missed dose escalation
            overdue = now_utc - due_dt
            if due_dt <= now_utc and overdue > missed_threshold and rd.get("status") == "scheduled":
                rd["status"] = "missed"
                try:
                    store.save_reminders(run_id, reminder_dicts)
                    store.audit(run_id, "scheduler", "reminder.missed",
                                job_id=job_id, overdue_minutes=round(overdue.total_seconds() / 60))
                    bus.emit(run_id, Stage.REMINDER, "reminder.missed", {
                        "job_id": job_id,
                        "medication": rd.get("medication_name"),
                        "overdue_minutes": round(overdue.total_seconds() / 60),
                    })
                    logger.warning("Missed dose alert: run=%s job=%s overdue=%.0fm",
                                   run_id, job_id, overdue.total_seconds() / 60)
                except Exception as exc:
                    logger.error("scheduler: missed-dose escalation failed: %s", exc)
                continue

            # -- deliver if due and not yet attempted
            if due_dt <= now_utc and rd.get("status") in ("scheduled", "attempted"):
                attempts = rd.get("attempts", 0)
                max_retries = rd.get("max_retries", 3)
                if attempts >= max_retries:
                    continue
                try:
                    trigger_reminder(run_id, job_id)
                    logger.info("scheduler: delivered job=%s run=%s", job_id, run_id)
                except KeyError:
                    logger.warning("scheduler: job %s not found for run %s", job_id, run_id)
                except Exception as exc:
                    logger.error("scheduler: delivery failed job=%s: %s", job_id, exc)

def start_scheduler():
    """Start the APScheduler background scheduler.

    Called once from app startup (lifespan handler in main.py).
    The scheduler fires _tick() every 60 seconds using the threadpool executor
    with max_workers=1 to avoid concurrent storage writes.
    """
    global _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.executors.pool import ThreadPoolExecutor as APThreadPool

        executors = {"default": APThreadPool(max_workers=1)}
        _scheduler = BackgroundScheduler(executors=executors, timezone="UTC")
        _scheduler.add_job(
            _tick,
            trigger="interval",
            seconds=60,
            id="reminder_tick",
            name="Server-side reminder delivery loop",
            replace_existing=True,
            misfire_grace_time=30,
        )
        _scheduler.start()
        logger.info("RecoverRight server-side reminder scheduler started (interval=60s).")
    except ImportError:
        logger.warning("APScheduler not installed – server-side reminder scheduler disabled.")
    except Exception as exc:
        logger.error("Failed to start reminder scheduler: %s", exc)


def stop_scheduler():
    """Shut down the scheduler gracefully on app teardown."""
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
            logger.info("RecoverRight reminder scheduler stopped.")
        except Exception as exc:
            logger.warning("Scheduler shutdown error: %s", exc)
        _scheduler = None


def get_scheduler_status() -> dict:
    """Return current scheduler state for the /system/metrics endpoint."""
    if _scheduler is None:
        return {"running": False, "jobs": []}
    try:
        jobs = [
            {
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            }
            for job in _scheduler.get_jobs()
        ]
        return {"running": _scheduler.running, "jobs": jobs}
    except Exception:
        return {"running": False, "jobs": []}
