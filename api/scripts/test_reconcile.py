"""Self-checking tests for the reconciler. Run:  python -m scripts.test_reconcile"""
from pathlib import Path

from app.pipeline.parse import parse_document
from app.pipeline.reconcile import canon, reconcile
from app.schemas.plan import (Activity, Contact, Diet, ExtractedPlan, FollowUp, Medication,
                              Procedure, WarningSign, WoundCare)

ROOT = Path(__file__).resolve().parents[2]
doc = parse_document(ROOT / "data" / "synthetic_docs" / "sample_knee.docx")
B = {b.text.split(" | ")[0] if b.type == "table_row" else b.text: b for b in doc.blocks}


def blk(startswith):
    return next(b for b in doc.blocks if b.text.startswith(startswith))


row = {n: blk(n) for n in ("Examplamol", "Testocillin", "Placebex")}
wc1, wc2 = blk("Keep the dressing"), blk("Do not soak")
ac1, ac2 = blk("Walk with"), blk("Do not drive")
diet, fu1, fu2 = blk("Eat a normal"), blk("Wound check"), blk("Physiotherapy")
warn, proc = blk("Contact the ward"), blk("Procedure:")


def med(name, dose, freq, dur, **ov):
    r = row[name]
    d = dict(name=name, dose=dose, frequency=freq, duration=dur, source_quote=r.text, block_id=r.block_id)
    d.update(ov)
    return Medication(**d)


def meds(**changes):
    base = [("Examplamol", "500 mg", "Every 6 hours", "7 days"),
            ("Testocillin", "250 mg", "Twice daily", "5 days"),
            ("Placebex", "1-2 tablets", "As needed", "Until review")]
    out = []
    for n, d, f, u in base:
        c = changes.get(n, {})
        out.append(med(n, c.get("dose", d), c.get("frequency", f), c.get("duration", u)))
    return out


def plan_a():  # what Extractor A produced in your run
    return ExtractedPlan(
        procedure=Procedure(value="Total knee replacement, right knee.", source_quote=proc.text, block_id=proc.block_id),
        medications=meds(),
        wound_care=[WoundCare(instruction=wc1.text, source_quote=wc1.text, block_id=wc1.block_id),
                    WoundCare(instruction=wc2.text, source_quote=wc2.text, block_id=wc2.block_id)],
        activity=[Activity(instruction=ac1.text, source_quote=ac1.text, block_id=ac1.block_id),
                  Activity(instruction=ac2.text, source_quote=ac2.text, block_id=ac2.block_id)],
        diet=[Diet(instruction=diet.text, source_quote=diet.text, block_id=diet.block_id)],
        follow_ups=[FollowUp(what="Wound check at the surgical clinic", when="Date to be confirmed",
                             source_quote=fu1.text, block_id=fu1.block_id),
                    FollowUp(what="Physiotherapy review", when="in 2 weeks", source_quote=fu2.text, block_id=fu2.block_id)],
        warning_signs=[WarningSign(text=warn.text, source_quote=warn.text, block_id=warn.block_id)])


def plan_b():  # what Extractor B produced: no trailing periods, fragments, extra contacts
    def s(x): return x.text.rstrip(".")
    return ExtractedPlan(
        procedure=Procedure(value="Total knee replacement, right knee", source_quote=proc.text, block_id=proc.block_id),
        medications=meds(),
        wound_care=[WoundCare(instruction=s(wc1), source_quote=wc1.text, block_id=wc1.block_id),
                    WoundCare(instruction=s(wc2), source_quote=wc2.text, block_id=wc2.block_id)],
        activity=[Activity(instruction=s(ac1), restriction_type="allowed", source_quote=ac1.text, block_id=ac1.block_id),
                  Activity(instruction=s(ac2), restriction_type="avoid", source_quote=ac2.text, block_id=ac2.block_id)],
        diet=[Diet(instruction=s(diet), source_quote=diet.text, block_id=diet.block_id)],
        follow_ups=[FollowUp(what="Wound check", where="surgical clinic", source_quote="Wound check at the surgical clinic", block_id=fu1.block_id),
                    FollowUp(what="Physiotherapy review", when="in 2 weeks", source_quote=fu2.text, block_id=fu2.block_id)],
        warning_signs=[WarningSign(text=t, source_quote=t, block_id=warn.block_id) for t in
                       ("heavy bleeding from the wound", "new chest pain", "redness and swelling that is getting worse")],
        contacts=[Contact(label="Ward", value="Contact the ward", source_quote="Contact the ward", block_id=warn.block_id),
                  Contact(label="Emergency Services", value="emergency services", source_quote="emergency services", block_id=warn.block_id)])


passed = 0


def check(name, cond):
    global passed
    print(("PASS  " if cond else "FAIL  ") + name)
    if not cond:
        raise SystemExit(1)
    passed += 1


def find(fields, category, contains):
    return next(f for f in fields if f.category == category
                and contains in " ".join([f.quote or "", str(f.proposed)] + [o.quote for o in f.opinions]))


# ---- normalization ----
check("'5 mg' is not '15 mg'", canon("5 mg") != canon("15 mg"))
check("'in 2 weeks' equals '2 weeks'", canon("in 2 weeks") == canon("2 weeks"))
check("case and trailing period ignored", canon("Twice daily.") == canon("twice daily"))

# ---- your real run ----
f = reconcile(doc, plan_a(), plan_b())
counts = {s: sum(1 for x in f if x.status == s) for s in ("agreed", "review", "conflict", "rejected")}
print("      counts:", counts)
check("clean medications are agreed by three sources",
      find(f, "medications", "Examplamol").status == "agreed" and len(find(f, "medications", "Examplamol").voters) == 3)
pb = find(f, "medications", "Placebex")
check("ambiguous dose and as-needed frequency force review even though all agree",
      pb.status == "review" and any("range" in i for i in pb.issues) and any("not a fixed schedule" in i for i in pb.issues))
wcheck = find(f, "follow_ups", "Wound check")
check("placeholder date becomes 'not stated' and needs review",
      wcheck.status == "review" and any("not stated" in i for i in wcheck.issues))
check("follow-up with a real date is agreed ('in 2 weeks')", find(f, "follow_ups", "Physiotherapy").status == "agreed")
wsn = [x for x in f if x.category == "warning_signs"]
check("A's one sentence and B's three fragments align as ONE warning field", len(wsn) == 1 and wsn[0].status == "agreed")
check("trailing-period differences do not cause disagreement", find(f, "wound_care", "Keep the dressing").status == "agreed")
check("B's restriction_type guesses are not evidence", find(f, "activity", "Walk with").status == "agreed")
check("B-only contacts are sent to review", all(x.status == "review" for x in f if x.category == "contacts"))
check("nothing is in conflict or rejected on this document", counts["conflict"] == 0 and counts["rejected"] == 0)

# ---- injected errors ----
bad_b = plan_b()
bad_b.medications = meds(Testocillin={"dose": "500 mg"})
g = find(reconcile(doc, plan_a(), bad_b), "medications", "Testocillin")
check("a hallucinated dose from one extractor forces review", g.status == "review" and any("failed verification" in i for i in g.issues))
check("...and the proposed dose still comes from the table reader", g.proposed["dose"] == "250 mg")

both_wrong = reconcile(doc, ExtractedPlan(medications=meds(Examplamol={"duration": "6 days"})),
                       ExtractedPlan(medications=meds(Examplamol={"duration": "6 days"})), use_rules=True)
g2 = find(both_wrong, "medications", "Examplamol")
check("two models agreeing on a WRONG duration cannot out-vote the table", g2.status == "review" and g2.proposed["duration"] == "7 days")
no_rules = reconcile(doc, ExtractedPlan(medications=meds(Examplamol={"duration": "6 days"})),
                     ExtractedPlan(medications=meds(Examplamol={"duration": "6 days"})), use_rules=False)
check("with no table reader, agreeing-but-unverified models are rejected",
      find(no_rules, "medications", "Examplamol").status == "rejected")

only_a = reconcile(doc, plan_a(), None)
check("if one extractor is down, narrative fields drop to review", find(only_a, "wound_care", "Keep the dressing").status == "review")
check("...but table medications stay agreed (A + table reader)", find(only_a, "medications", "Examplamol").status == "agreed")

print(f"\nall {passed} checks passed")
