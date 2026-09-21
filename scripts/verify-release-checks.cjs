"use strict";
function releaseCheckState(runs, sha) {
  const candidates = runs
    .filter((run) => run.head_sha === sha && run.event === "push" && run.path === ".github/workflows/build.yml" && run.head_branch === "main")
    .sort((a, b) => b.id - a.id);
  const run = candidates[0];
  if (!run) return { state: "pending", run: null };
  if (run.status !== "completed") return { state: "pending", run };
  return { state: run.conclusion === "success" ? "passed" : "failed", run };
}
async function verifyRelease() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (!sha || !/^[a-f0-9]{40}$/i.test(sha)) throw new Error("Deployment requires its exact GitHub commit SHA.");
  const deadline = Date.now() + 40 * 60 * 1000;
  while (Date.now() < deadline) {
    const url = new URL("https://api.github.com/repos/Eugene999B/SukuuNova/actions/runs");
    url.searchParams.set("head_sha", sha);
    url.searchParams.set("event", "push");
    url.searchParams.set("per_page", "30");
    const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "SukuuNova-release-gate" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Cannot verify required GitHub checks: HTTP " + response.status);
    const { state, run } = releaseCheckState((await response.json()).workflow_runs ?? [], sha);
    const suffix = run ? ` (run ${run.id}, status ${run.status}, conclusion ${run.conclusion ?? "pending"})` : "";
    if (state === "passed") { console.log("[release-gate] Required checks passed for " + sha + suffix); return; }
    if (state === "failed") throw new Error("Required build verification failed for " + sha + suffix + "; refusing this deployment.");
    console.log("[release-gate] Waiting for required build verification for " + sha + suffix);
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
  throw new Error("Timed out waiting for required checks; previous production release remains active.");
}
module.exports = { releaseCheckState };
if (require.main === module) verifyRelease().catch((error) => { console.error("[release-gate]", error.message); process.exit(1); });
