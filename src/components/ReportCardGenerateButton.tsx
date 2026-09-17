"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Failure = { studentId: string; admissionNo: string; message: string };
type BatchResponse = { generated: number; attempted: number; remaining: number; processedStudentIds: string[]; failed: Failure[]; message?: string; error?: string };

export function ReportCardGenerateButton({ termId, classId, missing }: { termId: string; classId: string; missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failures, setFailures] = useState<Failure[]>([]);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(missing > 0 ? `Generating and refreshing report cards…` : "Refreshing draft report cards from the latest marks…");
    setFailures([]);
    const skipStudentIds: string[] = [];
    const allFailures: Failure[] = [];
    let totalGenerated = 0;
    let remaining = -1;
    let cycles = 0;

    try {
      while (remaining !== 0 && cycles < 100) {
        cycles += 1;
        const response = await fetch("/api/school/report-cards/generate-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ termId, classId, skipStudentIds }),
        });
        const payload = await response.json() as BatchResponse;
        if (!response.ok) throw new Error(payload.message || payload.error || "Report generation stopped unexpectedly.");

        totalGenerated += payload.generated;
        for (const studentId of payload.processedStudentIds || []) {
          if (!skipStudentIds.includes(studentId)) skipStudentIds.push(studentId);
        }
        for (const failure of payload.failed || []) {
          if (!allFailures.some((item) => item.studentId === failure.studentId)) allFailures.push(failure);
        }
        remaining = payload.remaining;
        setFailures([...allFailures]);
        setStatus(
          remaining > 0
            ? `Generated or refreshed ${totalGenerated}. ${remaining} report${remaining === 1 ? "" : "s"} remaining…`
            : totalGenerated > 0
              ? `Generated or refreshed ${totalGenerated} report${totalGenerated === 1 ? "" : "s"}${allFailures.length ? `; ${allFailures.length} learner${allFailures.length === 1 ? "" : "s"} need attention.` : "."}`
              : "No draft reports needed refreshing. Submitted and released reports stay frozen.",
        );

        if (payload.attempted === 0) break;
      }
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Report generation stopped unexpectedly.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-generation-control">
      <button className="report-action primary" type="button" disabled={busy} onClick={() => void generate()}>
        {busy ? "Generating…" : "Generate / refresh reports"}
      </button>
      <span className="report-generation-status">Uses marks recorded so far. Missing marks stay blank and are not treated as zero.</span>
      {status ? <span className="report-generation-status" role="status">{status}</span> : null}
      {failures.length ? (
        <details className="report-generation-errors">
          <summary>{failures.length} learner{failures.length === 1 ? "" : "s"} need attention</summary>
          <ul>{failures.slice(0, 12).map((failure) => <li key={failure.studentId}><strong>{failure.admissionNo}</strong><span>{failure.message}</span></li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}
