import { describe, expect, it } from "vitest";
import { compareShadowPredictions, NOVACORE_ALGORITHMS } from "../src/lib/novacore/registry";

describe("NovaCore registry", () => {
  it("keeps algorithm keys unique", () => {
    const keys = NOVACORE_ALGORITHMS.map((algorithm) => algorithm.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("compares candidate algorithms in shadow mode with MAE", () => {
    const result = compareShadowPredictions([
      { actual: 10, current: 14, candidate: 11 },
      { actual: 20, current: 16, candidate: 19 },
      { actual: 30, current: 35, candidate: 31 },
    ]);
    expect(result.samples).toBe(3);
    expect(result.currentMae).toBeGreaterThan(result.candidateMae!);
    expect(result.candidateWins).toBe(true);
    expect(result.candidateImprovementPercent).toBeGreaterThan(0);
  });
});
