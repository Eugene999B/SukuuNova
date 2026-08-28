import { processSmsBatchOnce } from "../lib/sms-outbox";

const pollMs = Math.max(500, Number(process.env.SMS_WORKER_POLL_MS || 2000));
let stopped = false;

process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

async function run() {
  console.info("SukuuNova SMS outbox worker started.");
  while (!stopped) {
    const processed = await processSmsBatchOnce();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

run().catch((error) => {
  console.error("SMS worker stopped", error);
  process.exitCode = 1;
});
