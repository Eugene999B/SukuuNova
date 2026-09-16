#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

function runNode(label, filename) {
  console.log(`[predeploy] starting ${label}...`);
  const child = spawnSync(process.execPath, [path.join(__dirname, filename)], {
    stdio: "inherit",
    env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`${label} failed with exit code ${child.status || 1}.`);
  }
  console.log(`[predeploy] ${label} complete.`);
}

try {
  runNode("database migrations", "deploy-migrations.cjs");

  if (String(process.env.RUN_ONE_TIME_PLATFORM_ADMIN_RECOVERY || "").trim() === "YES") {
    runNode("one-time Platform admin recovery", "one-time-platform-admin-recovery.cjs");
  } else {
    console.log("[predeploy] one-time Platform admin recovery not requested.");
  }

  if (String(process.env.RUN_EUGENE_ACADEMY_PRODUCTION_REFRESH || "").trim() === "YES") {
    runNode("Eugene Academy production refresh", "seed-eugene-academy-production-showcase.cjs");
  } else {
    console.log("[predeploy] Eugene Academy production refresh not requested.");
  }
} catch (error) {
  console.error("[predeploy] failed:", error instanceof Error ? (error.stack || error.message) : String(error));
  process.exitCode = 1;
}
