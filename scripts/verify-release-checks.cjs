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
function rateLimitDelay(status, headers, now = Date.now()) {
  if (status !== 429 && !(status === 403 && headers.get("x-ratelimit-remaining") === "0")) return null;
  const retry = headers.get("retry-after");
  const seconds = retry === null ? NaN : Number(retry);
  const retryAt = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retry || "");
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  const until = Number.isFinite(retryAt) ? retryAt : reset > now ? reset : now + 60_000;
  return Math.max(60_000, until - now + 1000);
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
    if (!response.ok) {
      const delay = rateLimitDelay(response.status, response.headers);
      if (delay !== null && Date.now() + delay < deadline) {
        console.log("[release-gate] GitHub rate limited this builder; retrying after " + Math.ceil(delay / 1000) + " seconds. Checks remain mandatory.");
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new Error("Cannot verify required GitHub checks: HTTP " + response.status + (delay !== null ? "; rate limit outlasts the verification window. Retry the deployment after GitHub resets its limit." : ""));
    }
    const { state, run } = releaseCheckState((await response.json()).workflow_runs ?? [], sha);
    const suffix = run ? ` (run ${run.id}, status ${run.status}, conclusion ${run.conclusion ?? "pending"})` : "";
    if (state === "passed") { console.log("[release-gate] Required checks passed for " + sha + suffix); return; }
    if (state === "failed") throw new Error("Required build verification failed for " + sha + suffix + "; refusing this deployment.");
    console.log("[release-gate] Waiting for required build verification for " + sha + suffix);
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
  throw new Error("Timed out waiting for required checks; previous production release remains active.");
}
module.exports = { releaseCheckState, rateLimitDelay };
if (require.main === module) verifyRelease().catch((error) => { console.error("[release-gate]", error.message); process.exit(1); });
