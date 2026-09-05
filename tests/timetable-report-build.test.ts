import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("../src/lib/audit", () => ({
  appendSchoolAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/report-card-ranking", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  freezeReportCardRanking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/message-outbox", () => ({
  enqueueSms: vi.fn().mockResolvedValue([]),
  enqueueNotification: vi.fn().mockResolvedValue([]),
}));

import { generateBalancedTimetable } from "../src/lib/timetable-engine-v2";
import { moveTimetableSlot, swapTimetableSlots } from "../src/lib/timetable-service";
import { promotionForRule, remarkForPosition } from "../src/lib/report-card-service";
import { approveAndQueuePublicReportCard } from "../src/lib/report-card-release-service";
import type { TenantDb } from "../src/lib/db";

const mondayOnly = {
  timetableConfig: {
    days: [{ dayOfWeek: 1, name: "Monday", enabled: true, start: "08:00", end: "12:00" }],
    periodMinutes: 60,
    breaks: [],
    periodsPerDay: 2,
    published: false,
  },
  assessmentConfig: null,
  reportCardConfig: null,
};

function baseTx(overrides: Record<string, unknown> = {}) {
  return {
    schoolSettings: { findUnique: vi.fn().mockResolvedValue(mondayOnly) },
    class: { findMany: vi.fn().mockResolvedValue([{ id: "classA", name: "Basic 7", level: "Basic" }]) },
    classSubjectTeacher: {
      findMany: vi.fn().mockResolvedValue([
        { classId: "classA", subjectId: "subMath", teacherId: "teacherT", class: { id: "classA", name: "Basic 7" }, subject: { id: "subMath", name: "Mathematics" }, teacher: { id: "teacherT", name: "Mr. Mensah" } },
      ]),
    },
    timetableSlot: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (args: { data: unknown }) => ({ id: "slot", ...(args.data as object) })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as TenantDb;
}

describe("timetable generator consolidation", () => {
  it("respects slots outside a scoped run instead of double-booking the teacher", async () => {
    const tx = baseTx({
      timetableSlot: {
        findMany: vi.fn().mockImplementation(async (args: { where?: { classId?: { notIn?: string[] } } }) => {
          // Seeded commitments outside the run scope: Mr. Mensah teaches Class 8B Mon P1 + P2.
          if (args.where?.classId && typeof args.where.classId === "object" && "notIn" in (args.where.classId as object)) {
            return [
              { classId: "classB", teacherId: "teacherT", dayOfWeek: 1, period: 1, venue: null, class: { name: "Class 8B" }, teacher: { name: "Mr. Mensah" } },
              { classId: "classB", teacherId: "teacherT", dayOfWeek: 1, period: 2, venue: null, class: { name: "Class 8B" }, teacher: { name: "Mr. Mensah" } },
            ];
          }
          return [];
        }),
        create: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    await expect(
      generateBalancedTimetable(tx, { schoolId: "s1", actorId: "a1", replaceExisting: true, classIds: ["classA"] })
    ).rejects.toMatchObject({ code: "TIMETABLE_UNSATISFIABLE" });
    try {
      await generateBalancedTimetable(tx, { schoolId: "s1", actorId: "a1", replaceExisting: true, classIds: ["classA"] });
      expect.unreachable();
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("Mr. Mensah");
      expect(message).toContain("Class 8B");
    }
  });

  it("treats teacher unavailability as a hard constraint with a useful message", async () => {
    const tx = baseTx({
      schoolSettings: {
        findUnique: vi.fn().mockResolvedValue({
          ...mondayOnly,
          timetableConfig: { ...mondayOnly.timetableConfig, teacherUnavailability: { teacherT: ["1:1", "1:2"] } },
        }),
      },
    });
    await expect(
      generateBalancedTimetable(tx, { schoolId: "s1", actorId: "a1", replaceExisting: true, classIds: ["classA"] })
    ).rejects.toMatchObject({ code: "TIMETABLE_UNSATISFIABLE" });
    try {
      await generateBalancedTimetable(tx, { schoolId: "s1", actorId: "a1", replaceExisting: true, classIds: ["classA"] });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/unavailable/i);
    }
  });

  it("schedules configured double periods as consecutive slots", async () => {
    const created: Array<{ dayOfWeek: number; period: number }> = [];
    const tx = baseTx({
      schoolSettings: {
        findUnique: vi.fn().mockResolvedValue({
          ...mondayOnly,
          timetableConfig: { ...mondayOnly.timetableConfig, doublePeriodSubjects: { subMath: 1 } },
        }),
      },
      timetableSlot: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async (args: { data: { dayOfWeek: number; period: number } }) => {
          created.push({ dayOfWeek: args.data.dayOfWeek, period: args.data.period });
          return { id: `s${created.length}`, ...args.data };
        }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const result = await generateBalancedTimetable(tx, { schoolId: "s1", actorId: "a1", replaceExisting: true, classIds: ["classA"] });
    expect(result.scheduled).toBe(2);
    expect(result.pairedBlocks).toBe(1);
    const periods = created.filter((c) => c.dayOfWeek === created[0].dayOfWeek).map((c) => c.period).sort();
    expect(periods[1] - periods[0]).toBe(1);
  });
});

describe("timetable manual overrides", () => {
  const rawMocks = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    schoolSettings: { findUnique: vi.fn().mockResolvedValue(mondayOnly) },
  };
  it("rejects a move that would double-book the teacher", async () => {
    const tx = {
      ...rawMocks,
      timetableSlot: {
        findFirst: vi.fn().mockImplementation(async (args: { where: { id?: string; teacherId?: string } }) => {
          if (args.where.id === "slotA") return { id: "slotA", classId: "classA", teacherId: "teacherT", dayOfWeek: 1, period: 1, venue: null };
          if (args.where.teacherId === "teacherT") return { id: "other", classId: "classB" };
          return null;
        }),
      },
      schoolSettings: { findUnique: vi.fn().mockResolvedValue(mondayOnly) },
    } as unknown as TenantDb;
    await expect(moveTimetableSlot(tx, { schoolId: "s1", actorId: "a1", slotId: "slotA", dayOfWeek: 1, period: 2 })).rejects.toMatchObject({ code: "MOVE_CONFLICT" });
  });

  it("rejects a swap that introduces a conflict and explains why", async () => {
    const tx = {
      ...rawMocks,
      timetableSlot: {
        findFirst: vi.fn().mockImplementation(async (args: { where: { id?: string; teacherId?: string; classId?: string } }) => {
          if (args.where.id === "slotA") return { id: "slotA", classId: "classA", teacherId: "teacherT", dayOfWeek: 1, period: 1, venue: null };
          if (args.where.id === "slotB") return { id: "slotB", classId: "classB", teacherId: "teacherU", dayOfWeek: 2, period: 1, venue: null };
          if (args.where.teacherId === "teacherT") return { id: "clash" };
          return null;
        }),
      },
      schoolSettings: { findUnique: vi.fn().mockResolvedValue(mondayOnly) },
    } as unknown as TenantDb;
    await expect(swapTimetableSlots(tx, { schoolId: "s1", actorId: "a1", slotIdA: "slotA", slotIdB: "slotB" })).rejects.toMatchObject({ code: "SWAP_CONFLICT" });
  });
});

describe("report-card promotion cutoff (configurable, default preserves legacy 50%)", () => {
  it("keeps the legacy top-half behaviour at the default 50%", () => {
    expect(promotionForRule("overall_position", { overallPosition: 5, rankedCount: 10, cutoffPercent: 50, lines: [], passMark: 50 })).toBe("promoted");
    expect(promotionForRule("overall_position", { overallPosition: 6, rankedCount: 10, cutoffPercent: 50, lines: [], passMark: 50 })).toBe("not_promoted");
  });
  it("honours a custom cutoff", () => {
    expect(promotionForRule("overall_position", { overallPosition: 4, rankedCount: 10, cutoffPercent: 25, lines: [], passMark: 50 })).toBe("not_promoted");
    expect(promotionForRule("overall_position", { overallPosition: 3, rankedCount: 10, cutoffPercent: 25, lines: [], passMark: 50 })).toBe("promoted");
    expect(promotionForRule("overall_position", { overallPosition: 2, rankedCount: 10, cutoffPercent: 25, lines: [], passMark: 50 })).toBe("promoted");
  });
  it("falls back to percentile bands when position bands lack ranges", () => {
    const policy = { showOverallPosition: true, showSubjectPosition: true, positionScope: "class" as const, remarkSource: "position_band" as const, positionBandLabels: [{ label: "Top", remark: "Excellent" }, { label: "Rest", remark: "Keep trying" }], behaviorRatingFields: [], promotionRule: "manual" as const, positionPromotionCutoffPercent: 50 };
    expect(remarkForPosition(70, [], 2, 10, policy)).toBe("Excellent");
    expect(remarkForPosition(70, [], 8, 10, policy)).toBe("Keep trying");
  });
});

describe("report-card maker-checker gate (regression)", () => {
  it("still rejects self-approval after the consolidation", async () => {
    const tx = {
      reportCard: { findFirst: vi.fn().mockResolvedValue({ id: "rc", status: "submitted", submittedBy: "principal-1" }) },
      schoolSettings: { findUnique: vi.fn().mockResolvedValue({ notificationChannels: null }) },
    } as unknown as TenantDb;
    await expect(approveAndQueuePublicReportCard(tx, { schoolId: "s1", actorId: "principal-1", reportCardId: "rc", origin: "https://x.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
