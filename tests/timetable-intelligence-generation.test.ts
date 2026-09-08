import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rbac", () => ({ requirePermission: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/lib/audit", () => ({ appendSchoolAudit: vi.fn().mockResolvedValue(undefined) }));

import type { TenantDb } from "../src/lib/db";
import { generateBalancedTimetable } from "../src/lib/timetable-engine-v2";

const config = {
  timetableConfig: {
    days: [{ dayOfWeek: 1, name: "Monday", enabled: true, start: "08:00", end: "12:00" }],
    periodMinutes: 60,
    breaks: [],
    periodsPerDay: 4,
    published: false,
    weeklyPeriods: { "classA:math:teacherA": 3 },
  },
  assessmentConfig: null,
  reportCardConfig: null,
};

const assignment = {
  classId: "classA",
  subjectId: "math",
  teacherId: "teacherA",
  class: { id: "classA", name: "Basic 7", level: "JHS" },
  subject: { id: "math", name: "Mathematics" },
  teacher: { id: "teacherA", name: "Mr Mensah" },
};

function existing(id: string, period: number) {
  return {
    id,
    classId: "classA",
    subjectId: "math",
    teacherId: "teacherA",
    dayOfWeek: 1,
    period,
    venue: null,
    class: { name: "Basic 7" },
    teacher: { name: "Mr Mensah" },
  };
}

function txWithSlots(slots: ReturnType<typeof existing>[]) {
  const create = vi.fn().mockImplementation(async (args: { data: unknown }) => ({ id: "new-slot", ...(args.data as object) }));
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const tx = {
    schoolSettings: { findUnique: vi.fn().mockResolvedValue(config) },
    class: { findMany: vi.fn().mockResolvedValue([{ id: "classA", name: "Basic 7", level: "JHS" }]) },
    classSubjectTeacher: { findMany: vi.fn().mockResolvedValue([assignment]) },
    timetableSlot: {
      findMany: vi.fn().mockResolvedValue(slots),
      create,
      deleteMany,
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
  } as unknown as TenantDb;
  return { tx, create, deleteMany };
}

describe("intelligent timetable generation", () => {
  it("fills only the missing weekly lessons instead of duplicating the full target", async () => {
    const { tx, create, deleteMany } = txWithSlots([existing("slot-1", 1), existing("slot-2", 2)]);

    const result = await generateBalancedTimetable(tx, {
      schoolId: "school-1",
      actorId: "admin-1",
      mode: "fill_gaps",
    });

    expect(result.scheduled).toBe(1);
    expect(result.metrics.targetLessons).toBe(3);
    expect(result.metrics.preservedLessons).toBe(2);
    expect(result.metrics.remainingBeforeGeneration).toBe(1);
    expect(result.metrics.coverageAfter).toBe(100);
    expect(create).toHaveBeenCalledTimes(1);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("returns a dry-run plan without creating or deleting timetable rows", async () => {
    const { tx, create, deleteMany } = txWithSlots([existing("slot-1", 1), existing("slot-2", 2)]);

    const result = await generateBalancedTimetable(tx, {
      schoolId: "school-1",
      actorId: "admin-1",
      mode: "fill_gaps",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.changes.additions).toHaveLength(1);
    expect(result.changes.removeSlotIds).toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("rebuilds around explicitly locked lessons and removes only unlocked rows", async () => {
    const { tx, create, deleteMany } = txWithSlots([existing("locked-slot", 1), existing("replace-me", 2)]);

    const result = await generateBalancedTimetable(tx, {
      schoolId: "school-1",
      actorId: "admin-1",
      mode: "rebuild_preserving_locked",
      lockedSlotIds: ["locked-slot"],
      dryRun: true,
    });

    expect(result.metrics.preservedLessons).toBe(1);
    expect(result.metrics.removedLessons).toBe(1);
    expect(result.metrics.generatedLessons).toBe(2);
    expect(result.changes.keepSlotIds).toEqual(["locked-slot"]);
    expect(result.changes.removeSlotIds).toEqual(["replace-me"]);
    expect(result.changes.additions).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
