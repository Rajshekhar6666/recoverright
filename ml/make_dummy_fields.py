from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data" / "ml" / "fields.csv"
rng = np.random.default_rng(0)
FTYPES = ["medication.dose", "medication.frequency", "follow_up.when",
          "activity.instruction", "wound_care.instruction", "warning_sign.text"]
BTYPES = ["paragraph", "table_row", "list_item", "heading"]
sigmoid = lambda z: 1 / (1 + np.exp(-z))

rows = []
for t in range(10):                      # 10 layout templates
    difficulty = rng.uniform(0, 0.12)    # some templates are harder
    for d in range(8):                   # 8 documents per template
        n_fields = int(rng.integers(18, 26))
        for _ in range(n_fields):
            agree = int(rng.random() < 0.85 - difficulty)
            ga = int(rng.choice([2, 1, 0], p=[0.86, 0.09, 0.05]))
            gb = int(rng.choice([2, 1, 0], p=[0.86, 0.09, 0.05]))
            rule = int(rng.random() < (0.9 if agree else 0.3))
            occ = int(rng.choice([1, 1, 1, 2, 3]))
            low = int(rng.random() < 0.03)
            z = (-0.5 + 2.2 * agree + 0.9 * (ga == 2) + 0.9 * (gb == 2)
                 - 1.5 * (ga == 0) - 1.5 * (gb == 0) + 1.3 * rule
                 - 0.6 * (occ > 1) - 0.4 * low)
            rows.append({
                "doc_id": f"T{t}_D{d}", "template_id": f"T{t}",
                "field_type": rng.choice(FTYPES), "block_type": rng.choice(BTYPES),
                "agree_exact": agree,
                "agree_ratio": 1.0 if agree else float(rng.uniform(0.3, 0.95)),
                "ground_a": ga, "ground_b": gb,
                "quote_score_a": [0.3, 0.9, 1.0][ga], "quote_score_b": [0.3, 0.9, 1.0][gb],
                "quote_occurrences": occ, "numeric_tokens": int(rng.integers(0, 4)),
                "rule_agrees": rule, "block_low_conf": low,
                "value_len": int(rng.integers(5, 80)), "doc_blocks": int(rng.integers(30, 90)),
                "label": int(rng.random() < sigmoid(z)),
            })

OUT.parent.mkdir(parents=True, exist_ok=True)
pd.DataFrame(rows).to_csv(OUT, index=False)
print(f"wrote {len(rows)} dummy rows to {OUT}")