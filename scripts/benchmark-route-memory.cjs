// Runs only against the isolated Linux CI database after a production build.
const fs = require("node:fs");
const { spawn, execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const configPath = "next.config.mjs";
const original = fs.readFileSync(configPath, "utf8");
assert.ok(original.includes("preloadEntriesOnStart: false"));
const origin = "http://127.0.0.1:3100";
async function measure(preload) {
  fs.writeFileSync(configPath, original.replace("preloadEntriesOnStart: false", "preloadEntriesOnStart: " + preload));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3100", "--hostname", "127.0.0.1"], {
    env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let output = "";
  child.stdout.on("data", data => { output = (output + data).slice(-8000); });
  child.stderr.on("data", data => { output = (output + data).slice(-8000); });
  child.on("error", error => { output += error.message; });
  const rss = () => {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split("\n").map(line => line.trim().split(/\s+/).map(Number));
    const pids = new Set([child.pid]);
    for (let n = 0; n < rows.length; n++) for (const [pid, parent] of rows) if (pids.has(parent)) pids.add(pid);
    return rows.filter(([pid]) => pids.has(pid)).reduce((total, row) => total + row[2], 0);
  };
  try {
    let ready = false;
    for (let n = 0; n < 60; n++) {
      if (child.exitCode !== null) throw new Error("Server exited: " + output);
      try { ready = (await fetch(origin + "/api/health", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await delay(1000);
    }
    assert.ok(ready, "Server health timed out: " + output);
    await delay(10000);
    const startupRssKiB = rss();
    const timings = [];
    for (const path of ["/", "/login", "/dashboard", "/school/devices"]) {
      for (const phase of ["cold", "warm"]) {
        const started = performance.now();
        const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) });
        await response.arrayBuffer();
        assert.ok(response.status < 500, path + " returned " + response.status);
        timings.push({ path, phase, status: response.status, ms: Math.round(performance.now() - started) });
      }
    }
    await delay(5000);
    return { preload, startupRssKiB, visitedRssKiB: rss(), timings };
  } finally {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    for (let n = 0; n < 50 && child.exitCode === null && child.signalCode === null; n++) await delay(100);
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  }
}
(async () => {
  try {
    const baseline = await measure(true);
    const candidate = await measure(false);
    const report = { baseline, candidate, startupReductionKiB: baseline.startupRssKiB - candidate.startupRssKiB };
    console.log(JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "\n### Route loading memory comparison\n\n" + JSON.stringify(report, null, 2) + "\n");
  } finally { fs.writeFileSync(configPath, original); }
})().catch(error => { console.error(error); process.exitCode = 1; });
