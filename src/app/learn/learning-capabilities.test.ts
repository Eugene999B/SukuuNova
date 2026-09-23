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

  it("keeps JHS reviewed content separated while giving SHS its own massive generated coverage", () => {
    const capability = learningCapabilityForSelection(config({
      programId: "shs-general-science",
      levelId: "shs-2",
      subjectId: "core-mathematics",
      topicId: "algebra-and-equations",
    }));
    expect(capability.reviewedStandardQuestions).toBe(0);
    expect(capability.ready).toBe(true);
    expect(capability.coverageCapacity).toBeGreaterThan(0);
    expect(capability.coverageCapacity).toBeLessThan(1000);
    expect(capability.stage).not.toBe("mapped");
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

  it("gives BECE and WASSCE subject topics massive exam-practice coverage without borrowing JHS fixed questions", () => {
    for (const programId of ["bece", "wassce"] as const) {
      const capability = learningCapabilityForSelection(config({
        lane: "exam",
        programId,
        levelId: "practice",
        subjectId: "social",
        topicId: "governance",
      }));
      expect(capability.reviewedStandardQuestions).toBe(0);
      expect(capability.ready).toBe(true);
      expect(capability.coverageCapacity).toBeGreaterThan(0);
    expect(capability.coverageCapacity).toBeLessThan(1000);
      expect(capability.stage).not.toBe("mapped");
    }
  });
});
