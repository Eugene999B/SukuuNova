import { withTenant } from "@/lib/db";
import { loadInBatchesWithRetry } from "@/lib/bounded-work";
import { getReportCardPrintData } from "@/lib/report-card-print-data";
import { signaturesForReport } from "@/lib/report-card-signatures";

type PrintReport = Awaited<ReturnType<typeof getReportCardPrintData>>;
type PrintSignatures = Awaited<ReturnType<typeof signaturesForReport>>;

export type ReportCardPrintPackItem = {
  report: PrintReport;
  signatures: PrintSignatures;
};

export type ReportCardPrintPackFailure = {
  reportId: string;
  message: string;
};

const DEFAULT_BATCH_SIZE = 3;

function safeFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 240);
  return "Report data could not be prepared.";
}

async function loadOneReport(schoolId: string, reportId: string): Promise<ReportCardPrintPackItem> {
  return withTenant(schoolId, async (tx) => {
    const [report, signatures] = await Promise.all([
      getReportCardPrintData(tx, { schoolId, reportId }),
      signaturesForReport(tx, { schoolId, reportId }),
    ]);
    return { report, signatures };
  });
}

export async function loadReportCardPrintPack(input: {
  schoolId: string;
  reportIds: string[];
  batchSize?: number;
}) {
  const loaded = await loadInBatchesWithRetry({
    ids: input.reportIds,
    batchSize: input.batchSize ?? DEFAULT_BATCH_SIZE,
    maxBatchSize: 5,
    load: (reportId) => loadOneReport(input.schoolId, reportId),
  });

  return {
    reports: loaded.items.map((item) => item.value),
    failures: loaded.failures.map((failure) => ({
      reportId: failure.id,
      message: safeFailureMessage(failure.error),
    })),
  };
}
