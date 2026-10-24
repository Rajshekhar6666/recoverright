"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

export type SupportedLang = "en" | "hi";

export interface Translations {
  // Navigation & Shell
  navPatients: string;
  navDischargeIntake: string;
  navHelpInbox: string;
  navLiveTheater: string;
  navSearchPlaceholder: string;
  activeWorkspace: string;
  switchPatient: string;
  backToPatients: string;
  backToDashboard: string;

  // Language switcher
  language: string;
  english: string;
  hindi: string;

  // Dashboard & Queue
  dashboardTitle: string;
  dashboardSub: string;
  totalPatients: string;
  needsReview: string;
  approved: string;
  activeHelpRequests: string;
  thPatient: string;
  thPhone: string;
  thPlanStatus: string;
  thChecks: string;
  thHelp: string;
  thAdded: string;
  newDischarge: string;

  // Patient Overview Panel
  patientOverview: string;
  sourceDocument: string;
  openOriginal: string;
  primaryConcern: string;
  intakeRecord: string;
  patientContact: string;
  caregiverContact: string;
  clinicalObservations: string;
  vitalsLatestAssessment: string;
  bloodPressure: string;
  heartRate: string;
  oxygenSat: string;
  temperature: string;
  painScore: string;
  normotensive: string;
  normalRhythm: string;
  roomAir: string;
  afebrile: string;
  mildControlled: string;

  // Care Plan Progress & Tasks
  carePlanProgress: string;
  tasksCompleted: string;
  tasksPending: string;
  tasksOverdue: string;
  percentCompleted: (pct: number) => string;
  patientRecoveryTasks: string;
  taskToggleHint: string;
  draftCarePlanAwaiting: string;
  draftCarePlanNotice: (count: number) => string;
  taskNoticeUpdated: (title: string) => string;
  updating: string;

  // Alerts & Follow-up
  alertsAndFollowUp: string;
  warningSignsTitle: string;
  scheduledFollowUp: string;
  recentActivity: string;
  latestUpdate: string;
  openHelpCount: (count: number) => string;
  openHelpDetail: string;

  // Actions & Buttons
  addDocument: string;
  viewOriginalDocument: string;
  approvePlan: string;
  planApprovedNotice: string;
  revisePlan: string;
  patientApp: string;
  cancel: string;
  save: string;
  close: string;
  retryProcessing: string;

  // Review & Decisions
  todoTab: (count: number) => string;
  doneTab: (count: number) => string;
  allTab: (count: number) => string;
  confirmAction: string;
  editAction: string;
  rejectAction: string;
  allDecidedTitle: string;
  allDecidedSub: string;

  // Document Upload Modal
  addDocumentTitle: string;
  addDocumentSub: (name: string) => string;
  documentType: string;
  patientAssociation: string;
  uploadFileTab: string;
  manualEntryTab: string;
  dropDocumentPrompt: string;
  dropDocumentSub: string;
  loadSampleDocument: string;
  loadSampleSub: string;
  manualProcedureLabel: string;
  manualMedicationLabel: string;
  manualWarningLabel: string;
  manualFollowUpLabel: string;
  uploadAndOpenReview: string;
  processingDocument: string;
  processingSub: string;

  // Voice Assistant States
  voiceAssistant: string;
  voiceReady: string;
  voiceListening: string;
  voiceProcessing: string;
  voiceCommandRecognized: string;
  voiceCompleted: string;
  voiceClarificationNeeded: string;
  voiceClarificationRequired: string;
  voiceNavigationCompleted: string;
  voicePatientNotFound: string;
  voiceNotUnderstood: string;
  voiceMicUnavailable: string;
  voiceError: string;
  voiceHeard: string;
  voiceTranscriptPlaceholder: string;
  voiceSpeakHint: string;
  voiceStaffNavHint: string;
  voiceStartListening: string;
  voiceStopListening: string;

  // Clinical Analytics
  navClinicalAnalytics: string;
  tabDischargePlans: string;
  tabClinicalAnalytics: string;
  patientsRequiringAttention: string;
  carePlansInProgress: string;
  avgCarePlanCompletion: string;
  pendingTasksCount: string;
  documentsAwaitingReview: string;
  documentsProcessed: string;
  carePlanCompletionChart: string;
  taskStatusDistribution: string;
  documentWorkflow: string;
  filterAllPatients: string;
  filterAttentionOnly: string;
  openWorkspaceAction: string;

  // Common Statuses
  statusApproved: string;
  statusNeedsReview: string;
  statusProcessing: string;
  statusFailed: string;
  statusComplete: string;
  statusRecoveryInProgress: string;
  statusDraftReview: string;

  // Patient Companion Keys
  ptRecoveryPlan: string;
  ptEncouragement: string;
  ptTodayProgress: string;
  ptCompletedOf: (d: number, t: number) => string;
  ptDayProgress: (el: number, tot: number, rem: number) => string;
  ptDurationDisclaimer: string;
  ptYourTasks: string;
  ptVoiceHint: string;
  ptMedications: string;
  ptAppointments: string;
  ptInstructions: string;
  ptNeedHelp: string;
  ptHelpNow: string;
  ptCallCare: string;
  ptSendMessage: string;
  ptDone: string;
  ptMarkDone: string;
  ptNeedsAttention: string;
  ptYourCareTeam: string;
  ptSafePlanChecked: string;
  ptWoundCare: string;
  ptActivity: string;
  ptDiet: string;
  ptWarningSigns: string;
  ptNoMedsFound: string;
  ptNoApptsFound: string;
  ptCallNow: string;
  ptAskApptDate: string;
  ptRescheduleAppt: string;
  ptSensitivity: string;
  ptHigh: string;
  ptStandard: string;
  ptSpokenReplies: string;
  ptTurnOffListening: string;
  ptTurnOnVoice: string;
  ptMicTurnedOff: string;
  ptBrowserSpeechNotice: string;
  ptEmergencyNotice: string;
  ptHaveQuestion: string;
  ptMessageCareTeamTitle: string;
  ptWriteWhatYouNeed: string;
  ptSend: string;
  ptCancel: string;
  ptTaken: string;
  ptLater: string;
  ptTimeFor: (name: string, dose?: string | null) => string;
  ptDueAt: (time: string) => string;

  // Real-Time Calling System
  callPatient: string;
  callCareTeam: string;
  callNurse: string;
  incomingCall: string;
  incomingCallFrom: (name: string) => string;
  acceptCall: string;
  declineCall: string;
  endCall: string;
  muteMic: string;
  unmuteMic: string;
  mutedStatus: string;
  callingPatient: string;
  callingCareTeam: string;
  ringingStatus: string;
  connectingAudio: string;
  callConnected: string;
  callEnded: string;
  callDeclined: string;
  patientOffline: string;
  staffOffline: string;
  micPermissionRequired: string;
  callDuration: string;
  patientOnlineStatus: string;
  patientOfflineStatus: string;
  callHistoryTitle: string;
  noCallsYet: string;
  dockCall: string;
  expandCall: string;

  // AI Pill Camera Scanner
  pillScannerTitle: string;
  pillScannerSubtitle: string;
  pillScanBtn: string;
  pillScanInstruction: string;
  pillCameraPrompt: string;
  pillCapturePhoto: string;
  pillRetakePhoto: string;
  pillUploadPhoto: string;
  pillSampleStripsTitle: string;
  pillStatusVerified: string;
  pillStatusWarning: string;
  pillStatusMismatch: string;
  pillStatusUnrecognized: string;
  pillPrescriptionMatch: string;
  pillDosageDetected: string;
  pillScheduledFor: string;
  pillInstructions: string;
  pillConfirmDose: string;
  pillSafetyAlertHeader: string;
  pillDoNotTake: string;
  pillReplayAudio: string;
  pillScanningInProgress: string;
}

const en: Translations = {
  // Navigation & Shell
  navPatients: "Patients",
  navDischargeIntake: "Discharge Intake",
  navHelpInbox: "Help Inbox",
  navLiveTheater: "Live Theater",
  navSearchPlaceholder: "Search patients by name, phone or document…",
  activeWorkspace: "Active Workspace",
  switchPatient: "Switch Patient",
  backToPatients: "← Patients",
  backToDashboard: "← Dashboard",

  // Language switcher
  language: "Language",
  english: "English",
  hindi: "हिन्दी",

  // Dashboard & Queue
  dashboardTitle: "Clinical Patient Directory",
  dashboardSub: "Real-time post-discharge recovery monitoring, verified care plans, and emergency alerts.",
  totalPatients: "Total Patients",
  needsReview: "Needs Review",
  approved: "Approved",
  activeHelpRequests: "Active Help Requests",
  thPatient: "Patient",
  thPhone: "Phone",
  thPlanStatus: "Plan Status",
  thChecks: "Clinical Checks",
  thHelp: "Patient Help",
  thAdded: "Added",
  newDischarge: "New Discharge",

  // Patient Overview Panel
  patientOverview: "Patient Overview",
  sourceDocument: "Source Document",
  openOriginal: "Open original",
  primaryConcern: "Primary Health Concern / Procedure",
  intakeRecord: "Intake Record",
  patientContact: "Patient Contact",
  caregiverContact: "Caregiver / Guardian",
  clinicalObservations: "Clinical Observations & Vital Signs",
  vitalsLatestAssessment: "Latest clinical nursing assessment",
  bloodPressure: "Blood Pressure",
  heartRate: "Heart Rate",
  oxygenSat: "SpO2 (Oxygen)",
  temperature: "Temperature",
  painScore: "Pain Score",
  normotensive: "Resting, normotensive",
  normalRhythm: "Normal sinus rhythm",
  roomAir: "Room air",
  afebrile: "Afebrile",
  mildControlled: "Mild, well-controlled",

  // Care Plan Progress & Tasks
  carePlanProgress: "Care Plan Progress & Tasks",
  tasksCompleted: "Completed",
  tasksPending: "Pending",
  tasksOverdue: "Inactive / Overdue",
  percentCompleted: (pct) => `${pct}% Completed`,
  patientRecoveryTasks: "Patient Recovery Tasks",
  taskToggleHint: "Click checkbox to toggle nurse verification",
  draftCarePlanAwaiting: "Draft Care Plan Awaiting Nurse Approval",
  draftCarePlanNotice: (count) =>
    `This plan has ${count} extracted clinical recommendations. Review and confirm items in the right panel to publish the recovery plan.`,
  taskNoticeUpdated: (title) => `Task "${title}" updated.`,
  updating: "Updating…",

  // Alerts & Follow-up
  alertsAndFollowUp: "Alerts & Clinical Follow-up",
  warningSignsTitle: "Warning Signs to Monitor",
  scheduledFollowUp: "Scheduled Follow-Up Care",
  recentActivity: "Recent Activity & Clinical Updates",
  latestUpdate: "Latest Update",
  openHelpCount: (count) => `${count} Open Help Request(s)`,
  openHelpDetail: "Patient requested clinical assistance from recovery app",

  // Actions & Buttons
  addDocument: "Add Document",
  viewOriginalDocument: "View Original Document",
  approvePlan: "Approve plan",
  planApprovedNotice: "Plan approved and locked! Recovery tasks and patient access are active.",
  revisePlan: "Revise plan",
  patientApp: "Patient app",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  retryProcessing: "Retry processing",

  // Review & Decisions
  todoTab: (count) => `To do · ${count}`,
  doneTab: (count) => `Done · ${count}`,
  allTab: (count) => `All · ${count}`,
  confirmAction: "Confirm",
  editAction: "Edit",
  rejectAction: "Reject",
  allDecidedTitle: "Everything has a decision",
  allDecidedSub: "Review the pre-accepted items under All, then approve.",

  // Document Upload Modal
  addDocumentTitle: "Add Patient Document",
  addDocumentSub: (name) => `Record and verify a clinical document for ${name}`,
  documentType: "Document Type",
  patientAssociation: "Patient Association",
  uploadFileTab: "Upload File (.docx / .pdf)",
  manualEntryTab: "Manual Entry Fallback",
  dropDocumentPrompt: "Drop discharge summary or operative report here",
  dropDocumentSub: "Supports .docx and .pdf clinical documents",
  loadSampleDocument: "Load Sample Clinical Discharge Document",
  loadSampleSub: "Instantly prepares a realistic document for demo evaluation",
  manualProcedureLabel: "Procedure / Diagnosis *",
  manualMedicationLabel: "Medication Orders",
  manualWarningLabel: "Warning Signs & Precautions",
  manualFollowUpLabel: "Follow-Up Instructions",
  uploadAndOpenReview: "Upload & Open Review",
  processingDocument: "Processing Clinical Document",
  processingSub: "Validating clinical safety rules and building verification cards…",

  // Voice Assistant States
  voiceAssistant: "Voice Companion",
  voiceReady: "Ready to listen",
  voiceListening: "Listening… Speak normally",
  voiceProcessing: "Processing command…",
  voiceCommandRecognized: "Command recognized",
  voiceCompleted: "Action completed successfully",
  voiceClarificationNeeded: "Clarification needed",
  voiceClarificationRequired: "Clarification required",
  voiceNavigationCompleted: "Navigation completed",
  voicePatientNotFound: "Patient or report not found",
  voiceNotUnderstood: "Command not understood. Please try again.",
  voiceMicUnavailable: "Microphone unavailable or permission denied",
  voiceError: "Speech recognition error",
  voiceHeard: "I heard",
  voiceTranscriptPlaceholder: "Listening for normal speech… Speak now",
  voiceSpeakHint: "Try: “Mark Paracetamol complete”, “Show care plan”, or “Call nurse”",
  voiceStaffNavHint: "Try: “Open Priya's report”, “Show patient analytics”, or “Open Rahul's pending tasks”",
  voiceStartListening: "Start Voice",
  voiceStopListening: "Stop Voice",

  // Clinical Analytics
  navClinicalAnalytics: "Clinical Analytics",
  tabDischargePlans: "Discharge Plans",
  tabClinicalAnalytics: "Clinical Analytics",
  patientsRequiringAttention: "Patients Requiring Attention",
  carePlansInProgress: "Care Plans in Progress",
  avgCarePlanCompletion: "Avg Care Plan Completion",
  pendingTasksCount: "Pending & Overdue Tasks",
  documentsAwaitingReview: "Documents Awaiting Review",
  documentsProcessed: "Documents Processed",
  carePlanCompletionChart: "Care Plan Completion",
  taskStatusDistribution: "Task Status Distribution",
  documentWorkflow: "Document Workflow Lifecycle",
  filterAllPatients: "All Patients",
  filterAttentionOnly: "Attention Required",
  openWorkspaceAction: "Open Workspace",

  // Common Statuses
  statusApproved: "Approved",
  statusNeedsReview: "Needs Review",
  statusProcessing: "Processing",
  statusFailed: "Failed",
  statusComplete: "Care Plan Complete",
  statusRecoveryInProgress: "Recovery in Progress",
  statusDraftReview: "Awaiting Clinical Review",

  // Patient Companion Keys
  ptRecoveryPlan: "Your recovery plan",
  ptEncouragement: "Small steps every day lead to steady progress.",
  ptTodayProgress: "Today’s progress",
  ptCompletedOf: (d: number, t: number) => `${d} of ${t} tasks completed`,
  ptDayProgress: (el: number, tot: number, rem: number) => `Day ${el} of ${tot} planned days · ~${rem} days remaining`,
  ptDurationDisclaimer: "Planned duration is an estimated recovery timeline from your care team, not a guarantee of clinical recovery.",
  ptYourTasks: "Your tasks",
  ptVoiceHint: "Say “task 1 done” or “I took my medicine”",
  ptMedications: "My medications",
  ptAppointments: "Upcoming appointments",
  ptInstructions: "Important care instructions",
  ptNeedHelp: "Need help?",
  ptHelpNow: "I need help now",
  ptCallCare: "Call care team",
  ptSendMessage: "Send a message",
  ptDone: "Done",
  ptMarkDone: "Mark done",
  ptNeedsAttention: "Needs attention",
  ptYourCareTeam: "Your care team",
  ptSafePlanChecked: "Your plan was checked and approved by your care team.",
  ptWoundCare: "Wound care",
  ptActivity: "Activity and movement",
  ptDiet: "Diet and hydration",
  ptWarningSigns: "Warning signs",
  ptNoMedsFound: "No medicines were found on your plan.",
  ptNoApptsFound: "No follow-up appointments on your plan.",
  ptCallNow: "Call now",
  ptAskApptDate: "Ask for your appointment date",
  ptRescheduleAppt: "Need to change or reschedule?",
  ptSensitivity: "Sensitivity",
  ptHigh: "High",
  ptStandard: "Standard",
  ptSpokenReplies: "Spoken replies",
  ptTurnOffListening: "Turn off listening",
  ptTurnOnVoice: "Turn on voice",
  ptMicTurnedOff: "The microphone is off. Tap once so I can listen for you.",
  ptBrowserSpeechNotice: "Your browser’s speech service processes what you say. Keep this page open with the screen on.",
  ptEmergencyNotice: "In an emergency, call your local emergency number.",
  ptHaveQuestion: "Have a question, need assistance, or feeling unwell?",
  ptMessageCareTeamTitle: "Message your care team",
  ptWriteWhatYouNeed: "Write what you need",
  ptSend: "Send",
  ptCancel: "Cancel",
  ptTaken: "Taken",
  ptLater: "Later",
  ptTimeFor: (name: string, dose?: string | null) => `Time for ${name}${dose ? ` ${dose}` : ""}`,
  ptDueAt: (time: string) => `Due ${time}. Say “I took it” or “not yet”.`,

  // Real-Time Calling System
  callPatient: "Call Patient",
  callCareTeam: "Call Care Team",
  callNurse: "Call Nurse",
  incomingCall: "Incoming Audio Call",
  incomingCallFrom: (name: string) => `Incoming call from ${name}`,
  acceptCall: "Accept",
  declineCall: "Decline",
  endCall: "End Call",
  muteMic: "Mute",
  unmuteMic: "Unmute",
  mutedStatus: "Muted",
  callingPatient: "Calling patient...",
  callingCareTeam: "Calling care team...",
  ringingStatus: "Ringing on patient device...",
  connectingAudio: "Connecting secure audio...",
  callConnected: "Call Connected",
  callEnded: "Call ended",
  callDeclined: "Call declined",
  patientOffline: "Patient is currently offline",
  staffOffline: "Care team is currently offline",
  micPermissionRequired: "Microphone permission required",
  callDuration: "Duration",
  patientOnlineStatus: "Online",
  patientOfflineStatus: "Offline",
  callHistoryTitle: "Call History",
  noCallsYet: "No calls recorded yet",
  dockCall: "Minimize",
  expandCall: "Expand",

  // AI Pill Camera Scanner
  pillScannerTitle: "AI Pill Camera Scanner",
  pillScannerSubtitle: "Point camera at your medicine strip or bottle to verify dosage and safety.",
  pillScanBtn: "Scan Pill Bottle",
  pillScanInstruction: "Align medicine name and dosage within the frame",
  pillCameraPrompt: "Position strip label inside the viewfinder",
  pillCapturePhoto: "Capture & Verify",
  pillRetakePhoto: "Scan Another",
  pillUploadPhoto: "Upload Image",
  pillSampleStripsTitle: "Quick Demo Samples (Judges Presentation)",
  pillStatusVerified: "Verified Prescription Match",
  pillStatusWarning: "SAFETY WARNING: Not Prescribed",
  pillStatusMismatch: "Attention: Dosage Mismatch",
  pillStatusUnrecognized: "Label Not Recognized",
  pillPrescriptionMatch: "Prescription Match",
  pillDosageDetected: "Detected Strength",
  pillScheduledFor: "Scheduled Time",
  pillInstructions: "Administration Advice",
  pillConfirmDose: "✓ Confirm & Mark Dose Taken",
  pillSafetyAlertHeader: "Clinical Safety Warning",
  pillDoNotTake: "⚠️ Do Not Ingest This Medication",
  pillReplayAudio: "Listen to Voice Instructions",
  pillScanningInProgress: "Analyzing medicine label...",
};

const hi: Translations = {
  // Navigation & Shell
  navPatients: "मरीज़",
  navDischargeIntake: "डिस्चार्ज दस्तावेज़",
  navHelpInbox: "मदद अनुरोध (इनबॉक्स)",
  navLiveTheater: "लाइव थिएटर",
  navSearchPlaceholder: "मरीज़ का नाम, फोन या दस्तावेज़ खोजें…",
  activeWorkspace: "सक्रिय कार्यक्षेत्र",
  switchPatient: "मरीज़ बदलें",
  backToPatients: "← मरीज़ सूची",
  backToDashboard: "← डैशबोर्ड",

  // Language switcher
  language: "भाषा",
  english: "English",
  hindi: "हिन्दी",

  // Dashboard & Queue
  dashboardTitle: "मरीज़ स्वास्थ्य डैशबोर्ड",
  dashboardSub: "डिस्चार्ज के बाद रिकवरी की वास्तविक समय में निगरानी, देखभाल योजना और आपातकालीन अलर्ट।",
  totalPatients: "कुल मरीज़",
  needsReview: "समीक्षा बाकी",
  approved: "स्वीकृत",
  activeHelpRequests: "सक्रिय मदद अनुरोध",
  thPatient: "मरीज़",
  thPhone: "फ़ोन",
  thPlanStatus: "योजना स्थिति",
  thChecks: "चिकित्सीय जाँच",
  thHelp: "मदद अनुरोध",
  thAdded: "दिनांक",
  newDischarge: "नया डिस्चार्ज",

  // Patient Overview Panel
  patientOverview: "मरीज़ की जानकारी",
  sourceDocument: "मूल दस्तावेज़",
  openOriginal: "मूल खोलें",
  primaryConcern: "मुख्य स्वास्थ्य स्थिति / प्रक्रिया",
  intakeRecord: "अस्पताल रिकॉर्ड",
  patientContact: "मरीज़ का संपर्क",
  caregiverContact: "देखभालकर्ता / अभिभावक",
  clinicalObservations: "चिकित्सीय अवलोकन एवं वाइटल्स",
  vitalsLatestAssessment: "नर्सिंग टीम द्वारा नवीनतम चिकित्सीय जाँच",
  bloodPressure: "रक्तचाप (BP)",
  heartRate: "हृदय गति (Pulse)",
  oxygenSat: "ऑक्सीजन स्तर (SpO2)",
  temperature: "शरीर का तापमान",
  painScore: "दर्द का स्तर",
  normotensive: "सामान्य, नियंत्रित",
  normalRhythm: "सामान्य लय",
  roomAir: "सामान्य वायु पर",
  afebrile: "बुखार रहित",
  mildControlled: "हल्का, नियंत्रित",

  // Care Plan Progress & Tasks
  carePlanProgress: "देखभाल योजना एवं प्रगति",
  tasksCompleted: "पूरे हुए कार्य",
  tasksPending: "बाकी कार्य",
  tasksOverdue: "विलंबित / निष्क्रिय",
  percentCompleted: (pct) => `${pct}% पूर्ण`,
  patientRecoveryTasks: "मरीज़ के रिकवरी कार्य",
  taskToggleHint: "नर्स सत्यापन के लिए चेकबॉक्स पर क्लिक करें",
  draftCarePlanAwaiting: "प्रारूप योजना - नर्स की मंज़ूरी प्रतीक्षित",
  draftCarePlanNotice: (count) =>
    `इस योजना में ${count} चिकित्सीय सिफ़ारिशें निकाली गई हैं। योजना प्रकाशित करने के लिए दायें पैनल में पुष्टि करें।`,
  taskNoticeUpdated: (title) => `कार्य "${title}" अद्यतन किया गया।`,
  updating: "अद्यतन हो रहा है…",

  // Alerts & Follow-up
  alertsAndFollowUp: "अलर्ट एवं फॉलो-अप परामर्श",
  warningSignsTitle: "निगरानी योग्य खतरे के संकेत",
  scheduledFollowUp: "निर्धारित फॉलो-अप परामर्श",
  recentActivity: "हाल की गतिविधि एवं चिकित्सीय अपडेट",
  latestUpdate: "नवीनतम अपडेट",
  openHelpCount: (count) => `${count} सक्रिय मदद अनुरोध`,
  openHelpDetail: "मरीज़ ने रिकवरी ऐप से सहायता का अनुरोध किया है",

  // Actions & Buttons
  addDocument: "दस्तावेज़ जोड़ें",
  viewOriginalDocument: "मूल दस्तावेज़ देखें",
  approvePlan: "योजना स्वीकृत करें",
  planApprovedNotice: "देखभाल योजना स्वीकृत एवं लॉक की गई! कार्य और ऐप पहुंच सक्रिय हैं।",
  revisePlan: "योजना संशोधित करें",
  patientApp: "मरीज़ ऐप",
  cancel: "रद्द करें",
  save: "सहेजें",
  close: "बंद करें",
  retryProcessing: "पुनः प्रयास करें",

  // Review & Decisions
  todoTab: (count) => `निर्णय बाकी · ${count}`,
  doneTab: (count) => `पूर्ण · ${count}`,
  allTab: (count) => `सभी · ${count}`,
  confirmAction: "स्वीकार करें",
  editAction: "संपादित करें",
  rejectAction: "हटाएं",
  allDecidedTitle: "सभी निर्णयों की समीक्षा हो चुकी है",
  allDecidedSub: "'सभी' के तहत स्वीकृत वस्तुओं की समीक्षा करें, फिर मंज़ूरी दें।",

  // Document Upload Modal
  addDocumentTitle: "मरीज़ दस्तावेज़ जोड़ें",
  addDocumentSub: (name) => `${name} के लिए चिकित्सीय दस्तावेज़ दर्ज एवं सत्यापित करें`,
  documentType: "दस्तावेज़ का प्रकार",
  patientAssociation: "मरीज़ से संबंध",
  uploadFileTab: "फ़ाइल अपलोड करें (.docx / .pdf)",
  manualEntryTab: "मैन्युअल प्रविष्टि विकल्प",
  dropDocumentPrompt: "डिस्चार्ज सारांश या ऑपरेशन नोट यहाँ खींचकर छोड़ें",
  dropDocumentSub: ".docx और .pdf फ़ाइलें समर्थित हैं",
  loadSampleDocument: "नमूना डिस्चार्ज दस्तावेज़ लोड करें",
  loadSampleSub: "डेमो मूल्यांकन के लिए त्वरित दस्तावेज़ तैयार करता है",
  manualProcedureLabel: "प्रक्रिया / रोग निदान *",
  manualMedicationLabel: "दवाइयों के निर्देश",
  manualWarningLabel: "चेतावनी संकेत एवं सावधानियाँ",
  manualFollowUpLabel: "फॉलो-अप निर्देश",
  uploadAndOpenReview: "अपलोड करें एवं समीक्षा खोलें",
  processingDocument: "चिकित्सीय दस्तावेज़ संसाधित हो रहा है",
  processingSub: "चिकित्सीय सुरक्षा नियमों की पुष्टि और समीक्षा कार्ड बनाए जा रहे हैं…",

  // Voice Assistant States
  voiceAssistant: "आवाज़ साथी (वॉयस)",
  voiceReady: "बोलने के लिए तैयार",
  voiceListening: "सुन रहा है… सामान्य आवाज़ में बोलें",
  voiceProcessing: "निर्देश संसाधित हो रहा है…",
  voiceCommandRecognized: "निर्देश समझा गया",
  voiceCompleted: "कार्य सफलतापूर्वक पूरा हुआ",
  voiceClarificationNeeded: "स्पष्टीकरण आवश्यक",
  voiceClarificationRequired: "स्पष्टीकरण आवश्यक",
  voiceNavigationCompleted: "नेविगेशन पूर्ण",
  voicePatientNotFound: "मरीज़ या रिपोर्ट नहीं मिली",
  voiceNotUnderstood: "निर्देश समझ नहीं आया। कृपया दोबारा बोलें।",
  voiceMicUnavailable: "माइक्रोफ़ोन उपलब्ध नहीं है या अनुमति अस्वीकृत है",
  voiceError: "वाक् पहचान त्रुटि",
  voiceHeard: "सुना गया",
  voiceTranscriptPlaceholder: "सामान्य आवाज़ में बोलें… अभी बोलें",
  voiceSpeakHint: "उदाहरण: “पैरासिटामोल पूरा करो”, “देखभाल योजना दिखाओ”, या “मदद चाहिए”",
  voiceStaffNavHint: "उदाहरण: “प्रिया की रिपोर्ट खोलो”, “Patient analytics dikhao”, या “Rahul ke pending tasks dikhao”",
  voiceStartListening: "आवाज़ शुरू करें",
  voiceStopListening: "आवाज़ बंद करें",

  // Clinical Analytics
  navClinicalAnalytics: "क्लिनिकल एनालिटिक्स",
  tabDischargePlans: "डिस्चार्ज योजनाएं",
  tabClinicalAnalytics: "क्लिनिकल एनालिटिक्स",
  patientsRequiringAttention: "ध्यान देने योग्य मरीज़",
  carePlansInProgress: "प्रगतिशील देखभाल योजनाएं",
  avgCarePlanCompletion: "औसत प्लान पूर्णता",
  pendingTasksCount: "लंबित एवं अतिदेय कार्य",
  documentsAwaitingReview: "समीक्षा बाकी दस्तावेज़",
  documentsProcessed: "संसाधित दस्तावेज़",
  carePlanCompletionChart: "केयर प्लान पूर्णता दर",
  taskStatusDistribution: "कार्य स्थिति वितरण",
  documentWorkflow: "दस्तावेज़ कार्यप्रवाह स्थिति",
  filterAllPatients: "सभी मरीज़",
  filterAttentionOnly: "ध्यान आवश्यक",
  openWorkspaceAction: "वर्कस्पेस खोलें",

  // Common Statuses
  statusApproved: "स्वीकृत",
  statusNeedsReview: "समीक्षा बाकी",
  statusProcessing: "प्रक्रिया जारी",
  statusFailed: "विफल",
  statusComplete: "देखभाल योजना पूर्ण",
  statusRecoveryInProgress: "स्वास्थ्य लाभ जारी",
  statusDraftReview: "चिकित्सीय समीक्षा प्रतीक्षित",

  // Patient Companion Keys
  ptRecoveryPlan: "आपकी रिकवरी योजना",
  ptEncouragement: "हर दिन छोटे कदम आपको स्वस्थ बनाते हैं।",
  ptTodayProgress: "आज की प्रगति",
  ptCompletedOf: (d: number, t: number) => `${d} में से ${t} कार्य पूरे हुए`,
  ptDayProgress: (el: number, tot: number, rem: number) => `योजना का दिन ${el}/${tot} · लगभग ${rem} दिन शेष`,
  ptDurationDisclaimer: "योजना की अवधि देखभाल टीम का अनुमानित समय है, यह पूर्ण स्वस्थ होने की गारंटी नहीं है।",
  ptYourTasks: "आज के कार्य",
  ptVoiceHint: "बोलें: “पहला काम हो गया” या “दवा ले ली”",
  ptMedications: "मेरी दवाइयाँ",
  ptAppointments: "आगामी अपॉइंटमेंट्स",
  ptInstructions: "महत्वपूर्ण देखभाल निर्देश",
  ptNeedHelp: "मदद चाहिए?",
  ptHelpNow: "मुझे अभी मदद चाहिए",
  ptCallCare: "केयर टीम को कॉल करें",
  ptSendMessage: "संदेश भेजें",
  ptDone: "पूर्ण",
  ptMarkDone: "पूरा करें",
  ptNeedsAttention: "ध्यान दें",
  ptYourCareTeam: "आपकी केयर टीम",
  ptSafePlanChecked: "आपकी योजना की जाँच देखभाल टीम द्वारा की गई है।",
  ptWoundCare: "घाव की देखभाल",
  ptActivity: "गतिविधि एवं व्यायाम",
  ptDiet: "आहार एवं जलपान",
  ptWarningSigns: "खतरे के संकेत",
  ptNoMedsFound: "आपकी योजना में कोई दवा नहीं मिली।",
  ptNoApptsFound: "आपकी योजना में कोई फॉलो-अप अपॉइंटमेंट नहीं है।",
  ptCallNow: "अभी कॉल करें",
  ptAskApptDate: "अपनी अपॉइंटमेंट की तारीख पूछें",
  ptRescheduleAppt: "समय बदलने या नई तारीख की आवश्यकता है?",
  ptSensitivity: "संवेदनशीलता",
  ptHigh: "उच्च (High)",
  ptStandard: "सामान्य (Standard)",
  ptSpokenReplies: "बोलकर उत्तर दें",
  ptTurnOffListening: "आवाज़ बंद करें",
  ptTurnOnVoice: "आवाज़ चालू करें",
  ptMicTurnedOff: "माइक्रोफ़ोन बंद है। सुनने के लिए एक बार टैप करें।",
  ptBrowserSpeechNotice: "आपका ब्राउज़र आपकी बात समझकर निर्देश निष्पादित करता है। स्क्रीन चालू रखें।",
  ptEmergencyNotice: "आपात स्थिति में, अपने स्थानीय आपातकालीन नंबर पर कॉल करें।",
  ptHaveQuestion: "क्या कोई सवाल है, मदद चाहिए, या तबियत ठीक नहीं लग रही?",
  ptMessageCareTeamTitle: "अपनी केयर टीम को संदेश भेजें",
  ptWriteWhatYouNeed: "अपनी आवश्यकता या समस्या यहाँ लिखें",
  ptSend: "भेजें",
  ptCancel: "रद्द करें",
  ptTaken: "ले ली",
  ptLater: "बाद में",
  ptTimeFor: (name: string, dose?: string | null) => `${name}${dose ? ` ${dose}` : ""} का समय हो गया है`,
  ptDueAt: (time: string) => `समय: ${time}। बोलें “दवा ले ली” या “बाद में”।`,

  // Real-Time Calling System
  callPatient: "मरीज़ को कॉल करें",
  callCareTeam: "केयर टीम को कॉल करें",
  callNurse: "नर्स को कॉल करें",
  incomingCall: "इनकमिंग ऑडियो कॉल",
  incomingCallFrom: (name: string) => `${name} से इनकमिंग कॉल`,
  acceptCall: "स्वीकार करें",
  declineCall: "अस्वीकार करें",
  endCall: "कॉल समाप्त करें",
  muteMic: "म्यूट",
  unmuteMic: "अनम्यूट",
  mutedStatus: "म्यूट किया हुआ",
  callingPatient: "मरीज़ को कॉल किया जा रहा है...",
  callingCareTeam: "केयर टीम को कॉल किया जा रहा है...",
  ringingStatus: "मरीज़ के फ़ोन पर घंटी बज रही है...",
  connectingAudio: "सुरक्षित ऑडियो कनेक्ट हो रहा है...",
  callConnected: "कॉल कनेक्टेड",
  callEnded: "कॉल समाप्त",
  callDeclined: "कॉल अस्वीकार की गई",
  patientOffline: "मरीज़ अभी ऑफ़लाइन है",
  staffOffline: "केयर टीम अभी ऑफ़लाइन है",
  micPermissionRequired: "माइक्रोफ़ोन अनुमति आवश्यक है",
  callDuration: "अवधि",
  patientOnlineStatus: "ऑनलाइन",
  patientOfflineStatus: "ऑफ़लाइन",
  callHistoryTitle: "कॉल इतिहास",
  noCallsYet: "अभी तक कोई कॉल नहीं हुई",
  dockCall: "छोटा करें",
  expandCall: "बड़ा करें",

  // AI Pill Camera Scanner
  pillScannerTitle: "AI दवा स्कैनर (Pill Scanner)",
  pillScannerSubtitle: "दवा की सही मात्रा और सुरक्षा जांचने के लिए कैमरे को दवा के पत्ते या शीशी पर रखें।",
  pillScanBtn: "दवा स्कैन करें",
  pillScanInstruction: "दवा का नाम और मात्रा फ्रेम के अंदर रखें",
  pillCameraPrompt: "दवा के लेबल को स्कैनर फ्रेम में लाएं",
  pillCapturePhoto: "फोटो लें और जांचें",
  pillRetakePhoto: "दूसरी दवा स्कैन करें",
  pillUploadPhoto: "तस्वीर अपलोड करें",
  pillSampleStripsTitle: "त्वरित डेमो सैंपल्स (जज प्रस्तुति हेतु)",
  pillStatusVerified: "सत्यापित: डॉक्टर द्वारा निर्देशित दवा",
  pillStatusWarning: "सुरक्षा चेतावनी: यह दवा पर्चे में नहीं है",
  pillStatusMismatch: "सावधानी: खुराक में अंतर",
  pillStatusUnrecognized: "लेबल पढ़ा नहीं जा सका",
  pillPrescriptionMatch: "डॉक्टर का पर्चा",
  pillDosageDetected: "पहचानी गई मात्रा",
  pillScheduledFor: "निर्धारित समय",
  pillInstructions: "दवा लेने के निर्देश",
  pillConfirmDose: "✓ खुराक ली गई (दर्ज करें)",
  pillSafetyAlertHeader: "चिकित्सीय सुरक्षा चेतावनी",
  pillDoNotTake: "⚠️ यह दवा बिल्कुल न लें",
  pillReplayAudio: "आवाज में निर्देश सुनें",
  pillScanningInProgress: "दवा का विश्लेषण हो रहा है...",
};

export const DICTIONARY: Record<SupportedLang, Translations> = { en, hi };

interface LanguageContextType {
  lang: SupportedLang;
  setLang: (l: SupportedLang) => void;
  t: Translations;
  speechLocale: "en-IN" | "hi-IN";
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: en,
  speechLocale: "en-IN",
});

const STORAGE_KEY = "rr-app-language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as SupportedLang | null;
      if (stored === "en" || stored === "hi") {
        setLangState(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = (l: SupportedLang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const t = useMemo(() => DICTIONARY[lang], [lang]);
  const speechLocale: "en-IN" | "hi-IN" = lang === "hi" ? "hi-IN" : "en-IN";

  return React.createElement(LanguageContext.Provider, { value: { lang, setLang, t, speechLocale } }, children);
}

export function useLanguage() {
  return useContext(LanguageContext);
}
