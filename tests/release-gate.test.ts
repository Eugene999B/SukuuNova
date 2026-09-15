import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const { releaseCheckState } = createRequire(import.meta.url)("../scripts/verify-release-checks.cjs");
describe("production release gate", () => {
  const run = { id: 1, head_sha: "current", head_branch: "main", event: "push", path: ".github/workflows/build.yml", status: "completed", conclusion: "success" };
  it("requires the successful main build for exactly the deployed commit", () => {
    expect(releaseCheckState([run], "current")).toBe("passed");
    expect(releaseCheckState([run], "other")).toBe("pending");
    expect(releaseCheckState([{ ...run, event: "pull_request" }], "current")).toBe("pending");
    expect(releaseCheckState([{ ...run, path: "unrelated.yml" }], "current")).toBe("pending");
    expect(releaseCheckState([{ ...run, conclusion: "failure" }], "current")).toBe("failed");
    expect(releaseCheckState([run, { ...run, id: 2, status: "in_progress" }], "current")).toBe("pending");
  });
});
