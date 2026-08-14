import { processMessageBatchOnce } from "../lib/message-outbox";

const pollMs = Math.max(500, Number(process.env.SMS_WORKER_POLL_MS || 2000));
let stopped = false;

process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

async function run() {
  console.info("SukuuNova notification outbox worker started.");
  while (!stopped) {
    const processed = await processMessageBatchOnce();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

run().catch((error) => {
  console.error("Notification worker stopped", error);
  process.exitCode = 1;
});
