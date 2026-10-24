# RecoverRight System Architecture Document

## 1. System Vision & Clinical Objectives

RecoverRight is an enterprise-grade discharge-to-home clinical recovery management platform. The primary objective is to minimize post-discharge complications, emergency readmissions, and medication errors by transforming unstructured clinical discharge documentation into an evidence-backed, clinician-verified, and patient-actionable recovery plan.

---

## 2. Layered Architecture

RecoverRight is structured into four distinct, loosely coupled architectural layers:

### Layer 1: Ingestion, Extraction & Grounding Layer
- **Input Formats**: Electronic Discharge Summaries in PDF and Microsoft Word (DOCX) formats.
- **Parsing Engine (`app/pipeline/parse.py`)**: Reads block structures, paragraph hierarchies, document metadata, and extracts tabular layouts preserving exact column alignments and cell relationships.
- **Dual Independent Extractors (`app/pipeline/extract.py`)**:
  - `Model A` (e.g. `openai/gpt-oss-120b`) parses clinical entities with high semantic breadth.
  - `Model B` (e.g. `qwen/qwen3.8-27b`) independently verifies entity extractions.
- **Deterministic Table Parser (`app/pipeline/tables.py`)**: Extracts medication dosages, routes, frequencies, and durations directly from tabular layout geometry, entirely bypassing generative LLM hallucination risks.
- **Location-Based Grounding (`app/pipeline/ground.py` & `reconcile.py`)**:
  - Cross-references every extracted field with the exact character offsets and block identifiers in the source document.
  - Reconciles fields across Model A, Model B, and the deterministic table reader into four clinical statuses:
    - `agreed`: Fully substantiated by multiple sources.
    - `review`: Discrepancy in dose, frequency, or incomplete quote grounding requiring human verification.
    - `conflict`: Mutually contradictory prescriptions or directions.
    - `rejected`: Unsupported or hallucinated values discarded from clinical recommendations.

---

### Layer 2: Clinician Review & Decision Console (`/staff`)
- **Interactive Review Interface**:
  - Highlights exact text quotes in the source discharge summary.
  - Empowers nurses and doctors to confirm, edit, or reject individual candidate fields.
  - Implements strict blocking rules (`app/pipeline/review.py`): no plan may be finalized while conflicting or ungrounded fields remain undecided.
- **Role-Based Plan Approval (`POST /runs/{run_id}/approve`)**:
  - Captures clinician identity, clinical role (`Registered Nurse`, `Attending Physician`, `Pharmacist`), and approval notes.
  - Freezes approved plan into immutable versioned documents (`plan_v1.json`).
  - Supports controlled revisions (`reapprove`) that create consecutive versions (`plan_v2.json`) without mutating prior audit logs.

---

### Layer 3: Patient Recovery Companion & Family Portal
- **Tokenized Patient Routing (`/p/{token}`)**:
  - Passwordless, secure patient access tokens mapping to clinical discharge records.
  - Interactive daily task calendar covering medications, wound dressing, mobility routines, and diet.
  - Self-reported medication dose logging with auditable timestamps.
  - Multi-channel reminder engine (`app/services/reminder.py`) supporting In-App, SMS, and WhatsApp alerts with snooze capabilities.
- **Caregiver Recovery Portal (`/c/{token}`)**:
  - Consented family access with strict privacy boundaries (staff notes and internal clinical conflicts are hidden).
  - Recovery adherence monitoring and collaborative task assistance (`completed_by: "caregiver"`).
  - Emergency notification broadcasts dispatched upon critical patient distress.

---

### Layer 4: Voice Safety Assistant & Emergency Escalation
- **Continuous Voice Safety (`VoiceController.ts`)**:
  - Built-in watchdog timer, audio stream verification, exponential backoff, and text-overlap echo filtering.
  - Real-time bilingual support for Indian English and Hindi (Devanagari and Romanized).
- **Distress Detection (`detectDistress`)**:
  - Eager identification of critical symptoms (severe pain, respiratory failure, chest pain, hemorrhage).
  - Localized negation analysis ensuring real emergencies are not suppressed by unrelated negative words.
- **Emergency Escalation Inbox (`/staff/help`)**:
  - Real-time SLA queue (120s for critical distress, 600s for general concern).
  - One-click phone triage for patient or registered caregiver.
  - Doctor escalation workflows and structured clinical resolution logging.

---

## 3. Storage & Audit Architecture

RecoverRight utilizes a file-based storage architecture (`app/services/storage.py`) designed for clinical transparency, local inspectability, and horizontal scaling:

- **Directory Layout**:
  ```
  data/
  ├── patient_tokens.json       # Token to run_id mapping
  ├── caregiver_tokens.json     # Caregiver token to run_id mapping
  └── runs/
      └── {run_id}/
          ├── meta.json         # Run metadata, patient demographics, approval status
          ├── doc.json          # Parsed source document blocks and tables
          ├── plan_v1.json      # Immutable version 1 approved plan
          ├── plan_v2.json      # Version 2 approved plan (if revised)
          ├── tasks.json        # Recovery tasks and completion logs
          ├── doses.json        # Patient-reported dose ingestions
          ├── reminders.json    # Scheduled medication reminder jobs
          ├── notifications.json# Caregiver alerts dispatched
          └── audit.jsonl       # Immutable append-only clinical audit log
  ```
- **Thread Safety**: Run-level re-entrant locking (`threading.RLock`) guarantees atomic reads and writes.
- **Audit Logging**: Every action writes an append-only JSON line containing ISO-8601 UTC timestamp, actor role, action identifier, and sanitized metadata.
