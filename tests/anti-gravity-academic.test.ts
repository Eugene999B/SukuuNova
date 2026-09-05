import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/rbac", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("../src/lib/audit", () => ({
  appendSchoolAudit: vi.fn().mockResolvedValue(undefined),
}));

import { calculateSubjectResult, normalizeAssessmentType } from "../src/lib/assessment-engine";
import { rankTotals, RANK_EPSILON } from "../src/lib/report-card-ranking";
import { MAX_ACTIVE_GUARDIAN_PORTALS_PER_STUDENT } from "../src/lib/guardian-service";
import { getAcademicEngineConfig } from "../src/lib/academic-engine";
import type { TenantDb } from "../src/lib/db";

describe("anti-gravity academic invariants", () => {
  it("normalizes CA aliases so Classwork counts in reports", () => {
    expect(normalizeAssessmentType("CA")).toBe("classwork");
    expect(normalizeAssessmentType("Class Test")).toBe("classtest");
    const rules = { categories: [{ name: "ca", weight: 40 }, { name: "exam", weight: 60 }], rounding: "nearest" as const, missingScorePolicy: "blank" as const, allowTeacherOverride: false };
    const withAlias = calculateSubjectResult(
      [
        { id: "a1", name: "CA 1", type: "CA", maxScore: 20, weight: 40, score: 16 },
        { id: "a2", name: "Exam", type: "exam", maxScore: 100, weight: 60, score: 70 },
      ],
      rules
    );
    const withoutAlias = calculateSubjectResult(
      [
        { id: "a1", name: "CA 1", type: "classwork", maxScore: 20, weight: 40, score: 16 },
        { id: "a2", name: "Exam", type: "exam", maxScore: 100, weight: 60, score: 70 },
      ],
      rules
    );
    expect(withAlias.total).toBe(withoutAlias.total);
    expect(withAlias.total).not.toBeNull();
  });

  it("ranks with epsilon and stable name-then-id tiebreak", () => {
    expect(RANK_EPSILON).toBeGreaterThan(0);
    const positions = rankTotals([
      { id: "c", name: "C", total: 89.9 },
      { id: "b", name: "B", total: 90.004 },
      { id: "a", name: "A", total: 90.004 },
    ]);
    expect(positions.get("a")).toBe(1);
    expect(positions.get("b")).toBe(1);
    expect(positions.get("c")).toBe(3);
  });

  it("caps active guardian portals at two", () => {
    expect(MAX_ACTIVE_GUARDIAN_PORTALS_PER_STUDENT).toBe(2);
  });

  it("normalizes partial timetable config instead of crashing", async () => {
    const tx = {
      schoolSettings: {
        findUnique: vi.fn().mockResolvedValue({ timetableConfig: { periodMinutes: 45 }, assessmentConfig: null, reportCardConfig: null }),
      },
    } as unknown as TenantDb;
    const config = await getAcademicEngineConfig(tx, "school-1");
    expect(Array.isArray(config.timetable.days)).toBe(true);
    expect(config.timetable.days.length).toBeGreaterThan(0);
    expect(Array.isArray(config.timetable.breaks)).toBe(true);
    expect(config.timetable.periodMinutes).toBe(45);
  });

  it("rejects scores above max and negative scores", async () => {
    const { enterScore } = await import("../src/lib/gradebook-service");
    const tx = {
      assessment: { findFirst: vi.fn().mockResolvedValue({ id: "a", classId: "c", subjectId: "s", termId: "t", maxScore: 20 }) },
      term: { findFirst: vi.fn().mockResolvedValue({ id: "t", isLocked: false, name: "T1" }) },
      reportCard: { findFirst: vi.fn().mockResolvedValue(null) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "stu", classId: "c" }) },
      score: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: "sc" }) },
    } as unknown as TenantDb;
    await expect(enterScore(tx, { schoolId: "s1", actorId: "t1", studentId: "stu", assessmentId: "a", value: 25 })).rejects.toMatchObject({ code: "INVALID_SCORE" });
    await expect(enterScore(tx, { schoolId: "s1", actorId: "t1", studentId: "stu", assessmentId: "a", value: -1 })).rejects.toMatchObject({ code: "INVALID_SCORE" });
  });

  it("blocks score entry when the report is finalized", async () => {
    const { enterScore } = await import("../src/lib/gradebook-service");
    const tx = {
      assessment: { findFirst: vi.fn().mockResolvedValue({ id: "a", classId: "c", subjectId: "s", termId: "t", maxScore: 20 }) },
      term: { findFirst: vi.fn().mockResolvedValue({ id: "t", isLocked: false, name: "T1" }) },
      reportCard: { findFirst: vi.fn().mockResolvedValue({ id: "rc", status: "approved" }) },
      student: { findFirst: vi.fn().mockResolvedValue({ id: "stu", classId: "c" }) },
      score: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    } as unknown as TenantDb;
    await expect(enterScore(tx, { schoolId: "s1", actorId: "t1", studentId: "stu", assessmentId: "a", value: 10 })).rejects.toMatchObject({ code: "REPORT_FINALIZED" });
  });
});
