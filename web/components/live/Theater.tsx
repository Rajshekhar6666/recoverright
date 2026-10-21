"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { CATEGORY_LABEL, currentAttrs, timeAgo } from "@/lib/review";
import type { ReviewData, RunMeta } from "@/lib/types";
import { useLiveRun } from "@/lib/useLiveRun";
import { DEMO_FILENAME, DEMO_RECON } from "@/lib/theater/demo";
import { buildModel, clock, evMs, flat, type Ev, type NodeKey, type StageKey, type Tone } from "@/lib/theater/model";
import { SoundFx, sfxFor } from "@/lib/theater/sound";
import { useDemoRun } from "@/lib/theater/useDemoRun";
import { ComparePanel, FinalPanel, LogPanel, MetricsPanel, SourcePanel, StageRail, VerifyPanel, type ConnInfo, type ReconRow } from "./Panels";
import { PixelIcon, PixelText } from "./Pixel";
import SceneCanvas, { type NodeLabel } from "./SceneCanvas";

type ApiState = "pending" | "ok" | "down";
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      if (!query) return () => {};
      query.addEventListener?.("change", onChange);
      return () => query.removeEventListener?.("change", onChange);
    },
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    () => false,
  );
}

const SPLASH_TEXT: Partial<Record<StageKey, string>> = { parse: "PARSING THE DOCUMENT", a: "READER A EXTRACTS", b: "READER B EXTRACTS", ground: "CHECKING THE EVIDENCE", reconcile: "RECONCILING", review: "WAITING FOR A NURSE" };

export default function Theater({ runId }: { runId: string }) {
  const router = useRouter();
  const demo = runId === "demo";
  const stream = useLiveRun(runId, !demo);
  const sim = useDemoRun(demo);
  const raw: Ev[] = demo ? sim.events : (stream.events as unknown as Ev[]);
  const conn = demo ? "open" : stream.conn;

  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [run, setRun] = useState<RunMeta | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [apiState, setApiState] = useState<ApiState>(demo ? "ok" : "pending");
  const [replay, setReplay] = useState<{ at: number; playing: boolean; speed: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [present, setPresent] = useState(false);
  const [idle, setIdle] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [splash, setSplash] = useState<{ id: number; text: string; tone: Tone } | null>(null);
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const fx = useRef<SoundFx | null>(null);
  if (fx.current === null) fx.current = new SoundFx();

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);

  // ---- run metadata + review data (real backend only; the demo has none)
  useEffect(() => {
    if (demo) return;
    let alive = true, fails = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const [r, all] = await Promise.all([api.getRun(runId), api.listRuns()]);
        if (!alive) return;
        fails = 0; setApiState("ok"); setRun(r); setRuns(all);
        if (r.status === "needs_review" || r.status === "approved") api.getReview(runId).then((d) => alive && setReview(d)).catch(() => undefined);
        timer = setTimeout(tick, r.status === "approved" || r.status === "failed" ? 8000 : 2500);
      } catch { if (alive) { fails++; if (fails >= 2) setApiState("down"); timer = setTimeout(tick, 5000); } }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId, demo]);

  // ---- replay
  const replaying = replay !== null;
  useEffect(() => {
    if (!replay?.playing) return;
    const id = setTimeout(() => setReplay((r) => {
      if (!r) return r;
      const at = Math.min(r.at + 1, raw.length);
      return { ...r, at, playing: at < raw.length };
    }), 420 / replay.speed);
    return () => clearTimeout(id);
  }, [replay, raw.length]);
  const events = useMemo(() => (replay ? raw.slice(0, replay.at) : raw), [raw, replay]);

  const approved = !replaying && (demo ? sim.approved : run?.status === "approved");
  const failed = !replaying && (run?.status === "failed" || raw.some((e) => e.type === "run.failed"));
  const reviewReadyRaw = raw.some((e) => e.type === "review.ready");
  const busy = !replaying && !approved && !failed && (demo ? !reviewReadyRaw : run ? run.status === "processing" || run.status === "queued" : true);

  const model = useMemo(() => buildModel(events, { approved, runStatus: demo ? undefined : run?.status, nowMs: 0, busy: false }), [events, approved, run?.status, demo]);
  const t0 = model.t0;
  const lastMs = events.length ? evMs(events[events.length - 1]) : 0;
  const elapsed = events.length ? (busy ? Math.max(0, now - t0) : Math.max(0, lastMs - t0)) : 0;
  const rate = useMemo(() => Math.round((events.filter((e) => evMs(e) >= (busy ? now : lastMs) - 5000).length / 5) * 10) / 10, [events, now, busy, lastMs]);

  // ---- reconciled rows: real review data when it exists, the simulator's, or just the verdicts so far
  const recon: ReconRow[] = useMemo(() => {
    if (!demo && review) return review.fields.map((it) => ({ id: it.field.field_id, category: it.field.category, status: it.field.status, final: flat(currentAttrs(it)) || "", issues: it.field.issues ?? [], blockId: it.field.block_id }));
    if (demo) return model.reconciled ? DEMO_RECON : model.verdicts.map((v) => ({ id: v.fieldId || String(v.seq), category: v.category, status: v.status, final: "…", issues: [] }));
    return model.verdicts.map((v) => ({ id: v.fieldId || String(v.seq), category: v.category, status: v.status, final: "(values load when review opens)", issues: [] }));
  }, [demo, review, model.reconciled, model.verdicts]);
  const focusBlock = !demo ? review?.fields.find((f) => f.field.status !== "agreed")?.field.block_id ?? undefined : undefined;

  // ---- cinematic stage splash (only for real stage changes while watching, never on first load)
  const prevKey = useRef<string | null>(null);
  const prevApproved = useRef(false);
  useEffect(() => {
    const key = model.activeKey;
    if (prevKey.current === null) { prevKey.current = key; return; }
    if (key && key !== prevKey.current && !replaying) {
      const t = SPLASH_TEXT[key];
      if (t) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Show the one-shot overlay for a model transition.
        setSplash({ id: Date.now(), text: t, tone: "info" });
        fx.current?.play("stage");
      }
    }
    prevKey.current = key;
  }, [model.activeKey, replaying]);
  useEffect(() => {
    if (approved && !prevApproved.current) { setSplash({ id: Date.now(), text: "APPROVED AND LOCKED", tone: "ok" }); fx.current?.play("approve"); }
    prevApproved.current = approved;
  }, [approved]);
  useEffect(() => {
    if (!failed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show the one-shot overlay when the run fails.
    setSplash({ id: Date.now(), text: "RUN FAILED", tone: "bad" });
    fx.current?.play("fail");
  }, [failed]);
  useEffect(() => { if (!splash) return; const t = setTimeout(() => setSplash(null), 2400); return () => clearTimeout(t); }, [splash]);

  const onNewEvent = useCallback((e: Ev) => { const s = sfxFor(e.type, e.payload); if (s) fx.current?.play(s); }, []);
  const toggleSound = useCallback(async () => {
    if (fx.current?.enabled) { fx.current.disable(); setSoundOn(false); } else setSoundOn((await fx.current?.enable()) ?? false);
  }, []);

  // ---- presentation mode (CSS-based so it works everywhere; also asks the browser for real fullscreen)
  const togglePresent = useCallback(async () => {
    const el = root.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
    const inFs = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    if (!present) {
      setPresent(true);
      try { if (el?.requestFullscreen) await el.requestFullscreen(); else await el?.webkitRequestFullscreen?.(); } catch { /* CSS presentation mode still applies */ }
    } else {
      setPresent(false);
      try { if (inFs) { if (document.exitFullscreen) await document.exitFullscreen(); else await doc.webkitExitFullscreen?.(); } } catch { /* ignore */ }
    }
  }, [present]);
  useEffect(() => {
    // The browser's own Esc leaves fullscreen without telling us: keep our state in sync.
    const onChange = () => { const d = document as Document & { webkitFullscreenElement?: Element }; if (!document.fullscreenElement && !d.webkitFullscreenElement) setPresent(false); };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => { document.removeEventListener("fullscreenchange", onChange); document.removeEventListener("webkitfullscreenchange", onChange); };
  }, []);
  useEffect(() => {
    if (!present) return;
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000); };
    wake(); window.addEventListener("mousemove", wake);
    return () => { window.removeEventListener("mousemove", wake); clearTimeout(t); };
  }, [present]);

  // ---- keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "f") { e.preventDefault(); void togglePresent(); }
      else if (key === "s") void toggleSound();
      else if (key === "r" && raw.length) setReplay({ at: 0, playing: true, speed: 1 });
      else if (key === "l") setReplay(null);
      else if (key === " " && replay) { e.preventDefault(); setReplay({ ...replay, playing: !replay.playing, at: replay.at >= raw.length ? 0 : replay.at }); }
      else if (key === "d") router.push(demo ? "/live" : "/live/demo");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [togglePresent, toggleSound, raw.length, replay, router, demo]);

  // ---- derived display state
  const lastEventAt = demo ? (raw.length ? evMs(raw[raw.length - 1]) : 0) : stream.lastEventAt;
  const sinceLast = lastEventAt ? Math.max(0, Math.round((now - lastEventAt) / 1000)) : null;
  const stalled = busy && !demo && conn === "open" && raw.length > 0 && sinceLast !== null && sinceLast > 20;
  const lostApi = !demo && apiState === "down" && raw.length > 0;
  const booting = !demo && raw.length === 0 && apiState === "pending" && conn !== "closed";
  const offline = !demo && raw.length === 0 && (apiState === "down" || conn === "closed");

  const mode: { cls: string; text: string } = demo ? { cls: "demo", text: "SIMULATED DEMO" }
    : replaying ? { cls: "replay", text: "REPLAY" }
    : failed ? { cls: "bad", text: "FAILED" }
    : conn === "retrying" ? { cls: "warn", text: "RECONNECTING" }
    : busy ? { cls: "live", text: "LIVE" }
    : approved ? { cls: "ok", text: "APPROVED" }
    : model.reviewReady ? { cls: "warn", text: "AWAITING REVIEW" } : { cls: "idle", text: raw.length ? "FINISHED" : "STANDBY" };

  const connInfo: ConnInfo = {
    stream: demo ? "SIMULATED" : replaying ? "REPLAY" : conn === "open" ? "OPEN" : conn === "connecting" ? "CONNECTING" : conn === "retrying" ? "RECONNECTING" : busy ? "CLOSED (unexpected)" : "CLOSED (run ended)",
    tone: demo ? "info" : conn === "open" || replaying ? "ok" : conn === "retrying" || conn === "connecting" ? "warn" : busy ? "bad" : "info",
    api: demo ? "not used" : apiState === "ok" ? "OK" : apiState === "down" ? "UNREACHABLE" : "CHECKING",
    apiTone: demo ? "info" : apiState === "ok" ? "ok" : apiState === "down" ? "bad" : "warn",
    lastEvent: sinceLast === null ? "none yet" : `${sinceLast}s ago`,
    reconnects: demo ? 0 : stream.reconnects,
    mode: demo ? "demo" : replaying ? "replay" : "live",
  };

  const nl = (k: NodeKey, title: string, sub: string): NodeLabel => ({ title, sub, state: model.nodes[k] });
  const labels: Record<NodeKey, NodeLabel> = {
    doc: nl("doc", "DOCUMENT", short((demo ? DEMO_FILENAME : run?.filename) ?? "", 20)),
    parse: nl("parse", "PARSER", model.blocks.length ? `${model.blocks.length} blocks` : ""),
    a: nl("a", "READER A", model.fa.length || model.nodes.a !== "idle" ? short(model.models.a, 22) : ""),
    b: nl("b", "READER B", model.fb.length || model.nodes.b !== "idle" ? short(model.models.b, 22) : ""),
    ground: nl("ground", "EVIDENCE", model.ground.a || model.ground.b ? `${model.metrics.verified} ok · ${model.metrics.failedQuotes} fail` : ""),
    recon: nl("recon", "RECONCILE", model.counts ? `${model.counts.agreed} agreed · ${model.counts.review + model.counts.conflict + model.counts.rejected} to check` : model.verdicts.length ? `${model.verdicts.length} fields` : ""),
    human: nl("human", "HUMAN REVIEW", model.nodes.human === "waiting" ? "waiting" : model.nodes.human === "done" ? "reviewed" : ""),
    lock: nl("lock", "APPROVED", approved ? "locked" : ""),
  };

  const reviewHeld = recon.filter((r) => r.status !== "agreed").length;
  const startedAgo = !demo && run ? timeAgo(run.created_at) : "";
  const errs: [string, string][] = [];
  if (model.errors.a) errs.push(["READER A FAILED", model.errors.a]);
  if (model.errors.b) errs.push(["READER B FAILED", model.errors.b]);

  // ---- full-screen states before there is anything to show
  if (booting) return (
    <div className="lt lt--center" ref={root}><div className="lt-boot" role="status" aria-live="polite"><PixelIcon name="doc" scale={6} /><PixelText text="CONNECTING" px={4} color="#2ee6ff" /><div className="lt-bar"><i /></div><p>Opening the live event stream for {runId}…</p></div></div>
  );
  if (offline) return (
    <div className="lt lt--center" ref={root}>
      <div className="lt-boot is-bad" role="alert">
        <PixelIcon name="shield" scale={6} dim /><PixelText text="NO SIGNAL" px={4} color="#ff5d78" />
        <p>{conn === "closed" && apiState !== "down" ? "This run was not found, or its stream closed." : "The API cannot be reached. Is it running on port 8000?"} Retrying in the background.</p>
        <div className="lt-actions"><Link href="/live/demo" className="lt-btn is-demo">Open the simulated demo</Link><Link href="/live" className="lt-btn">Find the newest run</Link></div>
      </div>
    </div>
  );

  const summary = `${mode.text}. ${model.narration.big} ${model.narration.small}`;
  return (
    <div className={`lt${present ? " is-present" : ""}${present && idle ? " is-idle" : ""}${reduced ? " is-reduced" : ""}${demo ? " is-demo" : ""}`} ref={root}>
      <div className="lt-fx" aria-hidden="true" />
      <header className="lt-top">
        <div className="lt-brand"><PixelIcon name="shield" scale={2} /><div><PixelText text="RECOVERRIGHT" px={2} color="#eaf6ff" /><small>LIVE THEATER</small></div></div>
        <span className={`lt-mode is-${mode.cls}`} role="status"><i aria-hidden="true" />{mode.text}</span>
        <div className="lt-run">
          <span><small>RUN</small><b title={runId}>{short(demo ? "SIMULATION" : runId, 18)}</b></span>
          <span><small>FILE</small><b>{short(demo ? DEMO_FILENAME : run?.filename ?? "—", 26)}</b></span>
          {startedAgo && <span className="lt-hide-present"><small>STARTED</small><b>{startedAgo}</b></span>}
        </div>
        <div className="lt-clock" aria-label={`Processing time ${clock(elapsed)}`}><PixelText text={clock(elapsed)} px={4} color={busy ? "#2ee6ff" : "#8aa4c8"} /><small>{busy ? "PROCESSING" : "ELAPSED"}</small></div>
        <div className="lt-ctl">
          {!demo && runs.length > 1 && !present && (
            <select aria-label="Choose a run" value={runId} onChange={(e) => { setReplay(null); router.push(`/live/${e.target.value}`); }}>
              {runs.slice(0, 12).map((r) => <option key={r.run_id} value={r.run_id}>{short(r.filename, 24)} · {timeAgo(r.created_at)}</option>)}
            </select>
          )}
          {!replay
            ? <button className="lt-btn" disabled={!raw.length} onClick={() => setReplay({ at: 0, playing: true, speed: 1 })} title="R">REPLAY</button>
            : <>
              <button className="lt-btn" onClick={() => setReplay({ ...replay, playing: !replay.playing, at: replay.at >= raw.length ? 0 : replay.at })} title="Space">{replay.playing ? "PAUSE" : "PLAY"}</button>
              <select aria-label="Replay speed" value={replay.speed} onChange={(e) => setReplay({ ...replay, speed: Number(e.target.value) })}>{[1, 2, 4].map((s) => <option key={s} value={s}>{s}x</option>)}</select>
              <button className="lt-btn is-live" onClick={() => setReplay(null)} title="L">LIVE</button>
            </>}
          {demo ? <button className="lt-btn is-demo" onClick={sim.restart}>RESTART</button> : null}
          <button className={`lt-btn${soundOn ? " is-on" : ""}`} onClick={toggleSound} aria-pressed={soundOn} title="S">SOUND {soundOn ? "ON" : "OFF"}</button>
          <button className="lt-btn" onClick={togglePresent} aria-pressed={present} title="F">{present ? "EXIT" : "PRESENT"}</button>
          {!present && (demo ? <Link className="lt-btn" href="/live">REAL RUN</Link> : <Link className="lt-btn is-demo" href="/live/demo" title="D">DEMO</Link>)}
        </div>
      </header>

      {replay && (
        <div className="lt-scrub"><span>REPLAY</span><input type="range" min={0} max={raw.length} value={replay.at} aria-label="Replay position" onChange={(e) => setReplay({ ...replay, at: Number(e.target.value), playing: false })} /><span>{replay.at}/{raw.length}</span></div>
      )}

      <div className="lt-banners" aria-live="polite">
        {demo && <p className="is-demo"><b>SIMULATED DEMO.</b> Every event, model name and value here is generated locally for presentation. Nothing is from a real patient or a real AI model.</p>}
        {!demo && conn === "retrying" && !replaying && <p className="is-warn"><b>RECONNECTING.</b> The live stream dropped. Showing the last known state while the browser reconnects (attempt {stream.reconnects}).</p>}
        {!demo && conn === "closed" && busy && raw.length > 0 && <p className="is-bad"><b>STREAM CLOSED.</b> The server ended the event stream before the run finished. Reload to reconnect.</p>}
        {stalled && <p className="is-warn"><b>NO EVENTS FOR {sinceLast}s.</b> The pipeline may be waiting on a model, or has stalled.</p>}
        {lostApi && !replaying && <p className="is-warn"><b>API UNREACHABLE.</b> Showing the last known state. Run status and review data are not updating.</p>}
        {errs.map(([t, why]) => <p key={t} className="is-bad"><b>{t}:</b> {sentence(short(why, 160))}{failed ? "" : " The other reader continues."}</p>)}
        {failed && <p className="is-bad"><b>THE RUN FAILED.</b> {sentence(model.errors.run || "No reason was reported")} Nothing reached the patient.</p>}
      </div>

      <p className="lt-cap" aria-live="polite"><b>{model.narration.big}</b><span>{model.narration.small}</span></p>

      <StageRail stages={model.stages} nowMs={now} t0={t0} busy={busy} />

      <div className="lt-main">
        <SourcePanel m={model} focusBlock={focusBlock} />
        <section className="lt-stage" aria-label="Control room">
          <SceneCanvas nodes={model.nodes} events={events} approved={approved} reduced={reduced} labels={labels} summary={summary} fitHeight={present} onNewEvent={onNewEvent} />
          {splash && <div className={`lt-splash is-${splash.tone}`} key={splash.id} aria-hidden="true"><PixelText text={splash.text} px={4} color={splash.tone === "ok" ? "#52f08a" : splash.tone === "bad" ? "#ff5d78" : "#2ee6ff"} /></div>}
        </section>
        <div className="lt-side"><VerifyPanel m={model} /><FinalPanel m={model} recon={recon} approved={approved} failed={failed} /></div>
      </div>

      <div className="lt-bottom">
        <ComparePanel m={model} recon={recon} models={model.models} labels={CATEGORY_LABEL} />
        <LogPanel log={model.log} live={busy} />
        <MetricsPanel m={model} rate={rate} elapsed={elapsed} conn={connInfo} nowMs={now} busy={busy} />
      </div>

      <footer className="lt-foot">
        <span>{reviewHeld ? `${reviewHeld} field${reviewHeld === 1 ? "" : "s"} waiting for human review` : "Software checks first, a person approves last"}</span>
        <span className="lt-keys"><kbd>F</kbd> present <kbd>R</kbd> replay <kbd>L</kbd> live <kbd>S</kbd> sound <kbd>D</kbd> {demo ? "real run" : "demo"}</span>
      </footer>
    </div>
  );
}
