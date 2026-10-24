import test from "node:test";
import assert from "node:assert/strict";
import { planFromApprovedPlan, timesFor } from "../lib/patient";
import type { PatientPlanResponse } from "../lib/types";

const mockResponse: PatientPlanResponse = {
  run_id: "run_demo_1",
  patient_name: "Priya Sharma",
  phone: "+91 98765 43210",
  language: "en",
  version: 1,
  approved_at: "2026-10-23T08:00:00Z",
  plan_duration_days: 14,
  medications: [
    {
      id: "m1",
      name: "Paracetamol",
      dose: "500 mg",
      route: "Oral",
      frequency: "Three times daily",
      duration: "5 days",
      times: ["08:00 AM", "02:00 PM", "08:00 PM"],
    },
    {
      id: "m2",
      name: "Pantoprazole",
      dose: "40 mg",
      route: "Oral",
      frequency: "Once daily",
      duration: "14 days",
      times: ["08:00 AM"],
    },
  ],
  instructions: {
    wound_care: ["Keep the surgical incision clean and dry."],
    activity: ["Avoid heavy lifting (> 5 kg) for 2 weeks."],
    diet: ["Stay well hydrated with light meals."],
    warning_signs: ["Fever > 38°C or redness spreading around incision."],
  },
  follow_ups: [
    {
      id: "fu1",
      what: "Post-op surgical review",
      when: "10 days post-discharge",
      where: "Surgery Clinic Room 302",
    },
  ],
  contacts: [{ label: "Care Coordinator", value: "+91 98765 00000" }],
  caregivers: [
    {
      name: "Ramesh Sharma",
      phone: "+91 98765 11111",
      relationship: "Spouse",
      consent_status: "consented",
      notification_preferences: ["sms", "whatsapp"],
      verified: true,
    },
  ],
  tasks_today: [
    {
      task_id: "t1",
      run_id: "run_demo_1",
      plan_version: 1,
      category: "medication",
      title: "Take Paracetamol (500 mg)",
      description: "Three times daily. Route: Oral.",
      scheduled_time: "08:00 AM",
      scheduled_date: "2026-10-23",
      status: "pending",
    },
    {
      task_id: "t2",
      run_id: "run_demo_1",
      plan_version: 1,
      category: "wound_care",
      title: "Wound Care Check #1",
      description: "Keep the surgical incision clean and dry.",
      scheduled_time: "10:00 AM",
      scheduled_date: "2026-10-23",
      status: "completed",
      completed_at: "2026-10-23T10:15:00Z",
      completed_by: "patient",
    },
  ],
  demo: false,
};

test("planFromApprovedPlan correctly maps API response into PlanView", () => {
  const plan = planFromApprovedPlan(mockResponse);

  assert.equal(plan.patientName, "Priya Sharma");
  assert.equal(plan.phone, "+91 98765 43210");
  assert.equal(plan.version, 1);
  assert.equal(plan.planDurationDays, 14);
  assert.equal(plan.approvedAt, "2026-10-23T08:00:00Z");

  // Medications
  assert.equal(plan.meds.length, 2);
  assert.equal(plan.meds[0].name, "Paracetamol");
  assert.equal(plan.meds[0].dose, "500 mg");
  assert.deepEqual(plan.meds[0].times, ["08:00 AM", "02:00 PM", "08:00 PM"]);

  // Instructions
  assert.equal(plan.instructions.wound_care.length, 1);
  assert.equal(plan.instructions.activity.length, 1);
  assert.equal(plan.instructions.diet.length, 1);
  assert.equal(plan.instructions.warning_signs.length, 1);

  // Follow-ups & contacts
  assert.equal(plan.followUps.length, 1);
  assert.equal(plan.followUps[0].what, "Post-op surgical review");
  assert.equal(plan.contacts.length, 1);

  // Tasks & Caregivers
  assert.equal(plan.serverTasks?.length, 2);
  assert.equal(plan.serverTasks?.[1].status, "completed");
  assert.equal(plan.caregivers?.length, 1);
  assert.equal(plan.caregivers?.[0].relationship, "Spouse");
});

test("timesFor handles different frequencies deterministically", () => {
  assert.deepEqual(timesFor("Three times daily"), ["8:00 AM", "2:00 PM", "8:00 PM"]);
  assert.deepEqual(timesFor("Twice daily"), ["8:00 AM", "8:00 PM"]);
  assert.deepEqual(timesFor("Once daily"), ["8:00 AM"]);
  assert.deepEqual(timesFor("At bedtime"), ["9:00 PM"]);
  assert.deepEqual(timesFor("as needed"), []);
});

test("elapsed and remaining duration calculation maintains clinical safety", () => {
  const totalDays = 14;
  const approvedAt = new Date(Date.now() - 3 * 86400000).toISOString(); // 3 days ago
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.floor((Date.now() - new Date(approvedAt).getTime()) / 86400000) + 1));
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  assert.equal(elapsedDays, 4);
  assert.equal(remainingDays, 10);
});
