import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStaffNavigation,
  extractPatientNameFromUtterance,
  isPronounUtterance,
  type StaffPatientRef,
  type StaffNavigationContext,
} from "../lib/voiceEngine.js";

const mockPatients: StaffPatientRef[] = [
  { id: "run_priya_1", name: "Priya Sharma", status: "needs_review", age: 42, condition: "Cholecystectomy" },
  { id: "run_rahul_1", name: "Rahul Verma", status: "approved", age: 58, condition: "Appendectomy" },
  { id: "run_aarav_1", name: "Aarav Sharma", status: "approved", age: 45, condition: "Total Knee Replacement" },
  { id: "run_sunita_1", name: "Sunita Patel", status: "approved", age: 62, condition: "Coronary Stent" },
];

const mockContext: StaffNavigationContext = {
  patients: mockPatients,
  runs: [
    { run_id: "run_priya_1", status: "needs_review", patient: { name: "Priya Sharma" } },
    { run_id: "run_rahul_1", status: "approved", patient: { name: "Rahul Verma" } },
  ],
  lang: "en",
};

test("staff voice navigation: patient navigation commands in English and Hindi", () => {
  // 1. "Open Priya's report."
  let res = resolveStaffNavigation("Open Priya's report", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");
  assert.equal(res.matchedPatient?.name, "Priya Sharma");

  // 2. "Open Priya's profile."
  res = resolveStaffNavigation("Open Priya's profile", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/patients/run_priya_1");

  // 3. "Show me Priya's details."
  res = resolveStaffNavigation("Show me Priya's details", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/patients/run_priya_1");

  // 4. "Open patient Priya Sharma."
  res = resolveStaffNavigation("Open patient Priya Sharma", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.id, "run_priya_1");

  // 5. "Go to Rahul's dashboard."
  res = resolveStaffNavigation("Go to Rahul's dashboard", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.name, "Rahul Verma");

  // 6. "Mujhe Priya ki report dikhao."
  res = resolveStaffNavigation("Mujhe Priya ki report dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 7. "Priya ki profile kholo."
  res = resolveStaffNavigation("Priya ki profile kholo", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/patients/run_priya_1");

  // 8. "Priya ka report open karo."
  res = resolveStaffNavigation("Priya ka report open karo", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 9. "Rahul ke patient details dikhao."
  res = resolveStaffNavigation("Rahul ke patient details dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/patients/run_rahul_1");
});

test("staff voice navigation: document and report navigation commands", () => {
  // 10. "Open the latest report for Priya."
  let res = resolveStaffNavigation("Open the latest report for Priya", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 11. "Show Priya's pending documents."
  res = resolveStaffNavigation("Show Priya's pending documents", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 12. "Open the document awaiting review."
  res = resolveStaffNavigation("Open the document awaiting review", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review"); // Priya has status needs_review

  // 13. "Show me the latest uploaded report."
  res = resolveStaffNavigation("Show me the latest uploaded report", mockContext);
  assert.equal(res.status, "navigated");

  // 14. "Priya ki latest report kholo."
  res = resolveStaffNavigation("Priya ki latest report kholo", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 15. "Priya ka pending document dikhao."
  res = resolveStaffNavigation("Priya ka pending document dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 16. "Review ke liye jo report pending hai, use kholo."
  res = resolveStaffNavigation("Review ke liye jo report pending hai, use kholo", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");
});

test("staff voice navigation: task, care plan, and dashboard navigation", () => {
  // 17. "Show Priya's care plan."
  let res = resolveStaffNavigation("Show Priya's care plan", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 18. "Open Rahul's pending tasks."
  res = resolveStaffNavigation("Open Rahul's pending tasks", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_rahul_1/review");

  // 19. "Which patients have incomplete care plans?"
  res = resolveStaffNavigation("Which patients have incomplete care plans?", mockContext);
  assert.equal(res.status, "query_answered");
  assert.equal(res.targetUrl, "/staff?tab=attention");

  // 20. "Priya ke pending tasks dikhao."
  res = resolveStaffNavigation("Priya ke pending tasks dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 21. "Kis patient ke tasks abhi pending hain?"
  res = resolveStaffNavigation("Kis patient ke tasks abhi pending hain?", mockContext);
  assert.equal(res.status, "query_answered");
  assert.equal(res.targetUrl, "/staff?tab=attention");

  // 22. "Priya ki progress dikhao."
  res = resolveStaffNavigation("Priya ki progress dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // 23. "Go to the staff dashboard."
  res = resolveStaffNavigation("Go to the staff dashboard", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff");

  // 24. "Show patient analytics."
  res = resolveStaffNavigation("Show patient analytics", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff?tab=analytics");

  // 25. "Open the reports section."
  res = resolveStaffNavigation("Open the reports section", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff?tab=analytics");

  // 26. "Dashboard par wapas jao."
  res = resolveStaffNavigation("Dashboard par wapas jao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff");

  // 27. "Patient analytics dikhao."
  res = resolveStaffNavigation("Patient analytics dikhao", mockContext);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff?tab=analytics");
});

test("staff voice navigation: context and pronoun follow-up commands", () => {
  const contextWithActive: StaffNavigationContext = {
    ...mockContext,
    activePatient: mockPatients[0], // Priya Sharma
  };

  // "Now show her care plan."
  let res = resolveStaffNavigation("Now show her care plan", contextWithActive);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.name, "Priya Sharma");
  assert.equal(res.targetUrl, "/staff/runs/run_priya_1/review");

  // "Show her pending tasks."
  res = resolveStaffNavigation("Show her pending tasks", contextWithActive);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.name, "Priya Sharma");

  // "Go back to her profile."
  res = resolveStaffNavigation("Go back to her profile", contextWithActive);
  assert.equal(res.status, "navigated");
  assert.equal(res.targetUrl, "/staff/patients/run_priya_1");

  // Hindi pronoun: "Uska care plan dikhao."
  res = resolveStaffNavigation("Uska care plan dikhao", contextWithActive);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.name, "Priya Sharma");

  // Hindi pronoun: "Uske pending tasks dikhao."
  res = resolveStaffNavigation("Uske pending tasks dikhao", contextWithActive);
  assert.equal(res.status, "navigated");
  assert.equal(res.matchedPatient?.name, "Priya Sharma");

  // Pronoun with NO active patient -> should prompt for clarification safely
  res = resolveStaffNavigation("Show her care plan", { ...mockContext, activePatient: null });
  assert.equal(res.status, "clarification_needed");
  assert.equal(res.targetUrl, undefined);
});

test("staff voice navigation: ambiguity and nonexistent patient safety handling", () => {
  const contextWithDuplicates: StaffNavigationContext = {
    patients: [
      { id: "run_priya_sharma", name: "Priya Sharma", age: 42 },
      { id: "run_priya_patel", name: "Priya Patel", age: 67 },
    ],
  };

  // Multiple Priyas -> must ask clarification rather than guessing randomly
  const resAmbiguous = resolveStaffNavigation("Open Priya's report", contextWithDuplicates);
  assert.equal(resAmbiguous.status, "ambiguous");
  assert.equal(resAmbiguous.candidates?.length, 2);
  assert.equal(resAmbiguous.targetUrl, undefined); // does NOT navigate blindly

  // Nonexistent patient -> must report not found truthfully without changing workspace
  const resNotFound = resolveStaffNavigation("Open John's report", mockContext);
  assert.equal(resNotFound.status, "not_found");
  assert.equal(resNotFound.targetUrl, undefined);
  assert.match(resNotFound.speechResponse.en, /John/);
});
