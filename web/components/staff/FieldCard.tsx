"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { dur, spring } from "@/lib/motion";
import {
  ATTR_LABEL, CATEGORY_ATTRS, CATEGORY_LABEL, LONG_ATTRS, REQUIRED_ATTRS, VOTER_LABEL, currentAttrs,
} from "@/lib/review";
import type { Action, Attrs, ReviewField } from "@/lib/types";
import { Icon } from "./icons";

const STATUS_LABEL: Record<string, string> = {
  agreed: "Agreed", review: "Needs review", conflict: "Conflict", rejected: "Unverified",
  confirm: "Confirmed", edit: "Edited", reject: "Removed",
};

function summarize(a: Attrs): string {
  return Object.values(a).filter(Boolean).join(" · ");
}

export default function FieldCard(props: {
  item: ReviewField;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onDecide: (action: Action, attrs?: Attrs) => Promise<void>;
}) {
  const { item, selected, locked, onSelect, onDecide } = props;
  const f = item.field;
  const d = item.decision;
  const state = d ? d.action : f.status;
  const keys = CATEGORY_ATTRS[f.category] ?? Object.keys(f.proposed ?? {});
  const attrs = currentAttrs(item);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (action: Action, a?: Attrs) => {
    setBusy(true);
    try {
      await onDecide(action, a);
      setEditing(false);
    } catch {
      /* the page shows the error message */
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    const base = attrs ?? {};
    setDraft(Object.fromEntries(keys.map((k) => [k, base[k] ?? ""])));
    setEditing(true);
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <motion.article
      layout="position"
      data-field={f.field_id}
      className={`rr-field st-${state}${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base }}
    >
      <header className="rr-field-head">
        <span className="rr-cat">{CATEGORY_LABEL[f.category] ?? f.category}</span>
        {f.critical && <span className="rr-crit"><Icon.shield size={12} /> Critical</span>}
        <span className={`rr-status rr-status--${state}`}>{STATUS_LABEL[state]}</span>
      </header>

      <dl className={`rr-attrs${d?.action === "reject" ? " is-struck" : ""}`}>
        {keys.map((k) => {
          const v = attrs?.[k];
          if (!v && !REQUIRED_ATTRS.has(k)) return null;
          if (!v && f.category !== "medications" && f.category !== "follow_ups") return null;
          return (
            <div key={k} className={LONG_ATTRS.has(k) ? "rr-attr rr-attr--long" : "rr-attr"}>
              <dt>{ATTR_LABEL[k] ?? k}</dt>
              <dd>{v ? v : <em className="rr-missing">Not stated in the document</em>}</dd>
            </div>
          );
        })}
        {!attrs && <div className="rr-attr"><dd><em className="rr-missing">No verified value</em></dd></div>}
      </dl>

      {f.issues.length > 0 && !d && (
        <ul className="rr-issues">
          {f.issues.slice(0, selected ? 6 : 2).map((i, n) => (
            <li key={n}><Icon.alert size={14} />{i}</li>
          ))}
        </ul>
      )}

      <div className="rr-sources">
        {f.opinions
          .filter((o, i, arr) => arr.findIndex((x) => x.voter === o.voter) === i)
          .map((o) => (
            <span key={o.voter} className={`rr-voter${o.trusted ? "" : " is-bad"}`}
              title={o.trusted ? `${VOTER_LABEL[o.voter]} verified` : `${VOTER_LABEL[o.voter]} failed verification`}>
              {o.trusted ? <Icon.check size={11} /> : <Icon.x size={11} />}
              {VOTER_LABEL[o.voter]}
            </span>
          ))}
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <motion.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: dur.base }} style={{ overflow: "hidden" }}>
            {f.quote && <blockquote className="rr-quote">{f.quote}</blockquote>}
            <div className="rr-details">
              <small>What each source read</small>
              {f.opinions.map((o) => (
                <p key={o.voter + o.path} className={o.trusted ? "" : "is-bad"}>
                  <b>{VOTER_LABEL[o.voter]}</b> {summarize(o.attrs) || "(nothing)"}
                  {!o.trusted && o.ground_issues.length > 0 && <span> · {o.ground_issues[0]}</span>}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.form key="edit" className="rr-edit" onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onSubmit={(e) => { e.preventDefault(); void run("edit", draft); }}>
            {keys.map((k) => (
              <label key={k}>
                <span>{ATTR_LABEL[k] ?? k}</span>
                {LONG_ATTRS.has(k) ? (
                  <textarea rows={2} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                ) : (
                  <input value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                )}
              </label>
            ))}
            <p className="rr-hint">Type the value exactly as the original document states it.</p>
            <div className="rr-actions">
              <button className="rr-btn rr-btn--primary rr-btn--sm" disabled={busy} type="submit">Save</button>
              <button className="rr-btn rr-btn--ghost rr-btn--sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </motion.form>
        ) : d ? (
          <motion.div key="done" className="rr-decided" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span><Icon.check size={14} /> {STATUS_LABEL[d.action]} by {d.by}</span>
            {!locked && <button className="rr-link" onClick={stop(startEdit)}>Change</button>}
          </motion.div>
        ) : !locked ? (
          <motion.div key="actions" className="rr-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <motion.button whileTap={{ scale: 0.96 }} transition={spring} className="rr-btn rr-btn--primary rr-btn--sm"
              disabled={busy || !f.proposed} onClick={stop(() => void run("confirm"))}>
              <Icon.check size={15} /> Confirm
            </motion.button>
            <button className="rr-btn rr-btn--ghost rr-btn--sm" disabled={busy} onClick={stop(startEdit)}>
              <Icon.edit size={15} /> Edit
            </button>
            <button className="rr-btn rr-btn--danger rr-btn--sm" disabled={busy} onClick={stop(() => void run("reject"))}>
              <Icon.x size={15} /> Remove
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}
