"""Shared test data: the two extractor outputs, shaped like your real run."""
from pathlib import Path

from app.pipeline.parse import parse_document
from app.schemas.plan import (Activity, Contact, Diet, ExtractedPlan, FollowUp, Medication,
                              Procedure, WarningSign, WoundCare)

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "synthetic_docs" / "sample_knee.docx"


class Fixtures:
    def __init__(self, doc=None):
        self.doc = doc or parse_document(SAMPLE)
        self.row = {n: self.blk(n) for n in ("Examplamol", "Testocillin", "Placebex")}

    def blk(self, startswith):
        return next(b for b in self.doc.blocks if b.text.startswith(startswith))

    def med(self, name, dose, freq, dur):
        r = self.row[name]
        return Medication(name=name, dose=dose, frequency=freq, duration=dur, source_quote=r.text, block_id=r.block_id)

    def meds(self, **changes):
        base = [("Examplamol", "500 mg", "Every 6 hours", "7 days"),
                ("Testocillin", "250 mg", "Twice daily", "5 days"),
                ("Placebex", "1-2 tablets", "As needed", "Until review")]
        out = []
        for n, d, f, u in base:
            c = changes.get(n, {})
            out.append(self.med(n, c.get("dose", d), c.get("frequency", f), c.get("duration", u)))
        return out

    def plan_a(self):  # Extractor A: full sentences, placeholder date, one warning sentence
        b = self.blk
        wc1, wc2, ac1, ac2 = b("Keep the dressing"), b("Do not soak"), b("Walk with"), b("Do not drive")
        diet, fu1, fu2, warn, proc = b("Eat a normal"), b("Wound check"), b("Physiotherapy"), b("Contact the ward"), b("Procedure:")
        return ExtractedPlan(
            procedure=Procedure(value="Total knee replacement, right knee.", source_quote=proc.text, block_id=proc.block_id),
            medications=self.meds(),
            wound_care=[WoundCare(instruction=x.text, source_quote=x.text, block_id=x.block_id) for x in (wc1, wc2)],
            activity=[Activity(instruction=x.text, source_quote=x.text, block_id=x.block_id) for x in (ac1, ac2)],
            diet=[Diet(instruction=diet.text, source_quote=diet.text, block_id=diet.block_id)],
            follow_ups=[FollowUp(what="Wound check at the surgical clinic", when="Date to be confirmed",
                                 source_quote=fu1.text, block_id=fu1.block_id),
                        FollowUp(what="Physiotherapy review", when="in 2 weeks", source_quote=fu2.text, block_id=fu2.block_id)],
            warning_signs=[WarningSign(text=warn.text, source_quote=warn.text, block_id=warn.block_id)])

    def plan_b(self):  # Extractor B: no trailing periods, warning fragments, extra contacts, guessed restriction types
        b = self.blk
        wc1, wc2, ac1, ac2 = b("Keep the dressing"), b("Do not soak"), b("Walk with"), b("Do not drive")
        diet, fu1, fu2, warn, proc = b("Eat a normal"), b("Wound check"), b("Physiotherapy"), b("Contact the ward"), b("Procedure:")
        s = lambda x: x.text.rstrip(".")
        return ExtractedPlan(
            procedure=Procedure(value="Total knee replacement, right knee", source_quote=proc.text, block_id=proc.block_id),
            medications=self.meds(),
            wound_care=[WoundCare(instruction=s(x), source_quote=x.text, block_id=x.block_id) for x in (wc1, wc2)],
            activity=[Activity(instruction=s(ac1), restriction_type="allowed", source_quote=ac1.text, block_id=ac1.block_id),
                      Activity(instruction=s(ac2), restriction_type="avoid", source_quote=ac2.text, block_id=ac2.block_id)],
            diet=[Diet(instruction=s(diet), source_quote=diet.text, block_id=diet.block_id)],
            follow_ups=[FollowUp(what="Wound check", where="surgical clinic", source_quote="Wound check at the surgical clinic", block_id=fu1.block_id),
                        FollowUp(what="Physiotherapy review", when="in 2 weeks", source_quote=fu2.text, block_id=fu2.block_id)],
            warning_signs=[WarningSign(text=t, source_quote=t, block_id=warn.block_id) for t in
                           ("heavy bleeding from the wound", "new chest pain", "redness and swelling that is getting worse")],
            contacts=[Contact(label="Ward", value="Contact the ward", source_quote="Contact the ward", block_id=warn.block_id),
                      Contact(label="Emergency Services", value="emergency services", source_quote="emergency services", block_id=warn.block_id)])
