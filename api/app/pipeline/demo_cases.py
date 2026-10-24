"""Registry of the Four Synthetic Clinical Demonstration Cases for RecoverRight.

All cases are completely fictional with clinically plausible synthetic data:
1. demo_straightforward: Priya Sharma (Laparoscopic Appendectomy) - clean agreement, can approve immediately.
2. demo_disagreement: Jane Example (Total Knee Replacement) - conflicting follow-up and dose range.
3. demo_medication_table: Vikram Malhotra (Post-CABG Recovery) - multi-drug structured cardiac regimen.
4. demo_ambiguous: Margaret Chen (Hip Hemiarthroplasty) - missing/unverified prescriptions blocking approval.
"""
from typing import Any
from app.schemas.document import Block, SourceDocument
from app.schemas.reconcile import ReconciledField
from app.schemas.review import ReviewField


DEMO_CASES_METADATA = [
    {
        "id": "demo_straightforward",
        "title": "Straightforward Recovery",
        "badge": "Clean Agreement",
        "badge_color": "ok",
        "patient_name": "Priya Sharma",
        "age": 34,
        "procedure": "Laparoscopic Appendectomy",
        "filename": "discharge_appendectomy_fictional.docx",
        "language": "en",
        "summary": "Both AI extractors and table readers agree on all clinical fields. Demonstrates frictionless human-in-the-loop review and immediate approval.",
        "expected_blockers": 0,
        "teaching_point": "Agreed non-critical fields are pre-accepted. Can proceed directly to approval.",
    },
    {
        "id": "demo_disagreement",
        "title": "Extraction Disagreement",
        "badge": "Conflicting Evidence",
        "badge_color": "warn",
        "patient_name": "Jane Example",
        "age": 62,
        "procedure": "Total Knee Replacement",
        "filename": "sample_knee.docx",
        "language": "en",
        "summary": "Readers extract conflicting evidence on follow-up timing and medication dose range. Approval is blocked until staff decides each conflict.",
        "expected_blockers": 3,
        "teaching_point": "Mandatory review blockers halt approval when evidence conflicts or requires clinician judgement.",
    },
    {
        "id": "demo_medication_table",
        "title": "Complex Medication Table",
        "badge": "Multi-Drug Regimen",
        "badge_color": "info",
        "patient_name": "Vikram Malhotra",
        "age": 58,
        "procedure": "Coronary Artery Bypass Grafting (CABG)",
        "filename": "discharge_cardiac_cabg_fictional.docx",
        "language": "en",
        "summary": "Multi-row structured cardiac regimen (Atorvastatin, Metoprolol, Aspirin, Pantoprazole). Demonstrates deterministic table parsing and schedule mapping.",
        "expected_blockers": 0,
        "teaching_point": "Deterministic table reader verifies dose, frequency, and duration across complex prescriptions.",
    },
    {
        "id": "demo_ambiguous",
        "title": "Incomplete / Ambiguous Discharge",
        "badge": "Approval Blocked",
        "badge_color": "bad",
        "patient_name": "Margaret Chen",
        "age": 71,
        "procedure": "Left Hip Hemiarthroplasty",
        "filename": "discharge_hip_incomplete_fictional.docx",
        "language": "en",
        "summary": "Missing antibiotic duration and ambiguous pain medication instructions strictly block approval until a reviewer enters missing values or rejects them.",
        "expected_blockers": 3,
        "teaching_point": "Unverified prescriptions cannot silently become approved. Safety rules reject approval until edited or removed.",
    },
]


def _build_straightforward_case() -> tuple[SourceDocument, list[ReviewField]]:
    blocks = [
        Block(block_id="b1", type="heading", text="HOSPITAL DISCHARGE SUMMARY (FICTIONAL)"),
        Block(block_id="b2", type="paragraph", text="Patient: Priya Sharma | DOB: 14/05/1992 | Sex: Female"),
        Block(block_id="b3", type="heading", text="Procedure Performed"),
        Block(block_id="b4", type="paragraph", text="Laparoscopic Appendectomy for uncomplicated acute appendicitis."),
        Block(block_id="b5", type="heading", text="Discharge Medications"),
        Block(block_id="b6", type="table_row", table_id="t1", row_index=0, text="Medication | Dose | Frequency | Duration", cells=["Medication", "Dose", "Frequency", "Duration"]),
        Block(block_id="b7", type="table_row", table_id="t1", row_index=1, text="Paracetamol | 500 mg | Every 6 hours | 5 days", cells=["Paracetamol", "500 mg", "Every 6 hours", "5 days"]),
        Block(block_id="b8", type="table_row", table_id="t1", row_index=2, text="Amoxicillin-Clavulanate | 625 mg | Twice daily | 5 days", cells=["Amoxicillin-Clavulanate", "625 mg", "Twice daily", "5 days"]),
        Block(block_id="b9", type="table_row", table_id="t1", row_index=3, text="Pantoprazole | 40 mg | Once daily before breakfast | 7 days", cells=["Pantoprazole", "40 mg", "Once daily before breakfast", "7 days"]),
        Block(block_id="b10", type="heading", text="Wound Care Instructions"),
        Block(block_id="b11", type="list_item", text="Keep the port site dressings clean and dry for the first 48 hours."),
        Block(block_id="b12", type="list_item", text="Shower after 48 hours; pat dry gently. Do not soak in a tub or pool."),
        Block(block_id="b13", type="heading", text="Activity Guidance"),
        Block(block_id="b14", type="list_item", text="Light walking around the house is encouraged."),
        Block(block_id="b15", type="list_item", text="Avoid strenuous exertion or lifting items over 5 kg for 2 weeks."),
        Block(block_id="b16", type="heading", text="Follow-up Appointment"),
        Block(block_id="b17", type="paragraph", text="Surgical clinic review in 2 weeks with Dr. Kapoor at Main OPD."),
        Block(block_id="b18", type="heading", text="Warning Signs & Emergency Contacts"),
        Block(block_id="b19", type="paragraph", text="Seek urgent care if you develop fever over 38.5C, severe persistent pain, or wound discharge."),
        Block(block_id="b20", type="paragraph", text="Contact Surgical Ward Helpline: +91 98000 11111."),
    ]
    fields = [
        ReviewField(field=ReconciledField(field_id="f1", category="procedure", status="agreed", critical=False,
                                          proposed={"value": "Laparoscopic Appendectomy"}, block_id="b4", quote="Laparoscopic Appendectomy for uncomplicated acute appendicitis.")),
        ReviewField(field=ReconciledField(field_id="f2", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Paracetamol", "dose": "500 mg", "frequency": "Every 6 hours", "duration": "5 days"}, block_id="b7", quote="Paracetamol | 500 mg | Every 6 hours | 5 days")),
        ReviewField(field=ReconciledField(field_id="f3", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Amoxicillin-Clavulanate", "dose": "625 mg", "frequency": "Twice daily", "duration": "5 days"}, block_id="b8", quote="Amoxicillin-Clavulanate | 625 mg | Twice daily | 5 days")),
        ReviewField(field=ReconciledField(field_id="f4", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Pantoprazole", "dose": "40 mg", "frequency": "Once daily", "duration": "7 days"}, block_id="b9", quote="Pantoprazole | 40 mg | Once daily before breakfast | 7 days")),
        ReviewField(field=ReconciledField(field_id="f5", category="wound_care", status="agreed", critical=False,
                                          proposed={"instruction": "Keep the port site dressings clean and dry for the first 48 hours."}, block_id="b11", quote="Keep the port site dressings clean and dry for the first 48 hours.")),
        ReviewField(field=ReconciledField(field_id="f6", category="wound_care", status="agreed", critical=False,
                                          proposed={"instruction": "Shower after 48 hours; pat dry gently. Do not soak in a tub or pool."}, block_id="b12", quote="Shower after 48 hours; pat dry gently. Do not soak in a tub or pool.")),
        ReviewField(field=ReconciledField(field_id="f7", category="activity", status="agreed", critical=False,
                                          proposed={"instruction": "Light walking around the house is encouraged."}, block_id="b14", quote="Light walking around the house is encouraged.")),
        ReviewField(field=ReconciledField(field_id="f8", category="activity", status="agreed", critical=False,
                                          proposed={"instruction": "Avoid strenuous exertion or lifting items over 5 kg for 2 weeks."}, block_id="b15", quote="Avoid strenuous exertion or lifting items over 5 kg for 2 weeks.")),
        ReviewField(field=ReconciledField(field_id="f9", category="follow_ups", status="agreed", critical=False,
                                          proposed={"what": "Surgical clinic review", "when": "in 2 weeks", "where": "Main OPD, Dr. Kapoor"}, block_id="b17", quote="Surgical clinic review in 2 weeks with Dr. Kapoor at Main OPD.")),
        ReviewField(field=ReconciledField(field_id="f10", category="warning_signs", status="agreed", critical=False,
                                          proposed={"text": "Fever over 38.5C, severe persistent pain, or wound discharge."}, block_id="b19", quote="Seek urgent care if you develop fever over 38.5C, severe persistent pain, or wound discharge.")),
        ReviewField(field=ReconciledField(field_id="f11", category="contacts", status="agreed", critical=False,
                                          proposed={"label": "Surgical Ward Helpline", "value": "+91 98000 11111"}, block_id="b20", quote="Contact Surgical Ward Helpline: +91 98000 11111.")),
    ]
    return SourceDocument(filename="discharge_appendectomy_fictional.docx", blocks=blocks), fields


def _build_disagreement_case() -> tuple[SourceDocument, list[ReviewField]]:
    from scripts.fixtures import Fixtures
    fx = Fixtures()
    doc = fx.doc
    from app.pipeline.reconcile import reconcile
    fields = reconcile(doc, fx.plan_a(), fx.plan_b(), run_id="run_demo_disagreement")
    return doc, [ReviewField(field=f) for f in fields]


def _build_medication_table_case() -> tuple[SourceDocument, list[ReviewField]]:
    blocks = [
        Block(block_id="b1", type="heading", text="CARDIOTHORACIC SURGICAL DISCHARGE SUMMARY (FICTIONAL)"),
        Block(block_id="b2", type="paragraph", text="Patient: Vikram Malhotra | Age: 58 | Sex: Male"),
        Block(block_id="b3", type="heading", text="Surgical Procedure"),
        Block(block_id="b4", type="paragraph", text="Coronary Artery Bypass Grafting (CABG x 3: LIMA-LAD, SVG-OM, SVG-RCA)."),
        Block(block_id="b5", type="heading", text="Discharge Medications"),
        Block(block_id="b6", type="table_row", table_id="t1", row_index=0, text="Drug | Strength | Route | Frequency | Duration", cells=["Drug", "Strength", "Route", "Frequency", "Duration"]),
        Block(block_id="b7", type="table_row", table_id="t1", row_index=1, text="Atorvastatin | 40 mg | Oral | Once daily at bedtime | 90 days", cells=["Atorvastatin", "40 mg", "Oral", "Once daily at bedtime", "90 days"]),
        Block(block_id="b8", type="table_row", table_id="t1", row_index=2, text="Metoprolol Succinate | 25 mg | Oral | Once daily in morning | 30 days", cells=["Metoprolol Succinate", "25 mg", "Oral", "Once daily in morning", "30 days"]),
        Block(block_id="b9", type="table_row", table_id="t1", row_index=3, text="Aspirin (Ecosprin) | 75 mg | Oral | Once daily after lunch | 90 days", cells=["Aspirin (Ecosprin)", "75 mg", "Oral", "Once daily after lunch", "90 days"]),
        Block(block_id="b10", type="table_row", table_id="t1", row_index=4, text="Pantoprazole | 40 mg | Oral | Once daily before breakfast | 30 days", cells=["Pantoprazole", "40 mg", "Oral", "Once daily before breakfast", "30 days"]),
        Block(block_id="b11", type="table_row", table_id="t1", row_index=5, text="Nitroglycerin | 0.4 mg | Sublingual | As needed for chest pain | 30 days", cells=["Nitroglycerin", "0.4 mg", "Sublingual", "As needed for chest pain", "30 days"]),
        Block(block_id="b12", type="heading", text="Sternal Wound Care"),
        Block(block_id="b13", type="list_item", text="Inspect the chest incision daily for redness, oozing, or separation."),
        Block(block_id="b14", type="list_item", text="Wash gently with mild soap and water; pat dry with clean towel. Do not rub."),
        Block(block_id="b15", type="heading", text="Sternal Precautions & Physical Activity"),
        Block(block_id="b16", type="list_item", text="Strict sternal precautions for 6 weeks: do not lift over 4 kg, avoid pushing up from chair."),
        Block(block_id="b17", type="list_item", text="Short level walks of 10-15 minutes twice daily."),
        Block(block_id="b18", type="heading", text="Follow-up Appointments"),
        Block(block_id="b19", type="paragraph", text="Cardiology Follow-up in 4 weeks at Heart Center."),
        Block(block_id="b20", type="paragraph", text="Cardiac Rehabilitation Assessment in 3 weeks."),
        Block(block_id="b21", type="heading", text="Red Flag Symptoms"),
        Block(block_id="b22", type="paragraph", text="Call emergency services for severe chest pain not relieved by sublingual nitroglycerin within 5 minutes, or shortness of breath at rest."),
        Block(block_id="b23", type="paragraph", text="Cardiac Care Coordinator: +91 98000 22222."),
    ]
    fields = [
        ReviewField(field=ReconciledField(field_id="c1", category="procedure", status="agreed", critical=False,
                                          proposed={"value": "Coronary Artery Bypass Grafting (CABG x 3)"}, block_id="b4", quote="Coronary Artery Bypass Grafting (CABG x 3: LIMA-LAD, SVG-OM, SVG-RCA).")),
        ReviewField(field=ReconciledField(field_id="c2", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Atorvastatin", "dose": "40 mg", "route": "Oral", "frequency": "Once daily at bedtime", "duration": "90 days"}, block_id="b7", quote="Atorvastatin | 40 mg | Oral | Once daily at bedtime | 90 days")),
        ReviewField(field=ReconciledField(field_id="c3", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Metoprolol Succinate", "dose": "25 mg", "route": "Oral", "frequency": "Once daily in morning", "duration": "30 days"}, block_id="b8", quote="Metoprolol Succinate | 25 mg | Oral | Once daily in morning | 30 days")),
        ReviewField(field=ReconciledField(field_id="c4", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Aspirin (Ecosprin)", "dose": "75 mg", "route": "Oral", "frequency": "Once daily after lunch", "duration": "90 days"}, block_id="b9", quote="Aspirin (Ecosprin) | 75 mg | Oral | Once daily after lunch | 90 days")),
        ReviewField(field=ReconciledField(field_id="c5", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Pantoprazole", "dose": "40 mg", "route": "Oral", "frequency": "Once daily before breakfast", "duration": "30 days"}, block_id="b10", quote="Pantoprazole | 40 mg | Oral | Once daily before breakfast | 30 days")),
        ReviewField(field=ReconciledField(field_id="c6", category="medications", status="agreed", critical=False,
                                          proposed={"name": "Nitroglycerin", "dose": "0.4 mg", "route": "Sublingual", "frequency": "As needed for chest pain", "duration": "30 days"}, block_id="b11", quote="Nitroglycerin | 0.4 mg | Sublingual | As needed for chest pain | 30 days")),
        ReviewField(field=ReconciledField(field_id="c7", category="wound_care", status="agreed", critical=False,
                                          proposed={"instruction": "Inspect chest incision daily; wash gently and pat dry without rubbing."}, block_id="b14", quote="Wash gently with mild soap and water; pat dry with clean towel. Do not rub.")),
        ReviewField(field=ReconciledField(field_id="c8", category="activity", status="agreed", critical=False,
                                          proposed={"instruction": "Strict sternal precautions for 6 weeks: do not lift over 4 kg."}, block_id="b16", quote="Strict sternal precautions for 6 weeks: do not lift over 4 kg, avoid pushing up from chair.")),
        ReviewField(field=ReconciledField(field_id="c9", category="follow_ups", status="agreed", critical=False,
                                          proposed={"what": "Cardiology Follow-up", "when": "in 4 weeks", "where": "Heart Center"}, block_id="b19", quote="Cardiology Follow-up in 4 weeks at Heart Center.")),
        ReviewField(field=ReconciledField(field_id="c10", category="follow_ups", status="agreed", critical=False,
                                          proposed={"what": "Cardiac Rehabilitation Assessment", "when": "in 3 weeks"}, block_id="b20", quote="Cardiac Rehabilitation Assessment in 3 weeks.")),
        ReviewField(field=ReconciledField(field_id="c11", category="warning_signs", status="agreed", critical=False,
                                          proposed={"text": "Severe chest pain not relieved within 5 minutes or shortness of breath at rest."}, block_id="b22", quote="Call emergency services for severe chest pain not relieved by sublingual nitroglycerin within 5 minutes, or shortness of breath at rest.")),
        ReviewField(field=ReconciledField(field_id="c12", category="contacts", status="agreed", critical=False,
                                          proposed={"label": "Cardiac Care Coordinator", "value": "+91 98000 22222"}, block_id="b23", quote="Cardiac Care Coordinator: +91 98000 22222.")),
    ]
    return SourceDocument(filename="discharge_cardiac_cabg_fictional.docx", blocks=blocks), fields


def _build_ambiguous_case() -> tuple[SourceDocument, list[ReviewField]]:
    blocks = [
        Block(block_id="b1", type="heading", text="ORTHOPEDIC DISCHARGE REPORT (FICTIONAL)"),
        Block(block_id="b2", type="paragraph", text="Patient: Margaret Chen | Age: 71 | Sex: Female"),
        Block(block_id="b3", type="heading", text="Operation"),
        Block(block_id="b4", type="paragraph", text="Left Hip Bipolar Hemiarthroplasty for subcapital neck of femur fracture."),
        Block(block_id="b5", type="heading", text="Medication Schedule"),
        Block(block_id="b6", type="table_row", table_id="t1", row_index=0, text="Drug | Dose | Instructions", cells=["Drug", "Dose", "Instructions"]),
        Block(block_id="b7", type="table_row", table_id="t1", row_index=1, text="Cephalexin | 500 mg | To be finalized by GP on discharge", cells=["Cephalexin", "500 mg", "To be finalized by GP on discharge"]),
        Block(block_id="b8", type="table_row", table_id="t1", row_index=2, text="Tramadol | ? | As needed for breakthrough pain, do not exceed maximum", cells=["Tramadol", "?", "As needed for breakthrough pain, do not exceed maximum"]),
        Block(block_id="b9", type="table_row", table_id="t1", row_index=3, text="Enoxaparin | 40 mg | Daily subcutaneous injection | 28 days", cells=["Enoxaparin", "40 mg", "Daily subcutaneous injection", "28 days"]),
        Block(block_id="b10", type="heading", text="Precautions"),
        Block(block_id="b11", type="list_item", text="Avoid hip flexion past 90 degrees and do not cross legs."),
        Block(block_id="b12", type="heading", text="Follow-up Appointment"),
        Block(block_id="b13", type="paragraph", text="Outpatient orthopedic clinic follow-up. Timing not stated."),
        Block(block_id="b14", type="heading", text="Contact"),
        Block(block_id="b15", type="paragraph", text="Orthopedic Nurse Specialist: +91 98000 33333."),
    ]
    fields = [
        ReviewField(field=ReconciledField(
            field_id="amb1", category="procedure", status="agreed", critical=False,
            proposed={"value": "Left Hip Bipolar Hemiarthroplasty"}, block_id="b4", quote="Left Hip Bipolar Hemiarthroplasty for subcapital neck of femur fracture."
        )),
        ReviewField(field=ReconciledField(
            field_id="amb2", category="medications", status="review", critical=True,
            proposed={"name": "Cephalexin", "dose": "500 mg", "frequency": "not stated", "duration": "not stated"},
            block_id="b7", quote="Cephalexin | 500 mg | To be finalized by GP on discharge",
            issues=["Frequency and duration not finalized: clinician must verify before publishing."]
        )),
        ReviewField(field=ReconciledField(
            field_id="amb3", category="medications", status="rejected", critical=True,
            proposed=None, block_id="b8", quote="Tramadol | ? | As needed for breakthrough pain, do not exceed maximum",
            issues=["No verified dose on document: dose is ambiguous ('?'). Clinician must edit or remove."]
        )),
        ReviewField(field=ReconciledField(
            field_id="amb4", category="medications", status="agreed", critical=False,
            proposed={"name": "Enoxaparin", "dose": "40 mg", "frequency": "Once daily", "duration": "28 days"},
            block_id="b9", quote="Enoxaparin | 40 mg | Daily subcutaneous injection | 28 days"
        )),
        ReviewField(field=ReconciledField(
            field_id="amb5", category="activity", status="agreed", critical=False,
            proposed={"instruction": "Avoid hip flexion past 90 degrees and do not cross legs."},
            block_id="b11", quote="Avoid hip flexion past 90 degrees and do not cross legs."
        )),
        ReviewField(field=ReconciledField(
            field_id="amb6", category="follow_ups", status="review", critical=True,
            proposed={"what": "Outpatient orthopedic clinic follow-up", "when": "not stated"},
            block_id="b13", quote="Outpatient orthopedic clinic follow-up. Timing not stated.",
            issues=["Follow-up timing not stated: confirm appointment date."]
        )),
        ReviewField(field=ReconciledField(
            field_id="amb7", category="contacts", status="agreed", critical=False,
            proposed={"label": "Orthopedic Nurse Specialist", "value": "+91 98000 33333"},
            block_id="b15", quote="Orthopedic Nurse Specialist: +91 98000 33333."
        )),
    ]
    return SourceDocument(filename="discharge_hip_incomplete_fictional.docx", blocks=blocks), fields


BUILDERS = {
    "demo_straightforward": _build_straightforward_case,
    "demo_disagreement": _build_disagreement_case,
    "demo_medication_table": _build_medication_table_case,
    "demo_ambiguous": _build_ambiguous_case,
}


def get_demo_case(case_id: str) -> tuple[dict, SourceDocument, list[ReviewField]]:
    """Returns (case_metadata, source_document, review_fields) for a given case_id."""
    meta = next((c for c in DEMO_CASES_METADATA if c["id"] == case_id), None)
    if not meta or case_id not in BUILDERS:
        raise KeyError(f"Unknown demo case: {case_id}")
    doc, fields = BUILDERS[case_id]()
    return meta, doc, fields
