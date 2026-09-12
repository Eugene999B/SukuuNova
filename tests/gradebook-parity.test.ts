import { describe, expect, it } from "vitest";
import { previewSubjectTotal, type PreviewRules } from "../src/components/gradebook-math";
import { calculateSubjectResult } from "../src/lib/assessment-engine";

type ParityCase = {
  rules: PreviewRules;
  items: Array<{ id: string; type: string; maxScore: number; weight: number; percentage: number | null }>;
};

const CASES: ParityCase[] = [
  {
    rules: { categories: [{ name: "ca", weight: 40 }, { name: "exam", weight: 60 }], rounding: "nearest", missingScorePolicy: "blank" },
    items: [
      { id: "a1", type: "CA", maxScore: 20, weight: 40, percentage: 80 },
      { id: "a2", type: "exam", maxScore: 100, weight: 60, percentage: 70 },
    ],
  },
  {
    rules: { categories: [{ name: "Classwork", weight: 20 }, { name: "Homework", weight: 10 }, { name: "Exam", weight: 70 }], rounding: "down", missingScorePolicy: "blank" },
    items: [
      { id: "a1", type: "Classwork", maxScore: 10, weight: 20, percentage: 90 },
      { id: "a2", type: "HOMEWORK", maxScore: 10, weight: 10, percentage: 80 },
      { id: "a3", type: "Exam", maxScore: 50, weight: 70, percentage: 60 },
    ],
  },
  {
    rules: { categories: [{ name: "ca", weight: 50 }, { name: "exam", weight: 50 }], rounding: "up", missingScorePolicy: "zero" },
    items: [
      { id: "a1", type: "ca", maxScore: 20, weight: 50, percentage: null },
      { id: "a2", type: "exam", maxScore: 100, weight: 50, percentage: null },
    ],
  },
  {
    rules: { categories: [{ name: "Quizzes", weight: 20 }, { name: "Exam", weight: 80 }], rounding: "nearest", missingScorePolicy: "blank" },
    items: [
      { id: "a1", type: "Quizzes", maxScore: 30, weight: 10, percentage: 33.333 },
      { id: "a2", type: "quiz", maxScore: 30, weight: 10, percentage: 66.666 },
      { id: "a3", type: "exam", maxScore: 100, weight: 80, percentage: 75 },
    ],
  },
];

describe("gradebook preview parity with the canonical engine", () => {
  for (const [index, { rules, items }] of CASES.entries()) {
    it(`matches engine for configured case ${index}`, () => {
      const engine = calculateSubjectResult(
        items.map((item, i) => ({
          id: item.id,
          name: `A${i}`,
          type: item.type,
          maxScore: item.maxScore,
          weight: item.weight,
          score: item.percentage == null ? null : (item.percentage / 100) * item.maxScore,
        })),
        { ...rules, allowTeacherOverride: false }
      );
      const preview = previewSubjectTotal(items, rules);
      expect(preview).toBe(engine.total);
    });
  }

  it("fails closed in the preview when the school has not configured the assessment category", () => {
    const rules: PreviewRules = {
      categories: [{ name: "Classwork", weight: 40 }, { name: "Exam", weight: 60 }],
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items = [{ id: "a1", type: "Participation", maxScore: 10, weight: 100, percentage: 100 }];

    expect(() => calculateSubjectResult(
      [{ id: "a1", name: "Participation", type: "Participation", maxScore: 10, weight: 100, score: 10 }],
      { ...rules, allowTeacherOverride: false }
    )).toThrow(/not configured/i);
    expect(previewSubjectTotal(items, rules)).toBeNull();
  });
});
