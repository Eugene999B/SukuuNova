import { withTenant } from "@/lib/db";
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

async function loadBatch(schoolId: string, reportIds: string[]) {
  return Promise.allSettled(reportIds.map((reportId) => loadOneReport(schoolId, reportId)));
}

export async function loadReportCardPrintPack(input: {
  schoolId: string;
  reportIds: string[];
  batchSize?: number;
}) {
  const batchSize = Math.max(1, Math.min(5, Math.trunc(input.batchSize ?? DEFAULT_BATCH_SIZE)));
  const reports: ReportCardPrintPackItem[] = [];
  const failures: ReportCardPrintPackFailure[] = [];

  for (let offset = 0; offset < input.reportIds.length; offset += batchSize) {
    const ids = input.reportIds.slice(offset, offset + batchSize);
    const settled = await loadBatch(input.schoolId, ids);

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const reportId = ids[index];
      if (result.status === "fulfilled") {
        reports.push(result.value);
        continue;
      }

      // A single retry is intentionally sequential. It absorbs a transient connection
      // or transaction failure without turning a class pack into another database burst.
      try {
        reports.push(await loadOneReport(input.schoolId, reportId));
      } catch (error) {
        failures.push({ reportId, message: safeFailureMessage(error) });
      }
    }
  }

  return { reports, failures };
}
