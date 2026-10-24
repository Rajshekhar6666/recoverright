# RecoverRight Clinical Safety & Compliance Protocol

## 1. Core Clinical Safety Principles

RecoverRight enforces five core safety pillars:

1. **Zero Hallucination Tolerance**: LLMs never unilaterally decide a patient's prescription or discharge instructions. Any entity lacking deterministic grounding or consensus between dual extractors is forced into clinical review.
2. **Clinician in the Loop**: Patient recovery plans cannot be published, and reminders cannot be scheduled, without explicit digital sign-off from an authorized healthcare professional.
3. **Immutability of Historical Plans**: Once approved, recovery plans are frozen. Any updates create a new version (`v2`, `v3`) while preserving prior versions for historical medical review.
4. **Immediate Emergency Escalation**: Patient voice distress signals bypass all intermediary queues and directly ring the staff emergency triage desk within strict target SLAs.
5. **Zero Secret and PHI Leakage**: Sensitive API credentials, passwords, and authorization tokens are strictly scrubbed before audit logs are persisted to storage.

---

## 2. Extraction & Reconciliation Safety Guardrails

| Condition | Outcome | Action Required |
|---|---|---|
| Model A and Model B agree with document source | `agreed` | Auto-staged for clinician review; 1-click confirmation available. |
| Model A and Model B disagree on dose / frequency | `review` | **BLOCKER**: Clinician must select or edit the verified dosage. |
| Deterministic table reader differs from LLM output | Table Reader Wins | Table data is prioritized; discrepancies are highlighted for clinician review. |
| Hallucinated field not found in source text | `rejected` | Field cannot be added to patient plan without manual clinician quote override. |
| Unresolved blockers at approval attempt | `HTTP 409 Conflict` | Approval is strictly rejected until all blockers are resolved. |

---

## 3. Voice Safety & Distress Detection

### 3.1 Severity Levels and Response Protocols
- **Critical Severity**:
  - Triggers: Severe chest pain, breathing difficulty, hemorrhage/heavy bleeding, unconsciousness, severe pain (>= 8/10), ambulance requests.
  - Escalation SLA: **120 seconds** target time to staff triage response.
  - Emergency Broadcast: Dispatches priority SMS and WhatsApp alerts to consented family caregivers.
- **Concern Severity**:
  - Triggers: Dizziness, nausea, vomiting, fever, general unwellness, questions about wound appearance.
  - Escalation SLA: **600 seconds** (10 minutes) target time to clinician response.

### 3.2 Local Negation Safety Rules
- **Rule 1 (Isolated Negation)**: "No chest pain today" or "I am not bleeding" does NOT trigger an emergency.
- **Rule 2 (Complex Negation)**: "I have no knee pain, but I cannot breathe" correctly identifies "cannot breathe" as an active emergency despite the preceding "no".
- **Rule 3 (Self-Negating Symptoms)**: Phrases like "can't catch my breath" or "cannot breathe" contain negative particles ("can't", "not") but represent affirmative distress and must always escalate.

---

## 4. Caregiver Privacy & Consent Protocol

- **Patient Autonomy**: Patients retain ownership over caregiver access; access can be revoked at any time (`POST /caregivers/{token}/consent`).
- **Data Minimization**: Caregivers can view medications, daily tasks, and general discharge instructions, but cannot view internal clinical debate, ungrounded raw discharge fields, or staff private notes.
- **Attribution Distinction**: Actions taken by caregivers (such as marking tasks complete or confirming medication intake) are explicitly tagged `completed_by: "caregiver"` in the clinical audit trail to preserve clinical provenance.

---

## 5. Compliance & Audit Verification

- **Automated Verification**: The repository includes `python -m scripts.verify_audit` to mathematically scan all `audit.jsonl` files and verify:
  - Strict JSON validity across 100% of records.
  - Required fields present (`ts`, `actor`, `action`).
  - Zero regex matches for API keys, bearer tokens, or plaintext credentials.
  - Consistent ISO-8601 UTC timestamps.
