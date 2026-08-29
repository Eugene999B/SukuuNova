import { describe, expect, it } from "vitest";
import { calculateSubjectResult, categoryWeight, gradeForPercentage, normalizeAssessmentType, validateAssessmentRules } from "@/lib/assessment-engine";

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

  it("applies each configured category weight once after averaging multiple assessments", () => {
    const result = calculateSubjectResult([
      { id: "cw1", name: "Classwork 1", type: "classwork", maxScore: 20, weight: 20, score: 15 },
      { id: "cw2", name: "Classwork 2", type: "classwork", maxScore: 20, weight: 20, score: 10 },
      { id: "hw", name: "Homework 1", type: "homework", maxScore: 10, weight: 10, score: 8 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 40, score: 70 }
    ], rules);
    // Classwork average 62.5% x 20% = 12.5; Homework 80% x 10% = 8; Exam 70% x 40% = 28.
    expect(result.complete).toBe(true);
    expect(result.total).toBe(48.5);
    expect(result.includedWeight).toBe(70);
  });

  it("keeps a missing mark incomplete under the blank policy", () => {
    const result = calculateSubjectResult([
      { id: "cw", name: "Classwork 1", type: "classwork", maxScore: 20, weight: 1, score: 18 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 1, score: null }
    ], rules);
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
  });

  it("treats missing marks as zero when the school explicitly chooses that policy", () => {
    const result = calculateSubjectResult([
      { id: "hw1", name: "Homework 1", type: "homework", maxScore: 10, weight: 10, score: 8 },
      { id: "hw2", name: "Homework 2", type: "homework", maxScore: 10, weight: 10, score: null },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 40, score: 70 }
    ], { ...rules, missingScorePolicy: "zero" });
    // Homework average is (80% + 0%) / 2 = 40%; contribution = 4. Exam contributes 28.
    expect(result.complete).toBe(false);
    expect(result.total).toBe(32);
    expect(result.includedWeight).toBe(50);
  });

  it("uses school-defined grading bands", () => {
    expect(gradeForPercentage(74, [
      { min: 75, max: 100, grade: "A1" },
      { min: 60, max: 74.99, grade: "B2" },
      { min: 50, max: 59.99, grade: "C3" },
      { min: 0, max: 49.99, grade: "F9" }
    ])).toBe("B2");
  });

  it("rejects an invalid assessment maximum and invalid weight totals", () => {
    expect(() => calculateSubjectResult([
      { id: "bad", name: "Broken", type: "exam", maxScore: 0, weight: 40, score: 10 }
    ], rules)).toThrow(/maximum score/i);
    expect(() => validateAssessmentRules({ ...rules, categories: [{ name: "Exam", weight: 90 }] })).toThrow(/100%/i);
  });
});
