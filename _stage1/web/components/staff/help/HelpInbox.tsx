"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/staff/icons";
import { useSearch } from "@/components/staff/Shell";
import { useHelp } from "@/lib/staffHelp";
import { age, clockTime, dayTime, initials, mmss, ms } from "@/lib/time";
import type { HelpRequest } from "@/lib/types";
import { Heard, HelpActions, SeverityBadge, SlaMeter, SourceTags, StatusBadge } from "./HelpBits";

type Tab = "needs" | "progress" | "resolved" | "all";
const TABS: { key: Tab; label: string; test: (h: HelpRequest) => boolean }[] = [
  { key: "needs", label: "Needs action", test: (h) => h.status === "open" },
  { key: "progress", label: "In progress", test: (h) => h.status === "acknowledged" || h.status === "escalated" },
  { key: "resolved", label: "Resolved", test: (h) => h.status === "resolved" },
  { key: "all", label: "All", test: () => true },
];
const ACTION_ICON: Record<string, { tone: string; text: string }> = {
  created: { tone: "bad", text: "Help requested" }, acknowledged: { tone: "info", text: "Acknowledged" }, call: { tone: "info", text: "Call" },
  escalated: { tone: "warn", text: "Escalated" }, resolved: { tone: "ok", text: "Resolved" }, note: { tone: "mute", text: "Note" },
};

export default function HelpInbox() {
  const hp = useHelp();
  const q = useSearch().trim().toLowerCase();
  const [tab, setTab] = useState<Tab>("needs");
  const [hideTests, setHideTests] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false); // the person picked a card (do not jump away from it)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id) { setSel(id); setChosen(true); setTab("all"); }
  }, []);

  const base = useMemo(() => hp.items.filter((h) => (!hideTests || h.source !== "test") && (!q || `${h.patient_name} ${h.heard} ${h.label}`.toLowerCase().includes(q))), [hp.items, hideTests, q]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, base.filter(t.test).length])) as Record<Tab, number>, [base]);
  const list = useMemo(() => base.filter(TABS.find((t) => t.key === tab)!.test), [base, tab]);

  // keep a sensible selection: stay on the chosen card; otherwise follow the top of the list
  useEffect(() => {
    if (chosen && sel && hp.items.some((h) => h.id === sel)) return;
    const top = list[0]?.id ?? null;
    if (top !== sel) setSel(top);
  }, [list, sel, chosen, hp.items]);

  // open the inbox on the tab that has something to do
  const [tabbed, setTabbed] = useState(false);
  useEffect(() => {
    if (tabbed || hp.conn !== "ok") return;
    setTabbed(true);
    if (!new URLSearchParams(window.location.search).get("open") && counts.needs === 0 && counts.progress > 0) setTab("progress");
  }, [tabbed, hp.conn, counts]);

  const current = hp.items.find((h) => h.id === sel) ?? null;
  const s = hp.summary;

  // When the nurse acts on a request it moves to another tab (Needs action -> In progress -> Resolved).
  // Follow it, so the list and the detail panel never go out of step and the screen never goes blank mid-task.
  const tabOf = (h: HelpRequest): Tab => (h.status === "open" ? "needs" : h.status === "resolved" ? "resolved" : "progress");
  useEffect(() => {
    if (!current || !chosen || tab === "all") return;
    if (!TABS.find((t) => t.key === tab)!.test(current)) setTab(tabOf(current));
  }, [current?.status, current?.id, chosen, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rr-page hx-page">
      <div className="rr-page-head">
        <div>
          <h1 className="rr-title">Help requests</h1>
          <p className="rr-sub">Patients who asked for help from their phone. The most urgent are always at the top.</p>
        </div>
        <div className="hx-head-tools">
          <button className={`rr-btn rr-btn--ghost rr-btn--sm${hp.soundOn ? " is-on" : ""}`} onClick={() => void hp.toggleSound()} aria-pressed={hp.soundOn}>
            {hp.soundOn ? <Icon.volume size={15} /> : <Icon.volumeOff size={15} />} Alert sound {hp.soundOn ? "on" : "off"}
          </button>
          <label className="hx-check"><input type="checkbox" checked={hideTests} onChange={(e) => setHideTests(e.target.checked)} /> Hide test alerts</label>
        </div>
      </div>

      {hp.soundBlocked && <p className="rr-error">Your browser is blocking sound. Click anywhere on the page once to allow alert sounds.</p>}
      {hp.conn === "down" && <p className="rr-error" role="alert">Cannot reach the API ({hp.error}). Showing the last known requests. Retrying…</p>}

      <div className="hx-stats">
        <div className={`hx-stat${s && s.unacked ? " is-bad" : ""}`}><small>Waiting for a nurse</small><b>{s?.unacked ?? "–"}</b></div>
        <div className={`hx-stat${s && s.overdue ? " is-bad" : ""}`}><small>Past the response target</small><b>{s?.overdue ?? "–"}</b></div>
        <div className="hx-stat"><small>In progress</small><b>{s ? s.acknowledged + s.escalated : "–"}</b></div>
        <div className="hx-stat"><small>Average response time</small><b>{s?.avg_ack_seconds != null ? mmss(s.avg_ack_seconds * 1000) : "–"}</b></div>
      </div>

      <div className="hx-tabs" role="tablist" aria-label="Filter requests">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => { setTab(t.key); setChosen(false); }}>
            {t.label}<span>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {hp.conn === "connecting" && hp.items.length === 0 ? (
        <div className="rr-card">{[0, 1, 2].map((i) => <div key={i} className="rr-skel" style={{ height: 74, marginBottom: 10 }} />)}</div>
      ) : (
        <div className="hx-split">
          <ul className="hx-list" aria-label="Help requests">
            {list.length === 0 && (
              <li className="hx-empty rr-card">
                <span className="rr-empty-icon"><Icon.shield size={26} /></span>
                <b>{tab === "needs" ? "All clear" : "Nothing here"}</b>
                <small>{base.length === 0 && hp.items.length === 0 ? <>No patient has asked for help yet. To try it, open <Link href="/p/demo" target="_blank">the patient app</Link> and say “I need help”.</> : tab === "needs" ? "No patient is waiting for a nurse right now." : "No requests in this view."}</small>
              </li>
            )}
            {list.map((h) => <Row key={h.id} h={h} now={hp.now} active={h.id === sel} onPick={() => { setSel(h.id); setChosen(true); }} />)}
          </ul>
          <section className="hx-detail" aria-live="polite">{current ? <Detail h={current} now={hp.now} onActed={() => setChosen(true)} /> : <div className="hx-empty rr-card"><small>Select a request to see the details.</small></div>}</section>
        </div>
      )}
    </div>
  );
}

function Row({ h, now, active, onPick }: { h: HelpRequest; now: number; active: boolean; onPick: () => void }) {
  const unacked = h.status === "open";
  return (
    <li>
      <button className={`hx-row hx-row--${h.severity}${active ? " is-active" : ""}${unacked ? " is-urgent" : ""}${h.status === "resolved" ? " is-done" : ""}`} onClick={onPick} aria-pressed={active}>
        <span className="cc-avatar cc-avatar--sm">{initials(h.patient_name)}</span>
        <span className="hx-row-main">
          <span className="hx-row-top"><b>{h.patient_name}</b><SeverityBadge s={h.severity} /></span>
          <span className="hx-row-heard">{h.source === "button" ? "Pressed the help button" : `“${h.heard}”`}</span>
          <span className="hx-row-meta"><StatusBadge s={h.status} /><SourceTags h={h} /><time>{age(now - ms(h.created_at))} ago</time></span>
        </span>
      </button>
    </li>
  );
}

function Detail({ h, now, onActed }: { h: HelpRequest; now: number; onActed: () => void }) {
  const p = h.patient;
  return (
    <div className={`hx-card hx-card--${h.severity}`}>
      <header className="hx-card-head">
        <span className="cc-avatar">{initials(h.patient_name)}</span>
        <div>
          <h2>{h.patient_name}</h2>
          <small>{p?.language ? `${p.language.toUpperCase()} · ` : ""}Requested {dayTime(h.created_at)}</small>
        </div>
        <div className="hx-card-badges"><SeverityBadge s={h.severity} /><StatusBadge s={h.status} /></div>
      </header>

      <Heard h={h} />
      <SlaMeter h={h} now={now} />
      <div className="hx-meta"><SourceTags h={h} />{h.calls > 0 && <span className="hx-tag">{h.calls} call{h.calls === 1 ? "" : "s"} made</span>}
        {h.acknowledged_by && <span className="hx-tag">Seen by {h.acknowledged_by}</span>}{h.resolution_label && <span className="hx-tag hx-tag--ok">{h.resolution_label}</span>}</div>

      <HelpActions h={h} onActed={onActed} />

      {p && h.run_id !== "demo" && (
        <div className="hx-links">
          <Link href={`/staff/patients/${h.run_id}`} className="rr-btn rr-btn--ghost rr-btn--sm"><Icon.user size={15} /> Patient record</Link>
          <Link href={`/staff/runs/${h.run_id}/review`} className="rr-btn rr-btn--ghost rr-btn--sm"><Icon.file size={15} /> Discharge plan</Link>
        </div>
      )}

      <h3 className="hx-h3">History</h3>
      <ol className="hx-timeline">
        {h.timeline.map((t, i) => {
          const m = ACTION_ICON[t.action] ?? { tone: "mute", text: t.action };
          return (
            <li key={i} className={`t-${m.tone}`}>
              <i aria-hidden="true" />
              <div><b>{m.text}</b>{t.actor !== "patient" && <span> · {t.actor}</span>}{t.note && <p>{t.note}</p>}</div>
              <time>{clockTime(t.at)}</time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
