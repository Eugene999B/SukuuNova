"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Send, ShieldCheck, Upload } from "lucide-react";
import type { ReportWorkflowAction } from "@/lib/report-card-workflow-operations";
import styles from "./ReportCardOperationsDesk.module.css";

type Failure = {
  reportCardId: string;
  studentName: string;
  admissionNo: string;
  message: string;
};

type BatchResponse = {
  action: ReportWorkflowAction;
  succeeded: number;
  attempted: number;
  remaining: number;
  failed: Failure[];
  message?: string;
  error?: string;
};

type Counts = {
  missing: number;
  draft: number;
  submitted: number;
  approved: number;
  sent: number;
};

const actionCopy: Record<ReportWorkflowAction, { verb: string; running: string; confirm: string }> = {
  submit: {
    verb: "Submit eligible drafts",
    running: "Submitting drafts…",
    confirm: "Submit all eligible draft report cards in this class for leadership approval? Final-term reports without a promotion decision will be skipped and reported for attention.",
  },
  approve: {
    verb: "Approve eligible reports",
    running: "Approving reports…",
    confirm: "Approve all eligible submitted report cards in this class? Approval freezes results, class identity, theme and signatures. A user cannot approve a report they personally submitted.",
  },
  release: {
    verb: "Release approved reports",
    running: "Releasing reports…",
    confirm: "Release all eligible approved report cards in this class to linked families now? Delivery requires an enabled provider and a guardian phone number.",
  },
};

export function ReportCardWorkflowBatch({
  termId,
  classId,
  counts,
  canSubmit,
  canApprove,
  isClassTeacher,
  finalTerm,
  promotionMissing,
  selfApprovalBlocked,
}: {
  termId: string;
  classId: string;
  counts: Counts;
  canSubmit: boolean;
  canApprove: boolean;
  isClassTeacher: boolean;
  finalTerm: boolean;
  promotionMissing: number;
  selfApprovalBlocked: number;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<ReportWorkflowAction | null>(null);
  const [status, setStatus] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);

  const run = async (action: ReportWorkflowAction, expected: number) => {
    if (!expected || busyAction) return;
    if (!window.confirm(actionCopy[action].confirm)) return;

    setBusyAction(action);
    setStatus(actionCopy[action].running);
    setFailures([]);
    const skipReportIds: string[] = [];
    const allFailures: Failure[] = [];
    let totalSucceeded = 0;
    let remaining = expected;
    let cycles = 0;

    try {
      while (remaining > 0 && cycles < 100) {
        cycles += 1;
        const response = await fetch("/api/school/report-cards/workflow-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ termId, classId, action, skipReportIds }),
        });
        const payload = await response.json() as BatchResponse;
        if (!response.ok) throw new Error(payload.message || payload.error || "The report-card workflow stopped unexpectedly.");

        totalSucceeded += payload.succeeded;
        for (const failure of payload.failed || []) {
          if (!skipReportIds.includes(failure.reportCardId)) skipReportIds.push(failure.reportCardId);
          if (!allFailures.some((item) => item.reportCardId === failure.reportCardId)) allFailures.push(failure);
        }
        remaining = payload.remaining;
        setFailures([...allFailures]);
        setStatus(
          remaining > 0
            ? `${totalSucceeded} advanced; ${remaining} eligible report${remaining === 1 ? "" : "s"} remaining…`
            : `${totalSucceeded} report${totalSucceeded === 1 ? "" : "s"} advanced${allFailures.length ? `; ${allFailures.length} need attention.` : "."}`,
        );
        if (payload.attempted === 0) break;
      }
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The report-card workflow stopped unexpectedly.");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className={styles.workflowCard}>
      <div className={styles.workflowHead}>
        <div>
          <span className={styles.eyebrow}>CLASS WORKFLOW</span>
          <h2>Move reports forward in controlled batches.</h2>
          <p>Every action uses the same audited single-report services. Failed learners are isolated instead of rolling back successful classmates.</p>
        </div>
        {counts.missing === 0 && counts.draft === 0 && counts.submitted === 0 && counts.approved === 0 ? (
          <span className={styles.completeBadge}><CheckCircle2 size={15}/> Class workflow complete</span>
        ) : null}
      </div>

      <div className={styles.stageGrid}>
        <div><span>Not generated</span><strong>{counts.missing}</strong><small>Generate from the detailed Report Cards workspace.</small></div>
        <div><span>Draft</span><strong>{counts.draft}</strong><small>{finalTerm && promotionMissing ? `${promotionMissing} need a promotion decision.` : "Ready for class-teacher review."}</small></div>
        <div><span>For approval</span><strong>{counts.submitted}</strong><small>{selfApprovalBlocked ? `${selfApprovalBlocked} cannot be approved by your account.` : "Leadership queue."}</small></div>
        <div><span>Approved</span><strong>{counts.approved}</strong><small>Frozen and waiting for family release.</small></div>
        <div><span>Released</span><strong>{counts.sent}</strong><small>Family delivery has been queued.</small></div>
      </div>

      <div className={styles.actionRow}>
        {canSubmit && isClassTeacher ? (
          <button type="button" disabled={!counts.draft || Boolean(busyAction)} onClick={() => void run("submit", counts.draft)}>
            <Upload size={15}/>{busyAction === "submit" ? actionCopy.submit.running : actionCopy.submit.verb}
          </button>
        ) : null}
        {canApprove ? (
          <button type="button" disabled={!counts.submitted || Boolean(busyAction)} onClick={() => void run("approve", counts.submitted)}>
            <ShieldCheck size={15}/>{busyAction === "approve" ? actionCopy.approve.running : actionCopy.approve.verb}
          </button>
        ) : null}
        {canApprove ? (
          <button type="button" disabled={!counts.approved || Boolean(busyAction)} onClick={() => void run("release", counts.approved)}>
            <Send size={15}/>{busyAction === "release" ? actionCopy.release.running : actionCopy.release.verb}
          </button>
        ) : null}
      </div>

      {!isClassTeacher && counts.draft ? <p className={styles.note}>Draft submission is reserved for the class teacher assigned to this historical class context.</p> : null}
      {status ? <p className={styles.status} role="status">{status}</p> : null}
      {failures.length ? (
        <details className={styles.failures}>
          <summary>{failures.length} report{failures.length === 1 ? "" : "s"} need attention</summary>
          <ul>{failures.slice(0, 16).map((failure) => <li key={failure.reportCardId}><strong>{failure.studentName} · {failure.admissionNo}</strong><span>{failure.message}</span></li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
