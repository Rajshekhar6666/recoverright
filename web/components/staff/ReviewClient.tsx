"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AddDocumentModal from "@/components/staff/AddDocumentModal";
import ApproveDialog from "@/components/staff/ApproveDialog";
import { Icon } from "@/components/staff/icons";
import ProcessingView from "@/components/staff/ProcessingView";
import ReviewSplit from "@/components/staff/ReviewSplit";
import RunPill from "@/components/staff/RunPill";
import StaffVoiceBar from "@/components/staff/StaffVoiceBar";
import { ApiError, api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { dur, fadeUp } from "@/lib/motion";
import { needsDecision } from "@/lib/review";
import { type TaskContextItem } from "@/lib/voiceEngine";
import { useRunEvents } from "@/lib/useEventStream";
import type { Action, Attrs, PatientDetail, PatientRow, ReviewData, RunMeta } from "@/lib/types";

function Seal() {
  return (
    <svg viewBox="0 0 52 52" width={44} height={44} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.circle cx="26" cy="26" r="23" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
      <motion.path d="M15 27l8 8 14-16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.45 }} />
    </svg>
  );
}

export default function ReviewClient({ runId }: { runId: string }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [data, setData] = useState<ReviewData | null>(null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [patientList, setPatientList] = useState<PatientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);

  const processing = !meta || meta.status === "queued" || meta.status === "processing";
  const events = useRunEvents(runId, processing);

  // Fetch patient directory for quick patient switcher
  useEffect(() => {
    let alive = true;
    api.listPatients()
      .then((res) => {
        if (alive) setPatientList(res.items);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [runId]);

  // Load patient detail
  const refreshDetail = useCallback(async () => {
    try {
      const p = await api.getPatient(runId);
      setDetail(p);
    } catch {
      /* patient detail may not be ready if unapproved */
    }
  }, [runId]);

  // Load run meta and review data; reset strictly on runId change
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    // Reset state immediately on patient switch to prevent leakage
    setMeta(null);
    setData(null);
    setDetail(null);
    setError(null);

    const tick = async () => {
      try {
        const m = await api.getRun(runId);
        if (!alive) return;
        setMeta(m);

        // Fetch patient details alongside review data
        void refreshDetail();

        if (m.status === "needs_review" || m.status === "approved" || m.status === "reapproved" || m.status === "unlocked_for_revision") {
          const r = await api.getReview(runId);
          if (alive) setData(r);
          return;
        }
        if (m.status !== "failed") timer = setTimeout(tick, 900);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof ApiError && e.status === 404
          ? (lang === "hi" ? "यह डिस्चार्ज योजना उपलब्ध नहीं है।" : "This patient discharge plan does not exist.")
          : (lang === "hi" ? "API से संपर्क नहीं हो पा रहा है।" : "Cannot reach the API. Is it running on port 8000?"));
      }
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId, refreshDetail, lang]);

  useEffect(() => {
    if (!notice) return;
    const tTimer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(tTimer);
  }, [notice]);

  const [retrying, setRetrying] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const onDecide = useCallback(async (fieldId: string, action: Action, attrs?: Attrs) => {
    try {
      const res = await api.decide(runId, fieldId, action, attrs);
      setData((d) => d && {
        ...d,
        fields: d.fields.map((f) => (f.field.field_id === fieldId ? res.field : f)),
        blockers: res.blockers,
        can_approve: res.can_approve,
      });
      // also refresh detail to update activity log
      void refreshDetail();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : (lang === "hi" ? "निर्णय सहेजने में विफल" : "Could not save that decision"));
      throw e;
    }
  }, [runId, refreshDetail, lang]);

  const onApprove = useCallback(async (by: string, role = "Registered Nurse", note?: string) => {
    try {
      await api.approve(runId, by, role, note);
      setDialog(false);
      const [m, r] = await Promise.all([api.getRun(runId), api.getReview(runId)]);
      setMeta(m);
      setData(r);
      await refreshDetail();
      setNotice(t.planApprovedNotice);
    } catch (e) {
      setDialog(false);
      setNotice(e instanceof Error ? e.message : (lang === "hi" ? "स्वीकृति विफल" : "Could not approve"));
    }
  }, [runId, refreshDetail, t.planApprovedNotice, lang]);

  const onRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await api.retryRun(runId);
      const m = await api.getRun(runId);
      setMeta(m);
      setError(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : (lang === "hi" ? "पुनः प्रयास विफल" : "Could not retry processing"));
    } finally {
      setRetrying(false);
    }
  }, [runId, lang]);

  const onUnlock = useCallback(async () => {
    setUnlocking(true);
    try {
      await api.unlockRun(runId);
      const [m, r] = await Promise.all([api.getRun(runId), api.getReview(runId)]);
      setMeta(m);
      setData(r);
      await refreshDetail();
      setNotice(lang === "hi" ? "योजना संपादन के लिए खोली गई। परिवर्तन कर पुनः स्वीकृत करें।" : "Plan unlocked for revision. Make adjustments and re-approve to publish a new version.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : (lang === "hi" ? "अनलॉक विफल" : "Could not unlock plan"));
    } finally {
      setUnlocking(false);
    }
  }, [runId, refreshDetail, lang]);

  // Voice command handlers
  const handleVoiceNavPatient = useCallback((targetName: string) => {
    const q = targetName.toLowerCase();
    const found = patientList.find((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    if (found) {
      router.push(`/staff/runs/${found.id}/review`);
    } else {
      setNotice(lang === "hi" ? `मरीज़ "${targetName}" नहीं मिला।` : `Patient "${targetName}" not found.`);
    }
  }, [patientList, router, lang]);

  const handleVoiceCompleteTask = useCallback(async (target: string) => {
    if (!detail?.tasks?.length) return;
    const q = target.toLowerCase();
    const task = detail.tasks.find((tItem) =>
      q === "general" ||
      tItem.title.toLowerCase().includes(q) ||
      (tItem.category && tItem.category.toLowerCase().includes(q))
    ) || detail.tasks.find((tItem) => tItem.status === "pending");

    if (task) {
      const pToken = meta?.patient_token || runId;
      await api.updateTask(pToken, task.task_id, "complete", "Registered Nurse (Voice Command)", "Staff workspace action");
      await refreshDetail();
      setNotice(t.taskNoticeUpdated(task.title));
    }
  }, [detail, meta, runId, refreshDetail, t]);

  const voiceTasks: TaskContextItem[] = useMemo(() => {
    if (!detail?.tasks) return [];
    return detail.tasks.map((st, i) => ({
      id: st.task_id,
      title: st.title,
      category: st.category,
      status: st.status,
      n: i + 1,
      scheduled_time: st.scheduled_time,
    }));
  }, [detail?.tasks]);

  const handleVoiceResolveTask = useCallback(
    async (task: TaskContextItem, action: "complete" | "reset") => {
      const pToken = meta?.patient_token || runId;
      await api.updateTask(pToken, task.id, action, "Registered Nurse (Voice Command)", "Staff workspace action");
      await refreshDetail();
      setNotice(action === "complete" ? t.taskNoticeUpdated(task.title) : `Task "${task.title}" reset`);
    },
    [meta, runId, refreshDetail, t]
  );

  const handleVoiceResolveAllTasks = useCallback(
    async (tasksToComplete: TaskContextItem[]) => {
      const pToken = meta?.patient_token || runId;
      for (const tItem of tasksToComplete) {
        await api.updateTask(pToken, tItem.id, "complete", "Registered Nurse (Voice Command)", "Staff workspace batch completion");
      }
      await refreshDetail();
      setNotice(lang === "hi" ? "सभी शेष कार्य पूर्ण दर्ज कर दिए गए।" : "All pending tasks marked completed.");
    },
    [meta, runId, refreshDetail, lang]
  );

  const progress = useMemo(() => {
    if (!data) return { done: 0, total: 0 };
    const req = data.fields.filter((f) => needsDecision(f.field));
    return { done: req.filter((f) => f.decision).length, total: req.length };
  }, [data]);
  const removed = data?.fields.filter((f) => f.decision?.action === "reject").length ?? 0;
  const accepted = (data?.fields.length ?? 0) - removed;
  const approved = meta?.status === "approved" || meta?.status === "reapproved";

  if (error) {
    return <div className="rr-page"><div className="rr-card rr-empty"><b>{error}</b><Link className="rr-btn rr-btn--ghost" href="/staff/patients">{t.backToPatients}</Link></div></div>;
  }
  if (meta?.status === "failed") {
    return (
      <div className="rr-page">
        <div className="rr-card rr-empty">
          <span className="rr-empty-icon rr-empty-icon--bad"><Icon.alert size={24} /></span>
          <b>{lang === "hi" ? "दस्तावेज़ संसाधित नहीं किया जा सका" : "The document could not be processed"}</b>
          <small>{meta.error ?? (lang === "hi" ? "अज्ञात त्रुटि" : "Unknown error")}</small>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="rr-btn rr-btn--primary" disabled={retrying} onClick={() => void onRetry()}>
              <Icon.pulse size={16} /> {retrying ? (lang === "hi" ? "पुनः प्रयास जारी…" : "Retrying…") : t.retryProcessing}
            </button>
            <button className="rr-btn rr-btn--ghost" onClick={() => setShowAddDoc(true)}>
              {t.addDocument}
            </button>
            <Link className="rr-btn rr-btn--ghost" href="/staff/patients">{t.backToPatients}</Link>
          </div>
        </div>
        <AddDocumentModal
          open={showAddDoc}
          onClose={() => setShowAddDoc(false)}
          patientName={meta.patient?.name || "Patient"}
          patientPhone={meta.patient?.phone}
          guardianName={meta.patient?.guardian_name}
          guardianPhone={meta.patient?.guardian_phone}
          language={meta.patient?.language || "en"}
          onUploaded={(newId) => router.push(`/staff/runs/${newId}/review`)}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rr-page rr-page--narrow">
        <motion.div {...fadeUp}>
          <h1 className="rr-title">{meta?.patient?.name ?? (lang === "hi" ? "मरीज़ कार्यक्षेत्र लोड हो रहा है…" : "Loading Patient Workspace…")}</h1>
          <p className="rr-sub">{meta?.filename ?? (lang === "hi" ? "चिकित्सीय पाइपलाइन से कनेक्ट हो रहा है…" : "Connecting to clinical pipeline…")}</p>
          <ProcessingView events={events} />
        </motion.div>
      </div>
    );
  }

  const pct = progress.total ? (progress.done / progress.total) * 100 : 100;
  const currentPatientName = data.run.patient?.name || meta?.patient?.name || "Patient";

  return (
    <div className="rr-review">
      {/* Interactive Staff Voice Assistant Bar */}
      <StaffVoiceBar
        tasks={voiceTasks}
        activePatient={{ id: runId, name: currentPatientName }}
        patients={patientList}
        onNavigatePatient={handleVoiceNavPatient}
        onOpenAddDoc={() => setShowAddDoc(true)}
        onApprovePlan={() => setDialog(true)}
        onCompleteTask={handleVoiceCompleteTask}
        onResolveTask={handleVoiceResolveTask}
        onResolveAllTasks={handleVoiceResolveAllTasks}
        onQueryCarePlan={() => {}}
      />

      <header className="rr-review-head">
        <div className="rr-review-title">
          <Link href="/staff/patients" className="rr-link">{t.backToPatients}</Link>
          
          {/* Patient Switcher Dropdown */}
          <div className="pt-switcher-wrap">
            <span className="pt-switcher-label">{t.activeWorkspace}:</span>
            <select
              className="pt-switcher-select"
              value={runId}
              onChange={(e) => {
                const targetId = e.target.value;
                if (targetId && targetId !== runId) {
                  router.push(`/staff/runs/${targetId}/review`);
                }
              }}
              aria-label={t.switchPatient}
            >
              <option value={runId}>
                👤 {currentPatientName} ({approved ? t.statusApproved : t.statusNeedsReview})
              </option>
              {patientList
                .filter((p) => p.id !== runId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    👤 {p.name} · {p.status === "approved" ? t.statusApproved : t.statusNeedsReview}
                  </option>
                ))}
            </select>
          </div>

          <RunPill status={meta?.status ?? data.run.status} />
        </div>

        <div className="rr-review-actions">
          {/* Language Switcher in workspace */}
          <LanguageSwitcher />

          {/* Add Document button */}
          <button
            type="button"
            className="rr-btn rr-btn--ghost rr-btn--sm"
            onClick={() => setShowAddDoc(true)}
            title={t.addDocument}
          >
            <Icon.upload size={15} /> {t.addDocument}
          </button>

          {!approved && (
            <div className="rr-progress" title={lang === "hi" ? "स्वीकृति से पूर्व आवश्यक निर्णय" : "Decisions needed before approval"}>
              <span>{progress.done} / {progress.total} {lang === "hi" ? "निर्णय" : "decisions"}</span>
              <div className="rr-bar"><motion.i animate={{ width: `${pct}%` }} transition={{ duration: dur.base }} /></div>
            </div>
          )}
          {!approved && (
            <button className="rr-btn rr-btn--primary" disabled={!data.can_approve}
              title={data.can_approve ? t.approvePlan : `${data.blockers.length} field(s) still need a decision`}
              onClick={() => setDialog(true)}>
              <Icon.lock size={16} /> {t.approvePlan}
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {approved && (
          <motion.div className="rr-banner" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="rr-seal"><Seal /></span>
            <div style={{ flex: 1 }}>
              <b>{lang === "hi" ? `देखभाल योजना स्वीकृत एवं लॉक · संस्करण ${(meta as any)?.current_version ?? 1}.0` : `Plan approved and locked · v${(meta as any)?.current_version ?? 1}.0`}</b>
              <small>{lang === "hi" ? `${meta?.approved_by ?? "स्टाफ़"} द्वारा स्वीकृत। प्रत्येक निर्णय ऑडिट लॉग में दर्ज है।` : `Approved by ${meta?.approved_by ?? "staff"}. Every decision is recorded in the audit log.`}</small>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link
                href={`/p/${(meta as any)?.patient_token || (meta as any)?.patient?.patient_token || runId}`}
                target="_blank"
                className="rr-btn rr-btn--ghost rr-btn--sm"
                title={t.patientApp}
              >
                <Icon.phone size={15} /> {t.patientApp}
              </Link>
              <button
                className="rr-btn rr-btn--ghost rr-btn--sm"
                disabled={unlocking}
                onClick={() => void onUnlock()}
                title={t.revisePlan}
              >
                <Icon.edit size={15} /> {unlocking ? (lang === "hi" ? "अनलॉक हो रहा है…" : "Unlocking…") : t.revisePlan}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewSplit
        data={data}
        locked={approved}
        onDecide={onDecide}
        detail={detail}
        onRefreshDetail={refreshDetail}
        onOpenAddDoc={() => setShowAddDoc(true)}
      />

      <ApproveDialog open={dialog} accepted={accepted} removed={removed} onClose={() => setDialog(false)} onApprove={onApprove} />

      <AddDocumentModal
        open={showAddDoc}
        onClose={() => setShowAddDoc(false)}
        patientName={currentPatientName}
        patientPhone={meta?.patient?.phone}
        guardianName={meta?.patient?.guardian_name}
        guardianPhone={meta?.patient?.guardian_phone}
        language={meta?.patient?.language || "en"}
        onUploaded={(newId) => router.push(`/staff/runs/${newId}/review`)}
      />

      <AnimatePresence>
        {notice && (
          <motion.div className="rr-toast" role="alert" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            <Icon.alert size={16} /> {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
