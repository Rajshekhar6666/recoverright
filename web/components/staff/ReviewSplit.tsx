"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { needsDecision } from "@/lib/review";
import type { Action, Attrs, Block, PatientDetail, ReviewData } from "@/lib/types";
import FieldCard from "./FieldCard";
import { Icon } from "./icons";
import PatientOverviewPanel from "./PatientOverviewPanel";

type Tab = "todo" | "done" | "all";
type LeftTab = "overview" | "source";
const RANK: Record<string, number> = { done: -1, agreed: 0, review: 1, conflict: 2, rejected: 3 };

type Group = { kind: "text"; block: Block } | { kind: "table"; id: string; rows: Block[] };

function groupBlocks(blocks: Block[]): Group[] {
  const out: Group[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === "table_row" && last?.kind === "table" && last.id === b.table_id) last.rows.push(b);
    else if (b.type === "table_row") out.push({ kind: "table", id: b.table_id ?? b.block_id, rows: [b] });
    else out.push({ kind: "text", block: b });
  }
  return out;
}

function Marked({ text, quote }: { text: string; quote: string | null }) {
  if (!quote) return <>{text}</>;
  const i = text.toLowerCase().indexOf(quote.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rr-mark">{text.slice(i, i + quote.length)}</mark>
      {text.slice(i + quote.length)}
    </>
  );
}

export default function ReviewSplit(props: {
  data: ReviewData;
  locked: boolean;
  onDecide: (fieldId: string, action: Action, attrs?: Attrs) => Promise<void>;
  detail?: PatientDetail | null;
  onRefreshDetail?: () => Promise<void>;
  onOpenAddDoc?: () => void;
}) {
  const { data, locked, onDecide, detail, onRefreshDetail, onOpenAddDoc } = props;
  const { t, lang } = useLanguage();
  const { blocks, fields } = data;
  const todo = useMemo(() => fields.filter((f) => !f.decision && needsDecision(f.field)), [fields]);
  const done = useMemo(() => fields.filter((f) => f.decision), [fields]);
  const [tab, setTab] = useState<Tab>(locked ? "all" : todo.length ? "todo" : "all");
  const [leftTab, setLeftTab] = useState<LeftTab>("overview");
  const [selected, setSelected] = useState<string | null>(todo[0]?.field.field_id ?? fields[0]?.field.field_id ?? null);

  useEffect(() => {
    if (locked) setTab("all"); // once approved, show the whole plan
  }, [locked]);

  const blockRefs = useRef<Record<string, HTMLElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => fields.filter((f) => (tab === "all" ? true : tab === "done" ? !!f.decision : !f.decision && needsDecision(f.field))),
    [fields, tab],
  );
  const selectedItem = fields.find((f) => f.field.field_id === selected) ?? null;

  const blockInfo = useMemo(() => {
    const m = new Map<string, { status: string; fieldId: string }>();
    for (const it of fields) {
      const f = it.field;
      const ids = new Set([f.block_id, ...f.opinions.map((o) => o.block_id)].filter(Boolean) as string[]);
      const st = it.decision ? "done" : f.status;
      for (const id of ids) {
        const prev = m.get(id);
        if (!prev || RANK[st] > RANK[prev.status]) m.set(id, { status: st, fieldId: f.field_id });
      }
    }
    return m;
  }, [fields]);

  const active = useMemo(() => {
    const f = selectedItem?.field;
    return new Set(f ? ([f.block_id, ...f.opinions.map((o) => o.block_id)].filter(Boolean) as string[]) : []);
  }, [selectedItem]);

  const groups = useMemo(() => groupBlocks(blocks), [blocks]);

  // bring the selected field's source into view, and its card into view
  useEffect(() => {
    if (leftTab === "source") {
      const first = [...active][0];
      if (first) blockRefs.current[first]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (selected) listRef.current?.querySelector(`[data-field="${CSS.escape(selected)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected, active, leftTab]);

  const decide = useCallback(
    async (fieldId: string, action: Action, attrs?: Attrs) => {
      const idx = visible.findIndex((v) => v.field.field_id === fieldId);
      const next = visible.slice(idx + 1).find((v) => !v.decision && needsDecision(v.field) && v.field.field_id !== fieldId);
      await onDecide(fieldId, action, attrs);
      if (tab === "todo" && next) setSelected(next.field.field_id);
    },
    [onDecide, visible, tab],
  );

  // keyboard: j/k move, c confirms the selected field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = visible.findIndex((v) => v.field.field_id === selected);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const n = visible[Math.min(i + 1, visible.length - 1)];
        if (n) setSelected(n.field.field_id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = visible[Math.max(i - 1, 0)];
        if (n) setSelected(n.field.field_id);
      } else if (e.key === "c" && !locked && selectedItem && !selectedItem.decision && selectedItem.field.proposed) {
        decide(selectedItem.field.field_id, "confirm").catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, selectedItem, locked, decide]);

  const reg = (id: string) => (el: HTMLElement | null) => {
    blockRefs.current[id] = el;
  };
  const cls = (b: Block) => {
    const info = blockInfo.get(b.block_id);
    return `rr-block${info ? ` st-${info.status}` : ""}${active.has(b.block_id) ? " is-active" : ""}`;
  };
  const pick = (b: Block) => () => {
    const info = blockInfo.get(b.block_id);
    if (info) {
      setSelected(info.fieldId);
      setTab((tState) => (tState === "todo" && fields.find((f) => f.field.field_id === info.fieldId)?.decision ? "all" : tState));
    }
  };
  const quote = selectedItem?.field.quote ?? null;

  return (
    <div className="rr-split">
      {/* LEFT PANEL: Patient Overview (default) with toggle to view Source Document */}
      <section className="rr-pane rr-pane--left" aria-label="Patient Overview and Document">
        <header className="rr-pane-head pt-pane-head">
          <div className="pt-pane-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === "overview"}
              className={`pt-pane-tab ${leftTab === "overview" ? "is-active" : ""}`}
              onClick={() => setLeftTab("overview")}
            >
              <Icon.user size={15} /> {t.patientOverview}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === "source"}
              className={`pt-pane-tab ${leftTab === "source" ? "is-active" : ""}`}
              onClick={() => setLeftTab("source")}
            >
              <Icon.file size={15} /> {t.sourceDocument}
            </button>
          </div>
          <a className="rr-link" href={`${API}/runs/${data.run.run_id}/source`} target="_blank" rel="noreferrer">
            {t.openOriginal} <Icon.external size={13} />
          </a>
        </header>

        <div className="rr-pane-body pt-pane-body">
          {leftTab === "overview" ? (
            <PatientOverviewPanel
              runId={data.run.run_id}
              meta={data.run}
              data={data}
              detail={detail ?? null}
              onRefreshDetail={onRefreshDetail ?? (async () => {})}
              onViewSourceDoc={() => setLeftTab("source")}
              onOpenAddDoc={onOpenAddDoc ?? (() => {})}
            />
          ) : (
            <div className="rr-src">
              <div className="pt-doc-info-bar">
                <span><Icon.file size={14} /> {lang === "hi" ? "उद्धरण चिह्नों के साथ निकाले गए चिकित्सीय खंड" : "Showing extracted clinical blocks with quote highlights"}</span>
                <button
                  type="button"
                  className="rr-btn rr-btn--ghost rr-btn--sm"
                  onClick={() => setLeftTab("overview")}
                >
                  ← {t.patientOverview}
                </button>
              </div>
              {groups.map((g) => {
                if (g.kind === "text") {
                  const b = g.block;
                  const props = { ref: reg(b.block_id), className: cls(b), onClick: pick(b) };
                  if (b.type === "heading") return <h3 key={b.block_id} {...props}>{b.text}</h3>;
                  return (
                    <p key={b.block_id} {...props} data-li={b.type === "list_item" ? "1" : undefined}>
                      <Marked text={b.text} quote={active.has(b.block_id) ? quote : null} />
                    </p>
                  );
                }
                return (
                  <div key={g.id} className="rr-src-tablewrap">
                    <table className="rr-src-table">
                      <tbody>
                        {g.rows.map((r, ri) => (
                          <tr key={r.block_id} ref={reg(r.block_id)} className={`${cls(r)}${ri === 0 ? " is-head" : ""}`} onClick={pick(r)}>
                            {(r.cells ?? [r.text]).map((c, ci) => (ri === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* RIGHT PANEL: Document Review and Actions */}
      <section className="rr-pane rr-fields" aria-label="Extracted fields">
        <header className="rr-pane-head">
          <div className="rr-tabs" role="tablist">
            {([
              ["todo", t.todoTab(todo.length)],
              ["done", t.doneTab(done.length)],
              ["all", t.allTab(fields.length)],
            ] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`rr-tab${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
                {label}
                {tab === k && <motion.i layoutId="tab-underline" className="rr-tab-line" />}
              </button>
            ))}
          </div>
        </header>
        <div className="rr-pane-body" ref={listRef}>
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((it) => (
              <FieldCard
                key={it.field.field_id}
                item={it}
                selected={selected === it.field.field_id}
                locked={locked}
                onSelect={() => setSelected(it.field.field_id)}
                onDecide={(action, attrs) => decide(it.field.field_id, action, attrs)}
              />
            ))}
          </AnimatePresence>
          {visible.length === 0 && (
            <div className="rr-empty rr-empty--sm">
              <span className="rr-empty-icon"><Icon.check size={22} /></span>
              <b>{tab === "todo" ? t.allDecidedTitle : (lang === "hi" ? "यहाँ कुछ नहीं है" : "Nothing here")}</b>
              <small>{tab === "todo" ? t.allDecidedSub : (lang === "hi" ? "अन्य फ़ील्ड देखने के लिए टैब बदलें।" : "Switch tabs to see other fields.")}</small>
            </div>
          )}
        </div>
        <footer className="rr-hint-bar">
          <kbd>J</kbd><kbd>K</kbd> move · <kbd>C</kbd> confirm
        </footer>
      </section>
    </div>
  );
}
