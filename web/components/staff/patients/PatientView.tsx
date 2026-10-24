"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SeverityBadge, StatusBadge } from "@/components/staff/help/HelpBits";
import { Icon } from "@/components/staff/icons";
import RunPill from "@/components/staff/RunPill";
import StaffVoiceBar from "@/components/staff/StaffVoiceBar";
import { API, ApiError, api } from "@/lib/api";
import { useHelp } from "@/lib/staffHelp";
import { age, dayTime, dialable, initials, ms, telHref } from "@/lib/time";
import type { PatientDetail } from "@/lib/types";

function Contact({ label, name, phone }: { label: string; name?: string; phone?: string }) {
  const ok = dialable(phone);
  return (
    <div className="hx-contact">
      <div><small>{label}</small><b>{name || "Not recorded"}</b><span>{phone || "No phone number on file"}</span></div>
      {ok ? <a className="rr-btn rr-btn--ghost rr-btn--sm" href={telHref(phone!)}><Icon.phone size={15} /> Call</a>
        : <span className="rr-btn rr-btn--ghost rr-btn--sm is-off" aria-disabled="true" title={phone ? "Placeholder number: it cannot be dialled" : "No phone number on file"}><Icon.phone size={15} /> Call</span>}
    </div>
  );
}

export default function PatientView({ id }: { id: string }) {
  const hp = useHelp();
  const [d, setD] = useState<PatientDetail | null>(null);
  const [err, setErr] = useState<{ status: number; msg: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try { const r = await api.getPatient(id); if (!alive) return; setD(r); setErr(null); timer = setTimeout(load, 4000); }
      catch (e) {
        if (!alive) return;
        setErr({ status: e instanceof ApiError ? e.status : 0, msg: e instanceof Error ? e.message : "Cannot reach the API." });
        if (!(e instanceof ApiError && e.status === 404)) timer = setTimeout(load, 4000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  const token = (d?.run as any)?.patient_token || (d?.summary as any)?.patient_token || id;

  const copy = async () => {
    const slug = (d?.summary as any)?.patient_slug;
    const patientUrl = slug
      ? `${window.location.origin}/p/demo/${slug}`
      : `${window.location.origin}/p/${token}`;
    try { await navigator.clipboard.writeText(patientUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt("Copy this patient link:", patientUrl); }
  };

  if (err?.status === 404) return (
    <div className="rr-page"><div className="rr-card rr-empty"><span className="rr-empty-icon rr-empty-icon--bad"><Icon.x size={26} /></span><b>Patient not found</b><small>There is no discharge plan with this id.</small><Link href="/staff/patients" className="rr-btn rr-btn--primary">Back to patients</Link></div></div>
  );
  if (!d) return (
    <div className="rr-page">{err ? <p className="rr-error">{err.msg}</p> : [0, 1, 2].map((i) => <div key={i} className="rr-skel" style={{ height: i === 0 ? 110 : 180, marginBottom: 14 }} />)}</div>
  );

  const s = d.summary;
  return (
    <div className="rr-page hx-patient">
      <div style={{ marginBottom: 16 }}>
        <StaffVoiceBar activePatient={{ id, name: s.name }} />
      </div>
      <p className="hx-crumb"><Link href="/staff/patients">Patients</Link> <Icon.chevron size={12} /> {s.name}</p>
      <header className="rr-card hx-phead">
        <span className="cc-avatar hx-phead-av">{initials(s.name)}</span>
        <div className="hx-phead-main">
          <h1 className="rr-title">{s.name}</h1>
          <div className="hx-phead-meta"><RunPill status={s.status} /><span className="hx-tag">{(s.language || "en").toUpperCase()}</span><span className="hx-tag">{s.filename}</span><small>Added {dayTime(s.created_at)}</small></div>
        </div>
        <div className="hx-phead-actions">
          <Link href={`/staff/runs/${id}/review`} className="rr-btn rr-btn--primary rr-btn--sm"><Icon.file size={15} /> {s.status === "needs_review" ? "Review plan" : "Open plan"}</Link>
          <Link href={`/live/${id}`} target="_blank" className="rr-btn rr-btn--ghost rr-btn--sm"><Icon.pulse size={15} /> Live theater</Link>
          <Link href={(d?.summary as any)?.patient_slug ? `/p/demo/${(d?.summary as any)?.patient_slug}` : `/p/${token}`} target="_blank" className="rr-btn rr-btn--ghost rr-btn--sm"><Icon.phone size={15} /> Patient app</Link>
          <button className="rr-btn rr-btn--ghost rr-btn--sm" onClick={() => void copy()}><Icon.copy size={15} /> {copied ? "Link copied" : "Copy patient link"}</button>
        </div>
      </header>

      {s.help_active > 0 && (
        <div className="hx-attn hx-attn--slim" role="status"><header><span><Icon.siren size={18} /></span><h2>{s.help_active} open help request{s.help_active === 1 ? "" : "s"}</h2><Link href={`/staff/help?open=${d.help.find((h) => h.status !== "resolved")?.id ?? ""}`} className="rr-btn rr-btn--ghost rr-btn--sm">Open <Icon.chevron size={14} /></Link></header></div>
      )}

      <div className="hx-pgrid">
        <div className="hx-pcol">
          <section className="rr-card">
            <div className="cc-panel-head"><h2>Discharge plan</h2>{d.plan_approved_at && <small>Approved {dayTime(d.plan_approved_at)}{s.approved_by ? ` by ${s.approved_by}` : ""}</small>}</div>
            {d.plan.length === 0 ? (
              <div className="hx-noplan"><b>{s.status === "approved" ? "The plan is empty" : "Not approved yet"}</b><small>{s.status === "needs_review" ? `${s.to_check ?? 0} field${s.to_check === 1 ? "" : "s"} still need a nurse's decision. The patient sees nothing until it is approved.` : s.status === "failed" ? (d.run.error ?? "Processing failed.") : "The plan appears here once it has been reviewed and approved."}</small>
                {s.status === "needs_review" && <Link href={`/staff/runs/${id}/review`} className="rr-btn rr-btn--primary rr-btn--sm">Review now</Link>}</div>
            ) : (
              <div className="hx-plan">
                {d.plan.map((g) => (
                  <div key={g.category} className="hx-plan-group">
                    <h3>{g.label}<span>{g.items.length}</span></h3>
                    <ul>{g.items.map((it, i) => <li key={it.field_id ?? i}>{it.summary || "(empty)"}{it.edited && <em className="hx-edited">edited</em>}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rr-card">
            <div className="cc-panel-head"><h2>Activity</h2></div>
            {d.activity.length === 0 ? <small>No recorded activity.</small> : (
              <ol className="hx-timeline hx-timeline--roomy">
                {d.activity.map((a, i) => (
                  <li key={i} className={`t-${a.tone}`}><i aria-hidden="true" /><div><b>{a.text}</b><span> · {a.actor}</span>{a.note && <p>{a.note}</p>}</div><time>{dayTime(a.at)}</time></li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="hx-pcol">
          <section className="rr-card">
            <div className="cc-panel-head"><h2>Contact</h2></div>
            <Contact label="Patient" name={s.name} phone={s.phone} />
            <Contact label="Guardian" name={s.guardian_name} phone={s.guardian_phone} />
          </section>

          {((d as any).tasks?.length > 0 || (d as any).doses?.length > 0) && (
            <section className="rr-card">
              <div className="cc-panel-head">
                <h2>Recovery Tasks</h2>
                <small>
                  {(d as any).tasks?.filter((t: any) => t.status === "completed").length ?? 0} / {(d as any).tasks?.length ?? 0} completed
                </small>
              </div>
              <ul className="hx-hlist" style={{ marginTop: 8 }}>
                {(d as any).tasks?.slice(0, 5).map((t: any) => (
                  <li key={t.task_id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <b style={{ fontSize: "0.88rem" }}>{t.title}</b>
                      <span className={`rr-chip rr-chip--${t.status === "completed" ? "ok" : "warn"}`} style={{ fontSize: "0.75rem" }}>
                        {t.status}
                      </span>
                    </div>
                    {t.scheduled_time && <small style={{ color: "var(--muted, #666)" }}>{t.scheduled_time}</small>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(d as any).reminders && (d as any).reminders.length > 0 && (
            <section className="rr-card">
              <div className="cc-panel-head">
                <h2>Medication Reminders</h2>
                <small>
                  {(d as any).reminders.filter((r: any) => r.status === "delivered" || r.status === "acknowledged").length} / {(d as any).reminders.length} delivered
                </small>
              </div>
              <ul className="hx-hlist" style={{ marginTop: 8 }}>
                {(d as any).reminders.slice(0, 5).map((r: any) => (
                  <li key={r.job_id} style={{ padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <b style={{ fontSize: "0.88rem" }}>{r.medication_name} ({r.dose || "scheduled"})</b>
                      <span className={`rr-chip rr-chip--${r.status === "acknowledged" ? "ok" : r.status === "failed" ? "bad" : "warn"}`} style={{ fontSize: "0.75rem" }}>
                        {r.status}
                      </span>
                    </div>
                    <small style={{ color: "var(--muted, #666)" }}>
                      {r.scheduled_time} · Channel: {r.channel} {r.attempts > 1 ? `(${r.attempts} attempts)` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rr-card">
            <div className="cc-panel-head"><h2>Help requests</h2><small>{d.help.length} total</small></div>
            {d.help.length === 0 ? <small>This patient has not asked for help.</small> : (
              <ul className="hx-hlist">
                {d.help.map((h) => (
                  <li key={h.id}>
                    <Link href={`/staff/help?open=${h.id}`}>
                      <div className="hx-hlist-top"><SeverityBadge s={h.severity} /><StatusBadge s={h.status} /><time>{age(hp.now - ms(h.created_at))} ago</time></div>
                      <p>{h.source === "button" ? "Pressed the help button" : `“${h.heard}”`}</p>
                      {h.resolution_label && <small>{h.resolution_label}{h.resolved_by ? ` · ${h.resolved_by}` : ""}</small>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rr-card">
            <div className="cc-panel-head"><h2>Source document</h2></div>
            <p className="hx-doc"><Icon.file size={18} /> {s.filename}</p>
            <a href={api.sourceUrl(id)} target="_blank" rel="noreferrer" className="rr-btn rr-btn--ghost rr-btn--sm">View the original <Icon.external size={13} /></a>
            <small className="hx-hint">Served by {API.replace(/^https?:\/\//, "")}</small>
          </section>
        </div>
      </div>
    </div>
  );
}
