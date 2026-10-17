"""Self-checking tests for the reconciler. Run:  python -m scripts.test_reconcile"""
from app.pipeline.reconcile import canon, reconcile

from scripts.fixtures import Fixtures

fx = Fixtures()
doc, plan_a, plan_b, meds = fx.doc, fx.plan_a, fx.plan_b, fx.meds
from app.schemas.plan import ExtractedPlan  # noqa: E402,F811


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
