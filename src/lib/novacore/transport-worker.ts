import { db, withTenant } from "@/lib/db";
import { processMessageBatchOnce } from "@/lib/message-outbox";
import { dispatchQueuedTransportAlerts, reconcileTransportAlertDeliveries } from "./transport-alert-dispatcher";

export type TransportWorkerSummary = {
  schoolsExamined: number;
  transportAlertsDispatched: number;
  transportAlertsSkipped: number;
  messageJobsQueued: number;
  messagesProcessed: number;
  transportAlertsSent: number;
  transportAlertsFailed: number;
};

export async function processTransportWorkerCycle(options: {
  schoolId?: string;
  alertLimitPerSchool?: number;
  messageBatchSize?: number;
} = {}): Promise<TransportWorkerSummary> {
  const directories = await db.schoolLoginDirectory.findMany({
    where: { status: "active", ...(options.schoolId ? { schoolId: options.schoolId } : {}) },
    select: { schoolId: true },
  });
  const summary: TransportWorkerSummary = {
    schoolsExamined: directories.length,
    transportAlertsDispatched: 0,
    transportAlertsSkipped: 0,
    messageJobsQueued: 0,
    messagesProcessed: 0,
    transportAlertsSent: 0,
    transportAlertsFailed: 0,
  };

  for (const directory of directories) {
    const dispatch = await withTenant(directory.schoolId, (tx) => dispatchQueuedTransportAlerts(
      tx,
      directory.schoolId,
      options.alertLimitPerSchool ?? 50,
    ));
    summary.transportAlertsDispatched += dispatch.dispatched;
    summary.transportAlertsSkipped += dispatch.skipped;
    summary.messageJobsQueued += dispatch.messageJobs;
  }

  // Reuse the shared delivery worker so transport follows the same retry, provider and
  // idempotency rules as every other SukuuNova notification.
  summary.messagesProcessed = await processMessageBatchOnce(
    undefined,
    Math.max(1, Math.min(500, Math.floor(options.messageBatchSize ?? 100))),
    options.schoolId,
  );

  for (const directory of directories) {
    const reconcile = await withTenant(directory.schoolId, (tx) => reconcileTransportAlertDeliveries(tx, directory.schoolId));
    summary.transportAlertsSent += reconcile.sent;
    summary.transportAlertsFailed += reconcile.failed;
  }

  return summary;
}
