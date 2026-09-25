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
  it("normalizes legacy and teacher-work assessment names", () => {
    expect(normalizeAssessmentType("CA")).toBe("classwork");
    expect(normalizeAssessmentType("Continuous Assessment")).toBe("classwork");
    expect(normalizeAssessmentType("Homework")).toBe("homework");
    expect(normalizeAssessmentType("Exercise")).toBe("exercises");
    expect(normalizeAssessmentType("Quiz")).toBe("quizzes");
    expect(normalizeAssessmentType("Project")).toBe("project");
    expect(normalizeAssessmentType("Participation")).toBe("participation");
    expect(normalizeAssessmentType("Exam")).toBe("exam");
  });

  it("uses the top-level CA and Exam weights instead of legacy per-assessment weights", () => {
    expect(categoryWeight("ca", 99, rules)).toBe(60);
    expect(categoryWeight("homework", 99, rules)).toBe(60);
    expect(categoryWeight("participation", 99, rules)).toBe(60);
    expect(categoryWeight("exam", 99, rules)).toBe(40);
  });

  it("combines every non-exam activity into the CA bucket", () => {
    const result = calculateSubjectResult([
      { id: "hw", name: "Homework 1", type: "homework", maxScore: 10, weight: 100, score: 10 },
      { id: "ex", name: "Exercise 1", type: "exercise", maxScore: 20, weight: 100, score: 20 },
      { id: "quiz", name: "Quiz 1", type: "quiz", maxScore: 15, weight: 100, score: 15 },
      { id: "project", name: "Project 1", type: "project", maxScore: 50, weight: 100, score: 50 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 100, score: 100 }
    ], rules);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(100);
    expect(result.includedWeight).toBe(100);
    expect(result.breakdown.ca.earned).toBe(95);
    expect(result.breakdown.ca.possible).toBe(95);
    expect(result.details.map((row) => [row.type, row.weight])).toEqual([
      ["homework", 60],
      ["exercises", 60],
      ["quizzes", 60],
      ["project", 60],
      ["exam", 40]
    ]);
  });

  it("treats an unconfigured non-exam activity as CA instead of trusting its row weight", () => {
    const result = calculateSubjectResult([
      { id: "p", name: "Participation", type: "participation", maxScore: 10, weight: 100, score: 10 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 1, score: 80 }
    ], rules);
    expect(result.total).toBe(92);
    expect(result.breakdown.ca.weight).toBe(60);
    expect(result.breakdown.exam.weight).toBe(40);
  });

  it("supports participation as ordinary CA evidence", () => {
    const participationRules = {
      ...rules,
      categories: [{ name: "Participation", weight: 60 }, { name: "Exam", weight: 40 }]
    };
    const result = calculateSubjectResult([
      { id: "p", name: "Participation", type: "participation", maxScore: 10, weight: 1, score: 9 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 1, score: 100 }
    ], participationRules);
    expect(result.total).toBe(94);
    expect(result.includedWeight).toBe(100);
  });

  it("rejects duplicate raw category names", () => {
    expect(() => validateAssessmentRules({
      ...rules,
      categories: [
        { name: "Classwork", weight: 30 },
        { name: "Classwork", weight: 30 },
        { name: "Exam", weight: 40 }
      ]
    })).toThrow(/unique/i);
  });

  it("combines CA by total earned points before applying the CA weight", () => {
    const result = calculateSubjectResult([
      { id: "cw1", name: "Classwork 1", type: "classwork", maxScore: 20, weight: 20, score: 15 },
      { id: "cw2", name: "Classwork 2", type: "classwork", maxScore: 20, weight: 20, score: 10 },
      { id: "hw", name: "Homework 1", type: "homework", maxScore: 10, weight: 10, score: 8 },
      { id: "exam", name: "Exam", type: "exam", maxScore: 100, weight: 40, score: 70 }
    ], rules);
    // CA is 33/50 = 66%; 66% x 60 = 39.6. Exam is 70%; 70% x 40 = 28.
    expect(result.complete).toBe(true);
    expect(result.breakdown.ca.earned).toBe(33);
    expect(result.breakdown.ca.possible).toBe(50);
    expect(result.breakdown.ca.percentage).toBe(66);
    expect(result.total).toBe(67.6);
    expect(result.includedWeight).toBe(100);
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
    // CA is 8/20 = 40%; contribution = 24. Exam contributes 28.
    expect(result.complete).toBe(false);
    expect(result.total).toBe(52);
    expect(result.includedWeight).toBe(100);
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

it("treats recorded absence as zero while preserving unentered and excused work", () => {
  const assessment={id:"ca",name:"CA",type:"ca",maxScore:100,weight:40};
  const exam={id:"exam",name:"Exam",type:"exam",maxScore:100,weight:60,score:80};
  const policy={...rules,caWeight:40,examWeight:60};
  for(const score of [null,95]) {
    const result=calculateSubjectResult([{...assessment,score,status:"absent"},exam],policy);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(48);
    expect(result.details[0].rawScore).toBe(0);
  }
  expect(calculateSubjectResult([{...assessment,score:null},exam],policy).total).toBeNull();
  expect(calculateSubjectResult([{...assessment,score:95,status:"excused"},exam],policy).details[0].rawScore).toBeNull();
});
