import { describe, expect, it } from "vitest";
import { ARCADE_PHYSICS_VERSION } from "../src/lib/novacore/arcade-physics";
import { TIMETABLE_OPTIMIZER_VERSION } from "../src/lib/novacore/timetable-optimizer";
import { compareShadowPredictions, NOVACORE_ALGORITHMS, novaCoreRegistrySummary } from "../src/lib/novacore/registry";
import { SIGNATURE_VECTOR_VERSION } from "../src/lib/signature-vector";

describe("NovaCore registry", () => {
  it("keeps algorithm keys unique and every algorithm explainable", () => {
    const keys = NOVACORE_ALGORITHMS.map((algorithm) => algorithm.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const algorithm of NOVACORE_ALGORITHMS) {
      expect(algorithm.safeguards.length).toBeGreaterThan(0);
      expect(algorithm.evidence.length).toBeGreaterThan(0);
      expect(algorithm.version.length).toBeGreaterThan(0);
    }
  });

  it("tracks implementation version constants instead of duplicate labels", () => {
    expect(NOVACORE_ALGORITHMS.find((item) => item.key === "arcade.physics")?.version).toBe(ARCADE_PHYSICS_VERSION);
    expect(NOVACORE_ALGORITHMS.find((item) => item.key === "timetable.constraint-solver")?.version).toBe(TIMETABLE_OPTIMIZER_VERSION);
    expect(NOVACORE_ALGORITHMS.find((item) => item.key === "signature.stroke-dynamics")?.version).toBe(SIGNATURE_VECTOR_VERSION);
  });

  it("keeps risky candidate algorithms non-authoritative until promoted", () => {
    expect(NOVACORE_ALGORITHMS.find((item) => item.key === "timetable.constraint-solver")).toMatchObject({ rolloutMode: "preview", affectsUserOutcome: false });
    expect(NOVACORE_ALGORITHMS.find((item) => item.key === "transport.eta")).toMatchObject({ status: "shadow", rolloutMode: "shadow", affectsUserOutcome: false });
  });

  it("returns internally consistent control-plane counts", () => {
    const summary = novaCoreRegistrySummary();
    expect(summary.algorithmCount).toBe(NOVACORE_ALGORITHMS.length);
    expect(Object.values(summary.byStatus).reduce((sum, value) => sum + value, 0)).toBe(summary.algorithmCount);
    expect(summary.highRiskCount).toBe(NOVACORE_ALGORITHMS.filter((item) => item.risk === "high").length);
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