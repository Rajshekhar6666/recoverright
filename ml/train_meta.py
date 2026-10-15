import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data" / "ml" / "fields.csv"
OUT = ROOT / "api" / "app" / "ml" / "meta_model.joblib"

TARGET_FALSE_GREEN = 0.01   # max wrong fields among auto-green
MIN_GREEN_SUPPORT = 30      # don't trust a threshold with fewer green fields
NUM = ["agree_exact", "agree_ratio", "ground_a", "ground_b", "quote_score_a",
       "quote_score_b", "quote_occurrences", "numeric_tokens", "rule_agrees",
       "block_low_conf", "value_len", "doc_blocks"]
CAT = ["field_type", "block_type"]


def make_X(df, columns=None):
    X = pd.get_dummies(df[NUM + CAT], columns=CAT).astype(float)
    if columns is not None:
        X = X.reindex(columns=columns, fill_value=0.0)
    return X


def pick_threshold(p, y):
    for t in np.linspace(0.5, 0.999, 500):
        green = p >= t
        if green.sum() >= MIN_GREEN_SUPPORT and (1 - y[green]).mean() <= TARGET_FALSE_GREEN:
            return float(t)
    return 1.01  # nothing auto-green; everything goes to review


def report(name, y, green, p=None):
    n_green = int(green.sum())
    wrong = int((1 - y[green]).sum()) if n_green else 0
    line = f"{name}: auto-green {n_green}/{len(y)} ({n_green / len(y):.0%}), wrong among green {wrong}"
    if p is not None:
        line += f", AUC {roc_auc_score(y, p):.3f}, Brier {brier_score_loss(y, p):.3f}"
    print(line)


def main():
    df = pd.read_csv(CSV)
    rng = np.random.default_rng(42)
    templates = np.array(sorted(df["template_id"].unique()))
    rng.shuffle(templates)
    n_test = max(1, round(0.2 * len(templates)))
    test_t = set(templates[:n_test])
    is_test = df["template_id"].isin(test_t)
    tv, te = df[~is_test].reset_index(drop=True), df[is_test].reset_index(drop=True)
    print(f"templates: {len(templates)} | held-out test templates: {sorted(test_t)}")
    print(f"train/val fields: {len(tv)} | test fields: {len(te)}")

    X, y, groups = make_X(tv), tv["label"].to_numpy(), tv["template_id"]
    cv = list(GroupKFold(n_splits=min(5, groups.nunique())).split(X, y, groups))

    candidates = {
        "logreg": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced")),
        "gbm": HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, random_state=0),
    }
    best_name, best_brier, best_oof = None, 9, None
    for name, model in candidates.items():
        oof = cross_val_predict(model, X, y, cv=cv, method="predict_proba")[:, 1]
        b = brier_score_loss(y, oof)
        print(f"[validation] {name}: AUC {roc_auc_score(y, oof):.3f}, Brier {b:.3f}")
        if b < best_brier:
            best_name, best_brier, best_oof = name, b, oof
    print("chosen model:", best_name)

    thr = pick_threshold(best_oof, y)
    print(f"threshold chosen on validation: {thr:.3f}")

    model = candidates[best_name].fit(X, y)

    # ---- single, final look at the held-out test templates ----
    Xt, yt = make_X(te, list(X.columns)), te["label"].to_numpy()
    pt = model.predict_proba(Xt)[:, 1]
    print("\n=== TEST (unseen templates) ===")
    baseline = ((te["agree_exact"] == 1) & (te["ground_a"] == 2) & (te["ground_b"] == 2)).to_numpy()
    report("baseline (agree + grounded)", yt, baseline)
    # model may only demote: it needs the baseline conditions AND p >= threshold
    report("meta-model gated        ", yt, baseline & (pt >= thr), pt)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "columns": list(X.columns), "threshold": thr,
                 "test_templates": sorted(test_t)}, OUT)
    print("saved:", OUT)


if __name__ == "__main__":
    sys.exit(main())