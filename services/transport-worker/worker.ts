import { processTransportWorkerCycle } from "../../src/lib/novacore/transport-worker";

const intervalMs = Math.max(5_000, Number(process.env.TRANSPORT_WORKER_INTERVAL_MS ?? 15_000));
const schoolId = process.env.TRANSPORT_WORKER_SCHOOL_ID?.trim() || undefined;
let stopping = false;
let running = false;

async function cycle() {
  if (running || stopping) return;
  running = true;
  try {
    const summary = await processTransportWorkerCycle({ schoolId });
    if (
      summary.transportAlertsDispatched > 0
      || summary.transportAlertsSent > 0
      || summary.transportAlertsFailed > 0
      || summary.transportAlertsSkipped > 0
    ) {
      console.log("[transport-worker] cycle", summary);
    }
  } catch (error) {
    console.error("[transport-worker] cycle failed", error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

const timer = setInterval(() => void cycle(), intervalMs);
timer.unref();
void cycle();

function shutdown() {
  stopping = true;
  clearInterval(timer);
  const finish = () => process.exit(0);
  if (!running) return finish();
  const poll = setInterval(() => {
    if (!running) {
      clearInterval(poll);
      finish();
    }
  }, 100);
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
