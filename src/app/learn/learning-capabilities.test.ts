import { describe, expect, it } from "vitest";
import { learningCapabilityForSelection } from "./learning-capabilities";

function config(overrides: Partial<Parameters<typeof learningCapabilityForSelection>[0]> = {}) {
  return {
    lane: "school" as const,
    programId: "ghana",
    levelId: "jhs-1",
    subjectId: "computing",
    topicId: "digital-safety",
    mode: "topic" as const,
    count: 10,
    seed: 1,
    ...overrides,
  };
}

describe("SukuuNova learning capability registry", () => {
  it("recognises reviewed JHS topic coverage", () => {
    const capability = learningCapabilityForSelection(config());
    expect(capability.ready).toBe(true);
    expect(capability.reviewedStandardQuestions).toBeGreaterThanOrEqual(2);
  });

  it("does not treat JHS reviewed questions as SHS content", () => {
    const capability = learningCapabilityForSelection(config({ levelId: "shs-2" }));
    expect(capability.reviewedStandardQuestions).toBe(0);
    expect(capability.ready).toBe(false);
  });

  it("does not promote generic JHS generators into SHS readiness", () => {
    const capability = learningCapabilityForSelection(config({
      levelId: "shs-2",
      subjectId: "mathematics",
      topicId: "algebra",
    }));
    expect(capability.reviewedStandardQuestions).toBe(0);
    expect(capability.variantCapacity).toBe(0);
    expect(capability.ready).toBe(false);
    expect(capability.stage).toBe("mapped");
  });

  it("gives KG a million-scale age-specific numeracy path", () => {
    const capability = learningCapabilityForSelection(config({
      levelId: "kg-1",
      subjectId: "numeracy",
      topicId: "number-stories",
    }));
    expect(capability.ready).toBe(true);
    expect(capability.variantCapacity).toBeGreaterThanOrEqual(1_000_000);
  });

  it("does not repurpose school foundation content as exam preparation", () => {
    for (const programId of ["bece", "wassce"] as const) {
      const capability = learningCapabilityForSelection(config({
        lane: "exam",
        programId,
        levelId: "practice",
        subjectId: "social",
        topicId: "governance",
      }));
      expect(capability.reviewedStandardQuestions).toBe(0);
      expect(capability.variantCapacity).toBe(0);
      expect(capability.ready).toBe(false);
    }
  });
});
