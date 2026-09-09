import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateBalancedTimetable: vi.fn(),
  appendSchoolAudit: vi.fn().mockResolvedValue(undefined),
  getAcademicEngineConfig: vi.fn(),
}));

vi.mock("../src/lib/timetable-engine-v2", () => ({ generateBalancedTimetable: mocks.generateBalancedTimetable }));
vi.mock("../src/lib/audit", () => ({ appendSchoolAudit: mocks.appendSchoolAudit }));
vi.mock("../src/lib/academic-engine", () => ({ getAcademicEngineConfig: mocks.getAcademicEngineConfig }));

import type { TenantDb } from "../src/lib/db";
import { generateSchoolTimetable, readTimetableExtensions } from "../src/lib/timetable-generation-policy";

const rawConfig = {
  timetableConfig: {
    maxDailyPeriods: { "classA:math:teacherA": 1, ignored: 99 },
    printTheme: "heritage_green",
  },
};

function fakeTx() {
  return {
    schoolSettings: {
      findUnique: vi.fn().mockResolvedValue(rawConfig),
      update: vi.fn().mockResolvedValue({}),
    },
    timetableSlot: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn().mockResolvedValue(0),
  } as unknown as TenantDb;
}

function plan(additions: Array<{ classId: string; subjectId: string; teacherId: string; dayOfWeek: number }>) {
  return {
    dryRun: true,
    scheduled: additions.length,
    classes: 1,
    teachers: 1,
    days: 5,
    periodsPerDay: 8,
    published: false,
    breaks: [],
    attempts: 1,
    roomsUsed: 0,
    pairedBlocks: 0,
    warnings: [],
    metrics: {
      targetLessons: additions.length,
      existingInScope: 0,
      preservedLessons: 0,
      generatedLessons: additions.length,
      removedLessons: 0,
      remainingBeforeGeneration: additions.length,
      coverageAfter: 100,
    },
    changes: { keepSlotIds: [], removeSlotIds: [], additions },
  };
}

describe("timetable generation policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendSchoolAudit.mockResolvedValue(undefined);
    mocks.getAcademicEngineConfig.mockResolvedValue({
      timetable: { days: [], periodMinutes: 40, breaks: [], periodsPerDay: 8, published: false },
      assessment: {},
      reportCard: {},
    });
  });

  it("normalizes print theme and daily subject limits from flexible school settings", () => {
    expect(readTimetableExtensions(rawConfig.timetableConfig)).toEqual({
      maxDailyPeriods: {
        "classA:math:teacherA": 1,
        ignored: 6,
      },
      printTheme: "heritage_green",
    });
    expect(readTimetableExtensions({ printTheme: "unknown" })).toEqual({
      maxDailyPeriods: {},
      printTheme: "ghana_classic",
    });
  });

  it("rejects a generation preview that exceeds the configured subject lessons per day", async () => {
    mocks.generateBalancedTimetable.mockResolvedValue(plan([
      { classId: "classA", subjectId: "math", teacherId: "teacherA", dayOfWeek: 1 },
      { classId: "classA", subjectId: "math", teacherId: "teacherA", dayOfWeek: 1 },
    ]));

    await expect(generateSchoolTimetable(fakeTx(), {
      schoolId: "school-1",
      actorId: "admin-1",
      mode: "rebuild",
      dryRun: true,
    })).rejects.toMatchObject({ code: "TIMETABLE_DAILY_LIMIT_EXCEEDED" });
  });

  it("publishes a successful generated timetable while preserving the selected print theme", async () => {
    const preview = plan([{ classId: "classA", subjectId: "math", teacherId: "teacherA", dayOfWeek: 1 }]);
    const applied = { ...preview, dryRun: false };
    mocks.generateBalancedTimetable.mockResolvedValueOnce(preview).mockResolvedValueOnce(applied);
    const tx = fakeTx();

    const result = await generateSchoolTimetable(tx, {
      schoolId: "school-1",
      actorId: "admin-1",
      mode: "rebuild",
      dryRun: false,
    });

    expect(result.published).toBe(true);
    expect(tx.schoolSettings.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: "school-1" },
      data: expect.objectContaining({
        timetableConfig: expect.objectContaining({
          published: true,
          printTheme: "heritage_green",
        }),
      }),
    }));
    expect(mocks.appendSchoolAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "timetable.published_after_generation",
    }));
  });
});
