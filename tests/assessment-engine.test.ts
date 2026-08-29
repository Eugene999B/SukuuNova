import { describe, expect, it } from "vitest";
import { calculateSubjectResult, categoryWeight, normalizeAssessmentType, validateAssessmentRules } from "@/lib/assessment-engine";

const rules = {
  categories: [
    { name: "Classwork", weight: 20 },
    { name: "Homework", weight: 10 },
    { name: "Exercises", weight: 10 },
    { name: "Quizzes", weight: 10 },
    { name: "Project", weight: 10 },
    { name: "Exam", weight: 40 }
  ],
  rounding: "nearest" as const,
  missingScorePolicy: "blank" as const,
  allowTeacherOverride: false
};

describe("assessment engine", () => {
  it("normalizes legacy assessment names", () => {
    expect(normalizeAssessmentType("CA")).toBe("classwork");
    expect(normalizeAssessmentType("Continuous Assessment")).toBe("classwork");
    expect(normalizeAssessmentType("Exam")).toBe("exam");
  });

  it("uses configured category weights instead of legacy assessment weights", () => {
    expect(categoryWeight("ca", 99, rules)).toBe(20);
    expect(categoryWeight("exam", 99, rules)).toBe(40);
  });

  it("returns a complete weighted subject result", () => {
    const result = calculateSubjectResult([
      { id: "cw", name: "Classwork 1", type: "classwork", maxScore: 20, weight: 1, score: 18 },
      { id: "hw", name: "Homework 1", type: "homework", maxScore: 10, weight: 1, score: 8 },
      { id: "ex", name: "Exam", type: "exam", maxScore: 100, weight: 1, score: 70 }
    ], {
      ...rules,
      categories: [
        { name: "Classwork", weight: 30 },
        { name: "Homework", weight: 10 },
        { name: "Exam", weight: 60 }
      ]
    });
    expect(result.complete).toBe(true);
    expect(result.total).toBe(75);
    expect(result.includedWeight).toBe(100);
  });

  it("does not turn missing marks into zero when the school policy is blank", () => {
    const result = calculateSubjectResult([
      { id: "cw", name: "Classwork 1", type: "classwork", maxScore: 20, weight: 1, score: 18 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 1, score: null }
    ], rules);
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
  });

  it("rejects invalid weight totals", () => {
    expect(() => validateAssessmentRules({ ...rules, categories: [{ name: "Exam", weight: 90 }] })).toThrow(/100%/i);
  });
});
