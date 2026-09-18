import { describe, expect, it } from "vitest";
import { learningCapabilityForSelection } from "./learning-capabilities";

function config(overrides: Partial<Parameters<typeof learningCapabilityForSelection>[0]> = {}) {
  return {
    lane: "school" as const,
    programId: "ghana",
    levelId: "jhs-3",
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

  it("marks scalable generated topics as massive", () => {
    const capability = learningCapabilityForSelection(config({
      levelId: "shs-2",
      subjectId: "mathematics",
      topicId: "algebra",
    }));
    expect(capability.ready).toBe(true);
    expect(capability.variantCapacity).toBeGreaterThanOrEqual(1_000_000);
    expect(capability.stage).toBe("massive");
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

  it("maps JHS reviewed content into BECE but not WASSCE", () => {
    const bece = learningCapabilityForSelection(config({
      lane: "exam",
      programId: "bece",
      levelId: "practice",
      subjectId: "social",
      topicId: "governance",
    }));
    const wassce = learningCapabilityForSelection(config({
      lane: "exam",
      programId: "wassce",
      levelId: "practice",
      subjectId: "social",
      topicId: "governance",
    }));
    expect(bece.reviewedStandardQuestions).toBeGreaterThan(0);
    expect(bece.ready).toBe(true);
    expect(wassce.reviewedStandardQuestions).toBe(0);
    expect(wassce.ready).toBe(false);
  });
});
