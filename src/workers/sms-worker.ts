import { processMessageBatchOnce } from "../lib/message-outbox";

const configuredPoll = Number(process.env.SMS_WORKER_POLL_MS || 2000);
const pollMs = Number.isFinite(configuredPoll) ? Math.max(500, configuredPoll) : 2000;
let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

async function run() {
  console.info("SukuuNova notification outbox worker started.");
  let idleDelay = pollMs;
  while (!stopped) {
    try {
      const processed = await processMessageBatchOnce();
      if (processed) { idleDelay = pollMs; continue; }
    } catch (error) {
      console.error("Notification worker will retry after a batch failure", error instanceof Error ? error.message : "Unknown error");
    }
    await new Promise(resolve => setTimeout(resolve, idleDelay));
    idleDelay = Math.min(15_000, Math.max(pollMs, idleDelay * 1.5));
  }
}
run().catch(error => {
  console.error("Notification worker stopped", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
