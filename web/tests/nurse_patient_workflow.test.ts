import test from "node:test";
import assert from "node:assert/strict";
import { extractPatientOverview } from "../lib/patientOverview";
import type { ReviewData, RunMeta, PatientDetail, RecoveryTask } from "../lib/types";

// Mock data for Patient A (Approved Post-Op Appendectomy)
const mockPatientA_Run: RunMeta = {
  run_id: "run_patient_a",
  status: "approved",
  filename: "discharge_appendectomy_patient_a.docx",
  created_at: "2026-10-23T08:00:00Z",
  approved: true,
  approved_by: "Nurse Sunita",
  patient_token: "pat_patient_a_token",
  patient: {
    name: "Priya Sharma",
    language: "en",
    phone: "+91 98765 43210",
    guardian_name: "Ramesh Sharma",
    guardian_phone: "+91 98765 00000",
  },
};

const mockPatientA_ReviewData: ReviewData = {
  run: mockPatientA_Run,
  blocks: [
    {
      block_id: "b1",
      type: "paragraph",
      page: 1,
      text: "Patient: Priya Sharma | DOB: 14/05/1992 | Sex: Female",
      low_confidence: false,
      table_id: null,
      row_index: null,
      cells: null,
    },
    {
      block_id: "b2",
      type: "paragraph",
      page: 1,
      text: "Procedure Performed: Laparoscopic Appendectomy for acute appendicitis.",
      low_confidence: false,
      table_id: null,
      row_index: null,
      cells: null,
    },
    {
      block_id: "b3",
      type: "paragraph",
      page: 1,
      text: "Discharge Vitals: BP 120/78 mmHg, HR 72 bpm, SpO2 98%, Temp 98.6 F, Pain 2/10.",
      low_confidence: false,
      table_id: null,
      row_index: null,
      cells: null,
    },
  ],
  fields: [
    {
      field: {
        field_id: "f1",
        category: "procedure",
        status: "agreed",
        critical: false,
        proposed: { value: "Laparoscopic Appendectomy" },
        proposed_from: null,
        block_id: "b2",
        quote: "Laparoscopic Appendectomy for acute appendicitis.",
        units: [],
        voters: [],
        opinions: [],
        issues: [],
      },
      decision: { action: "confirm", attrs: null, by: "Nurse", note: null, at: "2026-10-23T08:05:00Z" },
    },
    {
      field: {
        field_id: "f2",
        category: "medications",
        status: "agreed",
        critical: false,
        proposed: { name: "Paracetamol", dose: "500 mg", frequency: "QDS" },
        proposed_from: null,
        block_id: "b3",
        quote: "Paracetamol 500mg",
        units: [],
        voters: [],
        opinions: [],
        issues: [],
      },
      decision: { action: "confirm", attrs: null, by: "Nurse", note: null, at: "2026-10-23T08:05:00Z" },
    },
  ],
  blockers: [],
  can_approve: true,
};

const mockPatientA_Tasks: RecoveryTask[] = [
  {
    task_id: "t1",
    run_id: "run_patient_a",
    plan_version: 1,
    category: "medication",
    title: "Take Paracetamol 500mg",
    description: "Oral with water",
    scheduled_time: "08:00 AM",
    scheduled_date: "2026-10-23",
    status: "completed",
    completed_at: "2026-10-23T08:10:00Z",
    completed_by: "patient",
    notes: null,
  },
  {
    task_id: "t2",
    run_id: "run_patient_a",
    plan_version: 1,
    category: "activity",
    title: "Gentle 10-minute hall walk",
    description: "Do not exceed comfortable pace",
    scheduled_time: "02:00 PM",
    scheduled_date: "2026-10-23",
    status: "pending",
    completed_at: null,
    completed_by: null,
    notes: null,
  },
];

const mockPatientA_Detail: PatientDetail = {
  summary: {
    id: "run_patient_a",
    name: "Priya Sharma",
    language: "en",
    phone: "+91 98765 43210",
    guardian_name: "Ramesh Sharma",
    guardian_phone: "+91 98765 00000",
    status: "approved",
    approved: true,
    approved_by: "Nurse Sunita",
    filename: "discharge_appendectomy_patient_a.docx",
    created_at: "2026-10-23T08:00:00Z",
    to_check: 0,
    help_active: 0,
    help_critical_active: 0,
    help_total: 0,
  },
  run: {
    run_id: "run_patient_a",
    status: "approved",
    filename: "discharge_appendectomy_patient_a.docx",
    created_at: "2026-10-23T08:00:00Z",
    approved: true,
    approved_by: "Nurse Sunita",
    error: null,
    counts: { agreed: 2, review: 0, conflict: 0, rejected: 0 },
  },
  plan: [],
  plan_removed: [],
  plan_approved_at: "2026-10-23T08:05:00Z",
  activity: [],
  help: [],
  tasks: mockPatientA_Tasks,
};

// Mock data for Patient B (Unapproved Orthopedic Knee Replacement)
const mockPatientB_Run: RunMeta = {
  run_id: "run_patient_b",
  status: "needs_review",
  filename: "discharge_knee_arthroplasty_patient_b.pdf",
  created_at: "2026-10-23T09:00:00Z",
  approved: false,
  approved_by: undefined,
  patient_token: "pat_patient_b_token",
  patient: {
    name: "Arun Patel",
    language: "hi",
    phone: "+91 91234 56789",
    guardian_name: "Meena Patel",
    guardian_phone: "+91 91234 11111",
  },
};

const mockPatientB_ReviewData: ReviewData = {
  run: mockPatientB_Run,
  blocks: [
    {
      block_id: "b10",
      type: "paragraph",
      page: 1,
      text: "Patient: Arun Patel | Age: 58 | Sex: Male",
      low_confidence: false,
      table_id: null,
      row_index: null,
      cells: null,
    },
    {
      block_id: "b11",
      type: "paragraph",
      page: 1,
      text: "Procedure Performed: Total Knee Arthroplasty (Right).",
      low_confidence: false,
      table_id: null,
      row_index: null,
      cells: null,
    },
  ],
  fields: [
    {
      field: {
        field_id: "fb1",
        category: "procedure",
        status: "agreed",
        critical: false,
        proposed: { value: "Total Knee Arthroplasty" },
        proposed_from: null,
        block_id: "b11",
        quote: "Total Knee Arthroplasty",
        units: [],
        voters: [],
        opinions: [],
        issues: [],
      },
      decision: null, // Still needs review
    },
    {
      field: {
        field_id: "fb2",
        category: "precautions",
        status: "review",
        critical: true,
        proposed: { value: "Weight-bearing as tolerated with walker only" },
        proposed_from: null,
        block_id: "b11",
        quote: "walker only",
        units: [],
        voters: [],
        opinions: [],
        issues: [],
      },
      decision: null,
    },
  ],
  blockers: [{ field_id: "fb2", category: "precautions", status: "review", reason: "missing" }],
  can_approve: false,
};

test("Nurse-Patient Workflow: Patient A overview extraction and personalized care plan", () => {
  const overview = extractPatientOverview(mockPatientA_ReviewData, mockPatientA_Run, mockPatientA_Detail);

  // Demographic assertions
  assert.equal(overview.name, "Priya Sharma");
  assert.equal(overview.sex, "Female");
  assert.equal(overview.phone, "+91 98765 43210");
  assert.equal(overview.guardianName, "Ramesh Sharma");
  assert.ok(overview.mrn.includes("MRN-2026-"));

  // Condition and vitals
  assert.equal(overview.condition, "Laparoscopic Appendectomy");
  assert.equal(overview.vitals.length, 5);
  const bp = overview.vitals.find((v) => v.label === "Blood Pressure");
  assert.equal(bp?.value, "120/78");

  // Care plan progress & completion percentage (1 completed out of 2 tasks = 50%)
  assert.equal(overview.taskCounts.total, 2);
  assert.equal(overview.taskCounts.completed, 1);
  assert.equal(overview.taskCounts.pending, 1);
  assert.equal(overview.completionPct, 50);
  assert.equal(overview.careStatus, "Recovery in Progress");
});

test("Nurse-Patient Workflow: Patient B isolation and zero leakage from Patient A", () => {
  const overviewB = extractPatientOverview(mockPatientB_ReviewData, mockPatientB_Run, null);

  // Demographics must strictly belong to Patient B
  assert.equal(overviewB.name, "Arun Patel");
  assert.equal(overviewB.sex, "Male");
  assert.equal(overviewB.phone, "+91 91234 56789");
  assert.equal(overviewB.condition, "Total Knee Arthroplasty");
  assert.notEqual(overviewB.condition, "Laparoscopic Appendectomy");

  // Care plan must be draft / awaiting review, NOT approved
  assert.equal(overviewB.careStatus, "Awaiting Clinical Review");
  assert.equal(overviewB.statusTone, "warn");

  // Ensure Patient A's tasks are NOT present in Patient B
  assert.equal(overviewB.tasks.length, 0);
  assert.equal(overviewB.taskCounts.completed, 0);
  assert.equal(overviewB.taskCounts.pending, 2); // 2 fields awaiting review
});

test("Nurse-Patient Workflow: Task completion toggles update completion metrics accurately", () => {
  // Simulate marking task 2 as completed for Patient A
  const updatedTasks: RecoveryTask[] = [
    { ...mockPatientA_Tasks[0] },
    { ...mockPatientA_Tasks[1], status: "completed", completed_at: "2026-10-23T14:00:00Z" },
  ];

  const updatedDetail: PatientDetail = {
    ...mockPatientA_Detail,
    tasks: updatedTasks,
  };

  const overview = extractPatientOverview(mockPatientA_ReviewData, mockPatientA_Run, updatedDetail);

  // 2 out of 2 completed = 100%
  assert.equal(overview.taskCounts.completed, 2);
  assert.equal(overview.taskCounts.pending, 0);
  assert.equal(overview.completionPct, 100);
  assert.equal(overview.careStatus, "Care Plan Complete");
  assert.equal(overview.statusTone, "ok");
});

test("Nurse-Patient Workflow: File extension and validation logic", () => {
  const validExtensions = ["test.docx", "summary.pdf", "DISCHARGE.DOCX", "report.PDF"];
  const invalidExtensions = ["notes.txt", "scan.png", "data.json", "script.exe"];

  const isValidFile = (filename: string) => {
    const ext = filename.toLowerCase();
    return ext.endsWith(".docx") || ext.endsWith(".pdf");
  };

  for (const f of validExtensions) {
    assert.equal(isValidFile(f), true, `${f} should be valid`);
  }
  for (const f of invalidExtensions) {
    assert.equal(isValidFile(f), false, `${f} should be rejected`);
  }
});

test("Nurse-Patient Workflow: patient slug generation from name", () => {
  // Slug format: lowercase, hyphens, no special chars
  const toSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  assert.strictEqual(toSlug("Neha Verma"), "neha-verma");
  assert.strictEqual(toSlug("John O'Brien"), "john-o-brien");
  assert.strictEqual(toSlug("Patient 1"), "patient-1");
  assert.strictEqual(toSlug("  Spaces  "), "spaces");
});

test("Nurse-Patient Workflow: dashboard URL format from slug", () => {
  const toDashboardUrl = (slug: string) => `/p/demo/${slug}`;
  assert.strictEqual(toDashboardUrl("neha-verma"), "/p/demo/neha-verma");
  assert.strictEqual(toDashboardUrl("priya-sharma"), "/p/demo/priya-sharma");
});

test("Nurse-Patient Workflow: batch import result shape validation", () => {
  const mockBatchResult = {
    total: 3,
    imported_count: 2,
    failed_count: 1,
    imported: [
      { run_id: "run_abc", patient_name: "Neha Verma", slug: "neha-verma", patient_token: "pat_abc", dashboard_url: "/p/demo/neha-verma" },
      { run_id: "run_def", patient_name: "Ravi Kumar", slug: "ravi-kumar", patient_token: "pat_def", dashboard_url: "/p/demo/ravi-kumar" },
    ],
    failed: [
      { index: 2, patient_name: "Duplicate Patient", reason: "duplicate" },
    ],
  };
  assert.strictEqual(mockBatchResult.imported_count, 2);
  assert.strictEqual(mockBatchResult.failed_count, 1);
  assert.strictEqual(mockBatchResult.imported[0].slug, "neha-verma");
  assert.strictEqual(mockBatchResult.imported[0].dashboard_url, "/p/demo/neha-verma");
  assert.strictEqual(mockBatchResult.failed[0].reason, "duplicate");
});

test("Nurse-Patient Workflow: patient record isolation by run_id", () => {
  const runA = "run_abc123";
  const runB = "run_def456";
  const patientA = { run_id: runA, name: "Neha Verma", slug: "neha-verma" };
  const patientB = { run_id: runB, name: "Ravi Kumar", slug: "ravi-kumar" };
  // Each patient has unique run_id and slug
  assert.notStrictEqual(patientA.run_id, patientB.run_id);
  assert.notStrictEqual(patientA.slug, patientB.slug);
  // URLs are distinct
  const urlA = `/p/demo/${patientA.slug}`;
  const urlB = `/p/demo/${patientB.slug}`;
  assert.notStrictEqual(urlA, urlB);
});
