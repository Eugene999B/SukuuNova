import { describe, expect, it } from "vitest";
import { previewSubjectTotal, type PreviewRules } from "../src/components/gradebook-math";
import { calculateSubjectResult } from "../src/lib/assessment-engine";

const RULE_SETS: PreviewRules[] = [
  { categories: [{ name: "ca", weight: 40 }, { name: "exam", weight: 60 }], rounding: "nearest", missingScorePolicy: "blank" },
  { categories: [{ name: "Classwork", weight: 20 }, { name: "Homework", weight: 10 }, { name: "Exam", weight: 70 }], rounding: "down", missingScorePolicy: "blank" },
  { categories: [{ name: "ca", weight: 50 }, { name: "exam", weight: 50 }], rounding: "up", missingScorePolicy: "zero" },
];

const CASES = [
  [
    { id: "a1", type: "CA", maxScore: 20, weight: 40, percentage: 80 },
    { id: "a2", name: "x", type: "exam", maxScore: 100, weight: 60, percentage: 70 },
  ],
  [
    { id: "a1", type: "Class Test", maxScore: 10, weight: 20, percentage: 90 },
    { id: "a2", type: "HOMEWORK", maxScore: 10, weight: 10, percentage: null },
    { id: "a3", type: "Exam", maxScore: 50, weight: 40, percentage: 60 },
  ],
  [
    { id: "a1", type: "ca", maxScore: 20, weight: 40, percentage: null },
    { id: "a2", type: "exam", maxScore: 100, weight: 60, percentage: null },
  ],
  [
    { id: "a1", type: "Quizzes", maxScore: 30, weight: 10, percentage: 33.333 },
    { id: "a2", type: "quiz", maxScore: 30, weight: 10, percentage: 66.666 },
  ],
  // Absent with no mark counts as zero (not missing) on both sides.
  [
    { id: "a1", type: "ca", maxScore: 20, weight: 40, percentage: null, status: "absent" },
    { id: "a2", type: "exam", maxScore: 100, weight: 60, percentage: 70 },
  ],
  // Excused stays missing on both sides.
  [
    { id: "a1", type: "ca", maxScore: 20, weight: 40, percentage: null, status: "excused" },
    { id: "a2", type: "exam", maxScore: 100, weight: 60, percentage: 70 },
  ],
  // Absent with an explicit zero matches absent with no mark.
  [
    { id: "a1", type: "ca", maxScore: 20, weight: 40, percentage: 0, status: "absent" },
    { id: "a2", type: "exam", maxScore: 100, weight: 60, percentage: 70 },
  ],
];

describe("gradebook preview parity with the canonical engine", () => {
  for (const rules of RULE_SETS) {
    for (const [index, items] of CASES.entries()) {
      it(`matches engine: ${JSON.stringify(rules.missingScorePolicy)}/${rules.rounding} case ${index}`, () => {
        const engine = calculateSubjectResult(
          items.map((item, i) => ({
            id: item.id,
            name: `A${i}`,
            type: item.type,
            maxScore: item.maxScore,
            weight: item.weight,
            score: item.percentage == null ? null : (item.percentage / 100) * item.maxScore,
            status: (item as { status?: string }).status ?? null,
          })),
          { ...rules, allowTeacherOverride: false }
        );
        const preview = previewSubjectTotal(items, rules);
        expect(preview).toBe(engine.total);
      });
    }
  }
});
