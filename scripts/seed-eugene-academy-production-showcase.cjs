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
  run("guarded permanent production demo seed", "seed-eugene-academy-production-demo.cjs");
  run("rich learner and guardian showcase", "seed-eugene-academy-learning-showcase.cjs", { EUGENE_ACADEMY_SHOWCASE_TARGET: "production" });
  console.log("[eugene-academy] permanent production demonstration school and rich learning showcase are verified.");
} catch (error) {
  console.error("[eugene-academy] production showcase pipeline failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
