#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

function run(label, filename, extraEnv = {}) {
  console.log(`[eugene-academy] starting ${label}…`);
  const child = spawnSync(process.execPath, [path.join(__dirname, filename)], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${label} failed with exit code ${child.status || 1}.`);
  console.log(`[eugene-academy] ${label} complete.`);
}

try {
  run("verified full-system fixture", "run-eugene-academy-trial.cjs");
  run("current role and workspace access refresh", "refresh-eugene-academy-access.cjs", { EUGENE_ACADEMY_ACCESS_TARGET: "trial" });
  run("rich learner and guardian showcase", "seed-eugene-academy-learning-showcase.cjs", { EUGENE_ACADEMY_SHOWCASE_TARGET: "trial" });
  run("school store and property showcase", "seed-eugene-academy-store-properties.cjs", { EUGENE_ACADEMY_OPERATIONS_TARGET: "trial" });
  console.log("[eugene-academy] full showcase fixture completed successfully.");
} catch (error) {
  console.error("[eugene-academy] showcase pipeline failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
