import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeRiskScan, isRiskScanWorkflow } from "../src/lib/risk-scan-auth";
afterEach(() => vi.unstubAllEnvs());
const claims = {
  repository_id: "1334027943", repository: "Eugene999B/SukuuNova", ref: "refs/heads/main",
  workflow_ref: "Eugene999B/SukuuNova/.github/workflows/risk-scan.yml@refs/heads/main",
  event_name: "schedule", sub: "repo:Eugene999B/SukuuNova:ref:refs/heads/main",
};
describe("risk scan authorization", () => {
  it("accepts only the exact repository, main branch and scheduled/manual workflow", () => {
    expect(isRiskScanWorkflow(claims)).toBe(true);
    expect(isRiskScanWorkflow({ ...claims, event_name: "workflow_run" })).toBe(true);
    for (const change of [{ repository_id: "other" }, { event_name: "pull_request" }, { ref: "refs/heads/other" }, { workflow_ref: "another.yml" }, { sub: "repo:Eugene999B/SukuuNova:pull_request" }]) expect(isRiskScanWorkflow({ ...claims, ...change })).toBe(false);
  });
  it("rejects missing and forged tokens and retains the existing secret integration", async () => {
    vi.stubEnv("RISK_SCAN_CRON_SECRET", "a".repeat(40));
    expect(await authorizeRiskScan(null)).toBe(false);
    expect(await authorizeRiskScan("Bearer forged")).toBe(false);
    expect(await authorizeRiskScan("Bearer " + "a".repeat(40))).toBe(true);
  });
});
