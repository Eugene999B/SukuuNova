import { describe, expect, it } from "vitest";
import { normalizeAssessmentRulesForRuntime } from "../src/lib/gradebook-read-service";

describe("gradebook runtime configuration recovery", () => {
  it("preserves a valid configured assessment policy", () => {
    const value = {
      categories: [{ name: "CA", weight: 40 }, { name: "Exam", weight: 60 }],
      rounding: "down",
      missingScorePolicy: "zero",
      allowTeacherOverride: true,
    };
    const result = normalizeAssessmentRulesForRuntime(value);
    expect(result.repaired).toBe(false);
    expect(result.rules).toEqual(value);
  });

  it("recovers malformed legacy configuration instead of crashing mark-sheet reads", () => {
    const result = normalizeAssessmentRulesForRuntime({
      categories: [{ name: "CA", weight: 25 }],
      rounding: "legacy-rounding",
      missingScorePolicy: "mystery",
    });
    expect(result.repaired).toBe(true);
    expect(result.rules.categories.reduce((sum, category) => sum + category.weight, 0)).toBe(100);
    expect(result.rules.rounding).toBe("nearest");
    expect(result.rules.missingScorePolicy).toBe("blank");
  });

  it("uses safe defaults when a legacy row is not an assessment object", () => {
    const result = normalizeAssessmentRulesForRuntime("broken");
    expect(result.repaired).toBe(true);
    expect(result.rules.categories.length).toBeGreaterThan(0);
  });
});
