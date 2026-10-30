"""Medication Reminder Engine and Provider-Independent Delivery Channels.

Clinical Safety & Workflow Rules:
1. Provider-independent architecture: channels (in-app, SMS, WhatsApp) implement BaseDeliveryChannel.
2. Reminder schedule, timezone, delivery attempts, acknowledgement, and ingestion are tracked distinctly.
3. Dose delivery / ack != ingestion (self-reported dose ingestion is separate).
4. Idempotent scheduling prevents duplicate reminders for the same dose slot.
5. Unlocking or revising an approved plan automatically cancels stale reminders from older versions.
"""
from abc import ABC, abstractmethod
from datetime import date, datetime, timedelta, timezone
from typing import Optional
import uuid

from app.pipeline.tasks import build_medication_schedules
from app.schemas.api import ApprovedPlan
from app.schemas.events import Stage
from app.schemas.reminder import DeliveryChannelType, DeliveryResult, ReminderJob
from app.services.event_bus import bus
from app.services.storage import store


class BaseDeliveryChannel(ABC):
    """Abstract interface for provider-independent reminder delivery channels."""

    @property
    @abstractmethod
    def channel_name(self) -> DeliveryChannelType:
        pass

    @abstractmethod
    def send(self, job: ReminderJob, recipient: str, simulate_failure: bool = False) -> DeliveryResult:
        """Sends the reminder through this channel."""
        pass

    def deliver(self, recipient: str, message: str, run_id: Optional[str] = None) -> DeliveryResult:
        """Directly delivers an arbitrary notification message."""
        now_iso = datetime.now(timezone.utc).isoformat()
        if run_id:
            bus.emit(run_id, Stage.CAREGIVER, f"message.{self.channel_name}_sent", {
                "recipient": recipient,
                "channel": self.channel_name,
                "text": message,
            })
        return DeliveryResult(
            success=True,
            channel=self.channel_name,
            message_id=f"msg_{self.channel_name}_{uuid.uuid4().hex[:8]}",
            recipient=recipient,
            status="delivered",
            timestamp=now_iso,
            details={"message": message},
        )


class InAppChannel(BaseDeliveryChannel):
    """In-app modal and notification alert channel."""

    @property
    def channel_name(self) -> DeliveryChannelType:
        return "in_app"

    def send(self, job: ReminderJob, recipient: str, simulate_failure: bool = False) -> DeliveryResult:
        now_iso = datetime.now(timezone.utc).isoformat()
        if simulate_failure:
            return DeliveryResult(
                success=False,
                channel="in_app",
                message_id=f"msg_inapp_{uuid.uuid4().hex[:8]}",
                recipient=recipient,
                status="failed",
                error="Simulated in-app notification client error",
                timestamp=now_iso,
            )

        bus.emit(job.run_id, Stage.REMINDER, "reminder.in_app_delivered", {
            "job_id": job.job_id,
            "medication": job.medication_name,
            "dose": job.dose,
            "scheduled_time": job.scheduled_time,
        })
        return DeliveryResult(
            success=True,
            channel="in_app",
            message_id=f"msg_inapp_{uuid.uuid4().hex[:8]}",
            recipient=recipient,
            status="delivered",
            timestamp=now_iso,
        )


class SimulatedSMSChannel(BaseDeliveryChannel):
    """Simulated SMS delivery channel (can bind to Twilio / AWS SNS in production)."""

    @property
    def channel_name(self) -> DeliveryChannelType:
        return "sms"

    def send(self, job: ReminderJob, recipient: str, simulate_failure: bool = False) -> DeliveryResult:
        now_iso = datetime.now(timezone.utc).isoformat()
        if simulate_failure:
            return DeliveryResult(
                success=False,
                channel="sms",
                message_id=f"msg_sms_{uuid.uuid4().hex[:8]}",
                recipient=recipient,
                status="failed",
                error="Simulated carrier network timeout",
                timestamp=now_iso,
            )

        meta = store.read(job.run_id, "meta.json") if store.has(job.run_id, "meta.json") else {}
        p_info = meta.get("patient") or {}
        p_name = p_info.get("name", "Patient")
        is_cg = (p_info.get("caregiver_first") or False) or (recipient == p_info.get("guardian_phone") and bool(recipient))

        if is_cg:
            msg_body = f"RecoverRight [Caregiver Alert for {p_name}]: Time to administer {job.medication_name} ({job.dose or 'as directed'}). Scheduled for {job.scheduled_time}."
        else:
            msg_body = f"RecoverRight: Time to take {job.medication_name} ({job.dose or 'as directed'}). Scheduled for {job.scheduled_time}."

        bus.emit(job.run_id, Stage.REMINDER, "reminder.sms_sent", {
            "job_id": job.job_id,
            "recipient": recipient,
            "text": msg_body,
            "caregiver_first": is_cg,
        })
        return DeliveryResult(
            success=True,
            channel="sms",
            message_id=f"msg_sms_{uuid.uuid4().hex[:8]}",
            recipient=recipient,
            status="simulated",
            timestamp=now_iso,
        )


class SimulatedWhatsAppChannel(BaseDeliveryChannel):
    """Simulated WhatsApp interactive message channel with response buttons."""

    @property
    def channel_name(self) -> DeliveryChannelType:
        return "whatsapp"

    def send(self, job: ReminderJob, recipient: str, simulate_failure: bool = False) -> DeliveryResult:
        now_iso = datetime.now(timezone.utc).isoformat()
        if simulate_failure:
            return DeliveryResult(
                success=False,
                channel="whatsapp",
                message_id=f"msg_wa_{uuid.uuid4().hex[:8]}",
                recipient=recipient,
                status="failed",
                error="Simulated WhatsApp Cloud API delivery error",
                timestamp=now_iso,
            )

        bus.emit(job.run_id, Stage.REMINDER, "reminder.whatsapp_sent", {
            "job_id": job.job_id,
            "recipient": recipient,
            "template": "medication_reminder_v1",
            "medication": job.medication_name,
            "actions": ["Taken", "Remind in 10m"],
        })
        return DeliveryResult(
            success=True,
            channel="whatsapp",
            message_id=f"msg_wa_{uuid.uuid4().hex[:8]}",
            recipient=recipient,
            status="simulated",
            timestamp=now_iso,
        )


class ChannelRegistry:
    """Registry managing available reminder delivery channels."""

    def __init__(self):
        self._channels: dict[DeliveryChannelType, BaseDeliveryChannel] = {
            "in_app": InAppChannel(),
            "sms": SimulatedSMSChannel(),
            "whatsapp": SimulatedWhatsAppChannel(),
        }

    def get(self, name: DeliveryChannelType) -> BaseDeliveryChannel:
        return self._channels.get(name, self._channels["in_app"])

    def register(self, channel: BaseDeliveryChannel):
        self._channels[channel.channel_name] = channel


registry = ChannelRegistry()
channel_registry = registry


def schedule_reminders_for_plan(
    plan: ApprovedPlan,
    for_date: Optional[str] = None,
    timezone_str: str = "Asia/Kolkata",
) -> list[ReminderJob]:
    """Schedules idempotent medication reminder jobs for an approved recovery plan."""
    run_id = plan.run_id
    target_date = for_date or date.today().isoformat()
    meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
    patient_info = meta.get("patient") or {}
    phone = patient_info.get("phone") or "+91 00000 00000"

    with store.lock(run_id):
        existing_dicts = store.get_reminders(run_id)
        existing_jobs = [ReminderJob.model_validate(r) for r in existing_dicts]
        existing_ids = {r.job_id for r in existing_jobs}

        meds = build_medication_schedules(plan)
        new_jobs: list[ReminderJob] = []

        for med in meds:
            times = med.times if med.times else ["08:00 AM"]
            for t in times:
                time_clean = t.replace(" ", "_").replace(":", "").lower()
                job_id = f"rem_{run_id}_v{plan.version}_{med.id}_{time_clean}_{target_date}"
                if job_id in existing_ids:
                    continue

                msg_body = f"Time for {med.name} ({med.dose or 'as directed'}). Scheduled for {t}."
                job = ReminderJob(
                    job_id=job_id,
                    run_id=run_id,
                    plan_version=plan.version,
                    medication_id=med.id,
                    medication_name=med.name,
                    dose=med.dose,
                    scheduled_time=t,
                    scheduled_date=target_date,
                    timezone=timezone_str,
                    channel="in_app",
                    status="scheduled",
                    message_body=msg_body,
                )
                new_jobs.append(job)
                existing_jobs.append(job)
                existing_ids.add(job_id)

        all_dicts = [j.model_dump(mode="json") for j in existing_jobs]
        store.save_reminders(run_id, all_dicts)

        if new_jobs:
            bus.emit(run_id, Stage.REMINDER, "reminders.scheduled", {
                "count": len(new_jobs),
                "plan_version": plan.version,
                "date": target_date,
            })
            store.audit(run_id, plan.approved_by or "system", "reminders.scheduled",
                        count=len(new_jobs), version=plan.version)

        return existing_jobs


def cancel_stale_reminders(run_id: str, active_version: int) -> int:
    """Cancels pending reminder jobs from older plan versions."""
    with store.lock(run_id):
        existing_dicts = store.get_reminders(run_id)
        cancelled_count = 0
        for r in existing_dicts:
            if r.get("plan_version", 1) < active_version:
                if r.get("status") in ("scheduled", "attempted", "snoozed"):
                    r["status"] = "cancelled"
                    r["error"] = f"Plan superseded by version {active_version}"
                    cancelled_count += 1

        if cancelled_count > 0:
            store.save_reminders(run_id, existing_dicts)
            bus.emit(run_id, Stage.REMINDER, "reminders.cancelled_stale", {
                "cancelled_count": cancelled_count,
                "active_version": active_version,
            })
            store.audit(run_id, "system", "reminders.cancelled_stale",
                        cancelled=cancelled_count, active_version=active_version)

        return cancelled_count


def trigger_reminder(
    run_id: str,
    job_id: str,
    channel_override: Optional[DeliveryChannelType] = None,
    simulate_failure: bool = False,
) -> ReminderJob:
    """Deterministically triggers delivery of a scheduled reminder."""
    with store.lock(run_id):
        existing_dicts = store.get_reminders(run_id)
        target_dict = next((r for r in existing_dicts if r.get("job_id") == job_id), None)
        if not target_dict:
            raise KeyError(f"Reminder job {job_id} not found")

        job = ReminderJob.model_validate(target_dict)
        meta = store.read(run_id, "meta.json") if store.has(run_id, "meta.json") else {}
        patient_info = meta.get("patient") or {}

        # Gap 7 & 11: Caregiver-first delivery mode routing
        caregiver_first = patient_info.get("caregiver_first", False)
        caregiver_phone = patient_info.get("guardian_phone") or (patient_info.get("caregiver_profile") or {}).get("phone")
        if caregiver_first and caregiver_phone:
            recipient = caregiver_phone
        else:
            recipient = patient_info.get("phone") or "+91 00000 00000"

        channel_type = channel_override or job.channel
        channel = registry.get(channel_type)

        job.attempts += 1
        job.last_attempt_at = datetime.now(timezone.utc).isoformat()

        res = channel.send(job, recipient=recipient, simulate_failure=simulate_failure)

        if res.success:
            job.status = "delivered"
            job.delivered_at = res.timestamp
            job.channel = channel_type
            job.error = None
        else:
            if job.attempts >= job.max_retries:
                job.status = "failed"
            else:
                job.status = "attempted"
            job.error = res.error

        # Update in storage
        idx = next(i for i, r in enumerate(existing_dicts) if r.get("job_id") == job_id)
        existing_dicts[idx] = job.model_dump(mode="json")
        store.save_reminders(run_id, existing_dicts)

        store.audit(
            run_id,
            "reminder_engine",
            f"reminder.{job.status}",
            job_id=job_id,
            channel=channel_type,
            attempts=job.attempts,
            error=job.error,
        )

        return job


def snooze_reminder(run_id: str, job_id: str, minutes: int = 10, by: str = "patient") -> ReminderJob:
    """Snoozes a reminder for a specified interval."""
    with store.lock(run_id):
        existing_dicts = store.get_reminders(run_id)
        target_dict = next((r for r in existing_dicts if r.get("job_id") == job_id), None)
        if not target_dict:
            raise KeyError(f"Reminder job {job_id} not found")

        job = ReminderJob.model_validate(target_dict)
        now_dt = datetime.now(timezone.utc)
        snooze_dt = now_dt + timedelta(minutes=minutes)

        job.status = "snoozed"
        job.snooze_until = snooze_dt.isoformat()

        idx = next(i for i, r in enumerate(existing_dicts) if r.get("job_id") == job_id)
        existing_dicts[idx] = job.model_dump(mode="json")
        store.save_reminders(run_id, existing_dicts)

        bus.emit(run_id, Stage.REMINDER, "reminder.snoozed", {
            "job_id": job_id,
            "snooze_until": job.snooze_until,
            "minutes": minutes,
        })
        store.audit(run_id, by, "reminder.snoozed", job_id=job_id, minutes=minutes)

        return job


def acknowledge_reminder(run_id: str, job_id: str, via: str = "app_button") -> ReminderJob:
    """Acknowledges receipt of a reminder distinct from medication ingestion."""
    with store.lock(run_id):
        existing_dicts = store.get_reminders(run_id)
        target_dict = next((r for r in existing_dicts if r.get("job_id") == job_id), None)
        if not target_dict:
            raise KeyError(f"Reminder job {job_id} not found")

        job = ReminderJob.model_validate(target_dict)
        now_iso = datetime.now(timezone.utc).isoformat()

        job.status = "acknowledged"
        job.acknowledged_at = now_iso

        idx = next(i for i, r in enumerate(existing_dicts) if r.get("job_id") == job_id)
        existing_dicts[idx] = job.model_dump(mode="json")
        store.save_reminders(run_id, existing_dicts)

        # Connect with medication ack record
        store.record_dose_ack(run_id, job.medication_id, acknowledged=True, via=via)

        bus.emit(run_id, Stage.REMINDER, "reminder.acknowledged", {
            "job_id": job_id,
            "via": via,
        })
        store.audit(run_id, "patient", "reminder.acknowledged", job_id=job_id, via=via)

        return job


def get_reminders_for_run(run_id: str) -> list[ReminderJob]:
    """Retrieves all scheduled or historical reminder jobs for a run."""
    dicts = store.get_reminders(run_id)
    return [ReminderJob.model_validate(d) for d in dicts]
