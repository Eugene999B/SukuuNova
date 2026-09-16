import { describe, expect, it } from "vitest";
import { previewSubjectTotal, type PreviewRules } from "../src/components/gradebook-math";
import { calculateSubjectResult } from "../src/lib/assessment-engine";

type Item = { id: string; type: string; maxScore: number; weight: number; percentage: number | null; status?: "present" | "absent" | "excused" };

function engineTotal(items: Item[], rules: PreviewRules) {
  return calculateSubjectResult(
    items.map((item, index) => ({
      id: item.id,
      name: `A${index + 1}`,
      type: item.type,
      maxScore: item.maxScore,
      weight: item.weight,
      score: item.percentage == null ? null : item.percentage / 100 * item.maxScore,
      status: item.status,
    })),
    { ...rules, allowTeacherOverride: false },
  );
}

describe("gradebook preview parity with the canonical CA/Exam engine", () => {
  it("uses total points across all continuous-assessment work before applying the CA weight", () => {
    const rules: PreviewRules = {
      categories: [
        { name: "Classwork", weight: 20 },
        { name: "Homework", weight: 10 },
        { name: "Exercises", weight: 10 },
        { name: "Quizzes", weight: 10 },
        { name: "Project", weight: 10 },
        { name: "Exam", weight: 40 },
      ],
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items: Item[] = [
      { id: "h1", type: "Homework", maxScore: 10, weight: 10, percentage: 80 },
      { id: "h2", type: "Homework", maxScore: 20, weight: 10, percentage: 75 },
      { id: "c1", type: "Classwork", maxScore: 20, weight: 20, percentage: 90 },
      { id: "exam", type: "Exam", maxScore: 100, weight: 40, percentage: 70 },
    ];

    const engine = engineTotal(items, rules);
    expect(engine.breakdown.ca.earned).toBeCloseTo(41, 8);
    expect(engine.breakdown.ca.possible).toBe(50);
    expect(engine.breakdown.ca.percentage).toBeCloseTo(82, 8);
    expect(engine.breakdown.ca.contribution).toBeCloseTo(49.2, 8);
    expect(engine.breakdown.exam.contribution).toBeCloseTo(28, 8);
    expect(engine.total).toBe(77.2);
    expect(previewSubjectTotal(items, rules)).toBe(77.2);
  });

  it("does not give a tiny perfect homework the same influence as a much larger homework", () => {
    const rules: PreviewRules = {
      categories: [{ name: "Homework", weight: 60 }, { name: "Exam", weight: 40 }],
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items: Item[] = [
      { id: "small", type: "Homework", maxScore: 5, weight: 60, percentage: 100 },
      { id: "large", type: "Homework", maxScore: 100, weight: 60, percentage: 50 },
      { id: "exam", type: "Exam", maxScore: 100, weight: 40, percentage: 100 },
    ];

    const engine = engineTotal(items, rules);
    expect(engine.breakdown.ca.percentage).toBeCloseTo(52.380952, 5);
    expect(engine.total).toBe(71.43);
    expect(previewSubjectTotal(items, rules)).toBe(71.43);
  });

  it("uses the official SchoolSettings CA/Exam weights even when legacy category weights differ", () => {
    const rules: PreviewRules = {
      categories: [
        { name: "Homework", weight: 30 },
        { name: "Classwork", weight: 30 },
        { name: "Exam", weight: 40 },
      ],
      caWeight: 30,
      examWeight: 70,
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items: Item[] = [
      { id: "ca", type: "Homework", maxScore: 20, weight: 30, percentage: 80 },
      { id: "exam", type: "Exam", maxScore: 100, weight: 40, percentage: 60 },
    ];

    const engine = engineTotal(items, rules);
    expect(engine.breakdown.ca.weight).toBe(30);
    expect(engine.breakdown.exam.weight).toBe(70);
    expect(engine.total).toBe(66);
    expect(previewSubjectTotal(items, rules)).toBe(66);
  });

  it("allows Exam and Examination labels to share the same official exam bucket", () => {
    const rules: PreviewRules = {
      categories: [
        { name: "Homework", weight: 30 },
        { name: "Exam", weight: 35 },
        { name: "Examination", weight: 35 },
      ],
      caWeight: 30,
      examWeight: 70,
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items: Item[] = [
      { id: "ca", type: "Homework", maxScore: 10, weight: 30, percentage: 100 },
      { id: "exam", type: "Examination", maxScore: 100, weight: 35, percentage: 50 },
    ];
    expect(engineTotal(items, rules).total).toBe(65);
    expect(previewSubjectTotal(items, rules)).toBe(65);
  });

  it("treats every non-exam activity as CA even when it has no separate configured weight", () => {
    const rules: PreviewRules = {
      categories: [{ name: "Classwork", weight: 40 }, { name: "Exam", weight: 60 }],
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const items: Item[] = [
      { id: "p1", type: "Participation", maxScore: 10, weight: 0, percentage: 80 },
      { id: "exam", type: "Exam", maxScore: 100, weight: 60, percentage: 70 },
    ];

    expect(engineTotal(items, rules).total).toBe(74);
    expect(previewSubjectTotal(items, rules)).toBe(74);
  });

  it("excludes excused work from both earned and possible points", () => {
    const rules: PreviewRules = {
      categories: [{ name: "CA", weight: 50 }, { name: "Exam", weight: 50 }],
      rounding: "nearest",
      missingScorePolicy: "zero",
    };
    const items: Item[] = [
      { id: "ca1", type: "Homework", maxScore: 10, weight: 50, percentage: 100 },
      { id: "ca2", type: "Classwork", maxScore: 90, weight: 50, percentage: null, status: "excused" },
      { id: "exam", type: "Exam", maxScore: 100, weight: 50, percentage: 80 },
    ];

    const engine = engineTotal(items, rules);
    expect(engine.breakdown.ca.possible).toBe(10);
    expect(engine.total).toBe(90);
    expect(previewSubjectTotal(items, rules)).toBe(90);
  });

  it("keeps the official total blank until required CA and Exam evidence is complete under blank policy", () => {
    const rules: PreviewRules = {
      categories: [{ name: "CA", weight: 60 }, { name: "Exam", weight: 40 }],
      rounding: "nearest",
      missingScorePolicy: "blank",
    };
    const noExam: Item[] = [{ id: "ca", type: "Homework", maxScore: 10, weight: 60, percentage: 80 }];
    const missingMark: Item[] = [
      { id: "ca", type: "Homework", maxScore: 10, weight: 60, percentage: null },
      { id: "exam", type: "Exam", maxScore: 100, weight: 40, percentage: 70 },
    ];

    expect(engineTotal(noExam, rules).total).toBeNull();
    expect(previewSubjectTotal(noExam, rules)).toBeNull();
    expect(engineTotal(missingMark, rules).total).toBeNull();
    expect(previewSubjectTotal(missingMark, rules)).toBeNull();
  });
});
