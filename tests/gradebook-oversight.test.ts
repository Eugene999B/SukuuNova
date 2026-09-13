import { describe, expect, it } from "vitest";
import { buildGradebookOversight } from "../src/lib/gradebook-oversight";

describe("gradebook oversight", () => {
  it("counts excused marks as entered but excludes them from the activity average", () => {
    const result = buildGradebookOversight({
      rosterCounts: { c1: 3 },
      works: [{ id: "w1", assessmentId: "a1", classId: "c1", subjectId: "s1", teacherName: "Teacher One", kind: "Homework", title: "Homework 1", workDate: "2026-09-02", weekNumber: 1, maxScore: 20, status: "published" }],
      assessments: [{ id: "a1", classId: "c1", subjectId: "s1", name: "Homework 1", type: "homework", maxScore: 20 }],
      scores: [
        { assessmentId: "a1", studentId: "st1", value: 20, status: "present" },
        { assessmentId: "a1", studentId: "st2", value: 0, status: "excused" },
      ],
    });

    expect(result.activities[0]).toMatchObject({ entered: 2, expected: 3, missing: 1, completionPct: 67, averagePct: 100 });
  });

  it("keeps direct or legacy assessments visible when no teacher work is linked", () => {
    const result = buildGradebookOversight({
      rosterCounts: { c1: 1 },
      works: [],
      assessments: [{ id: "a1", classId: "c1", subjectId: "s1", name: "Legacy Exam", type: "exam", maxScore: 100 }],
      scores: [{ assessmentId: "a1", studentId: "st1", value: 75, status: "present" }],
    });

    expect(result.activities[0]).toMatchObject({ workId: null, title: "Legacy Exam", kind: "Exam", completionPct: 100, averagePct: 75 });
  });

  it("aggregates school mark-entry completion across activities", () => {
    const result = buildGradebookOversight({
      rosterCounts: { c1: 2 },
      works: [
        { id: "w1", assessmentId: "a1", classId: "c1", subjectId: "s1", teacherName: null, kind: "Exercise", title: "Exercise 1", workDate: null, weekNumber: 1, maxScore: 10, status: "draft" },
        { id: "w2", assessmentId: "a2", classId: "c1", subjectId: "s1", teacherName: null, kind: "Quiz", title: "Quiz 1", workDate: null, weekNumber: 2, maxScore: 10, status: "published" },
      ],
      assessments: [
        { id: "a1", classId: "c1", subjectId: "s1", name: "Exercise 1", type: "exercises", maxScore: 10 },
        { id: "a2", classId: "c1", subjectId: "s1", name: "Quiz 1", type: "quizzes", maxScore: 10 },
      ],
      scores: [
        { assessmentId: "a1", studentId: "st1", value: 8, status: "present" },
        { assessmentId: "a2", studentId: "st1", value: 7, status: "present" },
        { assessmentId: "a2", studentId: "st2", value: 9, status: "present" },
      ],
    });

    expect(result.enteredEntries).toBe(3);
    expect(result.expectedEntries).toBe(4);
    expect(result.missingEntries).toBe(1);
    expect(result.completionPct).toBe(75);
    expect(result.countsByKind).toMatchObject({ Exercise: 1, Quiz: 1 });
  });
});
