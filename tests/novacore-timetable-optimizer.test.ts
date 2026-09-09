import { describe, expect, it } from "vitest";
import { optimizeTimetable, type TimetableOptimizerInput } from "../src/lib/novacore/timetable-optimizer";

const slots = [
  { dayOfWeek: 1, period: 1 },
  { dayOfWeek: 1, period: 2 },
  { dayOfWeek: 1, period: 3 },
  { dayOfWeek: 2, period: 1 },
  { dayOfWeek: 2, period: 2 },
  { dayOfWeek: 2, period: 3 },
];

function baseInput(): TimetableOptimizerInput {
  return {
    slots,
    maxSearchNodes: 50_000,
    demands: [
      { id: "math-a", classId: "class-a", subjectId: "math", teacherId: "teacher-1", occurrences: 2, maxPerDay: 1 },
      { id: "english-a", classId: "class-a", subjectId: "english", teacherId: "teacher-2", occurrences: 2, maxPerDay: 1 },
      { id: "math-b", classId: "class-b", subjectId: "math", teacherId: "teacher-1", occurrences: 2, maxPerDay: 1 },
    ],
  };
}

describe("NovaCore timetable optimizer", () => {
  it("produces a complete collision-free timetable", () => {
    const result = optimizeTimetable(baseInput());
    expect(["optimal", "feasible"]).toContain(result.status);
    expect(result.placements).toHaveLength(6);

    const teachers = new Set<string>();
    const classes = new Set<string>();
    for (const placement of result.placements) {
      const teacherKey = `${placement.teacherId}:${placement.dayOfWeek}:${placement.period}`;
      const classKey = `${placement.classId}:${placement.dayOfWeek}:${placement.period}`;
      expect(teachers.has(teacherKey)).toBe(false);
      expect(classes.has(classKey)).toBe(false);
      teachers.add(teacherKey);
      classes.add(classKey);
    }
  });

  it("preserves locked lessons exactly", () => {
    const input = baseInput();
    input.lockedPlacements = [{ demandId: "math-a", occurrenceIndex: 0, dayOfWeek: 2, period: 3 }];
    const result = optimizeTimetable(input);
    const locked = result.placements.find((placement) => placement.demandId === "math-a" && placement.occurrenceIndex === 0);
    expect(locked).toMatchObject({ dayOfWeek: 2, period: 3, locked: true });
  });

  it("is deterministic for identical input", () => {
    const a = optimizeTimetable(baseInput());
    const b = optimizeTimetable(baseInput());
    expect(a.status).toBe(b.status);
    expect(a.score).toBe(b.score);
    expect(a.placements).toEqual(b.placements);
  });

  it("spreads repeated lessons across days when maxPerDay is one", () => {
    const result = optimizeTimetable({
      slots,
      demands: [{ id: "science-a", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 2, maxPerDay: 1 }],
    });
    expect(result.status).not.toBe("infeasible");
    expect(new Set(result.placements.map((placement) => placement.dayOfWeek)).size).toBe(2);
  });

  it("counts single and double demands together for the same daily assignment limit", () => {
    const result = optimizeTimetable({
      slots,
      demands: [
        { id: "science:double", groupId: "class-a:science:teacher-1", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 1, blockSize: 2, maxPerDay: 2 },
        { id: "science:single", groupId: "class-a:science:teacher-1", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 1, blockSize: 1, maxPerDay: 2 },
      ],
    });
    expect(result.status).not.toBe("infeasible");
    const double = result.placements.find((placement) => placement.demandId === "science:double")!;
    const single = result.placements.find((placement) => placement.demandId === "science:single")!;
    expect(double.dayOfWeek).not.toBe(single.dayOfWeek);
  });

  it("counts preserved assignment periods before placing a new double block", () => {
    const result = optimizeTimetable({
      slots,
      fixedPlacements: [{ classId: "class-a", teacherId: "teacher-1", dayOfWeek: 1, period: 1, groupId: "class-a:science:teacher-1" }],
      demands: [{ id: "science:double", groupId: "class-a:science:teacher-1", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 1, blockSize: 2, maxPerDay: 2 }],
    });
    expect(result.status).not.toBe("infeasible");
    expect(result.placements[0].dayOfWeek).toBe(2);
  });

  it("honours teacher unavailability as a hard constraint", () => {
    const result = optimizeTimetable({
      slots: [{ dayOfWeek: 1, period: 1 }, { dayOfWeek: 1, period: 2 }],
      teacherUnavailable: ["teacher-1:1:1"],
      demands: [{ id: "math", classId: "class-a", subjectId: "math", teacherId: "teacher-1", occurrences: 1 }],
    });
    expect(result.placements[0]).toMatchObject({ dayOfWeek: 1, period: 2 });
  });

  it("allocates required room types without double-booking rooms", () => {
    const result = optimizeTimetable({
      slots: [{ dayOfWeek: 1, period: 1 }, { dayOfWeek: 1, period: 2 }],
      rooms: [{ id: "lab-1", type: "lab" }, { id: "room-1", type: "general" }],
      demands: [
        { id: "science-a", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 1, requiredRoomType: "lab" },
        { id: "science-b", classId: "class-b", subjectId: "science", teacherId: "teacher-2", occurrences: 1, requiredRoomType: "lab" },
      ],
    });
    expect(result.status).not.toBe("infeasible");
    expect(result.placements.every((placement) => placement.roomId === "lab-1")).toBe(true);
    expect(result.placements[0].period).not.toBe(result.placements[1].period);
  });

  it("reports why an impossible timetable cannot be completed", () => {
    const result = optimizeTimetable({
      slots: [{ dayOfWeek: 1, period: 1 }],
      demands: [
        { id: "a", classId: "class-a", subjectId: "math", teacherId: "teacher-1", occurrences: 1 },
        { id: "b", classId: "class-b", subjectId: "science", teacherId: "teacher-1", occurrences: 1 },
      ],
    });
    expect(result.status).toBe("infeasible");
    expect(result.diagnostics.reasons.teacher_conflict).toBeGreaterThan(0);
    expect(result.diagnostics.deadEndDemandIds.length).toBeGreaterThan(0);
  });

  it("places double periods only on contiguous teaching slots", () => {
    const result = optimizeTimetable({
      slots: [{ dayOfWeek: 1, period: 1 }, { dayOfWeek: 1, period: 3 }, { dayOfWeek: 1, period: 4 }],
      demands: [{ id: "double", classId: "class-a", subjectId: "science", teacherId: "teacher-1", occurrences: 1, blockSize: 2 }],
    });
    expect(result.status).not.toBe("infeasible");
    expect(result.placements[0]).toMatchObject({ period: 3, blockSize: 2 });
  });
});
