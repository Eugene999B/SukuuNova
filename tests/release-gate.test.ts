import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const { releaseCheckState, rateLimitDelay } = createRequire(import.meta.url)("../scripts/verify-release-checks.cjs");
describe("production release gate", () => {
  const run = { id: 1, head_sha: "current", head_branch: "main", event: "push", path: ".github/workflows/build.yml", status: "completed", conclusion: "success" };
  it("requires the successful main build for exactly the deployed commit", () => {
    expect(releaseCheckState([run], "current")).toEqual({ state: "passed", run });
    expect(releaseCheckState([run], "other")).toEqual({ state: "pending", run: null });
    expect(releaseCheckState([{ ...run, event: "pull_request" }], "current")).toEqual({ state: "pending", run: null });
    expect(releaseCheckState([{ ...run, path: "unrelated.yml" }], "current")).toEqual({ state: "pending", run: null });
    expect(releaseCheckState([{ ...run, conclusion: "failure" }], "current")).toEqual({
      state: "failed",
      run: { ...run, conclusion: "failure" },
    });
    expect(releaseCheckState([run, { ...run, id: 2, status: "in_progress" }], "current")).toEqual({
      state: "pending",
      run: { ...run, id: 2, status: "in_progress" },
    });
  });
});

it("retries only identified rate limits and never treats them as successful checks",()=>{
 expect(rateLimitDelay(403,new Headers(),1000)).toBeNull();
 expect(rateLimitDelay(401,new Headers({"retry-after":"60"}),1000)).toBeNull();
 expect(rateLimitDelay(403,new Headers({"x-ratelimit-remaining":"0","x-ratelimit-reset":"121"}),1000)).toBe(121000);
 expect(rateLimitDelay(429,new Headers({"retry-after":"90"}),1000)).toBe(91000);
 expect(rateLimitDelay(429,new Headers({"retry-after":"nonsense"}),1000)).toBe(61000);
});
