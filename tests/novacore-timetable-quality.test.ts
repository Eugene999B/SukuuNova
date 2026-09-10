import { describe, expect, it } from "vitest";
import { compareTimetableQuality, scoreTimetableQuality } from "../src/lib/novacore/timetable-quality";

describe("NovaCore timetable quality", () => {
  it("makes hard teacher/class/room collisions dominate the score", () => {
    const quality = scoreTimetableQuality([
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 1, roomId: "r1" },
      { classId: "a", subjectId: "english", teacherId: "t2", dayOfWeek: 1, period: 1, roomId: "r2" },
      { classId: "b", subjectId: "science", teacherId: "t1", dayOfWeek: 1, period: 1, roomId: "r1" },
    ]);
    expect(quality.classConflicts).toBe(1);
    expect(quality.teacherConflicts).toBe(1);
    expect(quality.roomConflicts).toBe(1);
    expect(quality.hardConflicts).toBe(3);
    expect(quality.score).toBeGreaterThanOrEqual(30_000);
  });

  it("penalizes same assignment concentration and teacher idle gaps", () => {
    const quality = scoreTimetableQuality([
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 1 },
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 2 },
      { classId: "b", subjectId: "science", teacherId: "t1", dayOfWeek: 1, period: 4 },
    ]);
    expect(quality.repeatedAssignmentDayPenalty).toBe(1);
    expect(quality.teacherIdleGaps).toBe(1);
    expect(quality.score).toBe(11);
  });

  it("compares a candidate against a baseline with explainable deltas", () => {
    const current = scoreTimetableQuality([
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 1 },
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 2 },
      { classId: "b", subjectId: "science", teacherId: "t1", dayOfWeek: 1, period: 4 },
    ]);
    const candidate = scoreTimetableQuality([
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 1, period: 1 },
      { classId: "a", subjectId: "math", teacherId: "t1", dayOfWeek: 2, period: 1 },
      { classId: "b", subjectId: "science", teacherId: "t1", dayOfWeek: 1, period: 2 },
    ]);
    const comparison = compareTimetableQuality(current, candidate);
    expect(comparison.candidateWins).toBe(true);
    expect(comparison.scoreImprovementPercent).toBeGreaterThan(0);
    expect(comparison.teacherIdleGapDelta).toBeLessThan(0);
    expect(comparison.repeatedAssignmentDayDelta).toBeLessThan(0);
  });
});
