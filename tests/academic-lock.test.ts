import { describe, expect, it, vi } from "vitest";

const { requirePermission } = vi.hoisted(() => ({
  requirePermission: vi.fn()
}));

vi.mock("../src/lib/rbac", () => ({
  requirePermission,
  hasPermission: vi.fn().mockResolvedValue(true)
}));
vi.mock("../src/lib/audit", () => ({ appendSchoolAudit: vi.fn().mockResolvedValue(undefined) }));

import { createAssessment, enterScore } from "../src/lib/gradebook-service";

type AcademicLockTx = Parameters<typeof createAssessment>[0] & Parameters<typeof enterScore>[0];

describe("academic term locking", () => {
  it("rejects assessment creation when the term is locked", async () => {
    const tx = {
      term: { findFirst: vi.fn().mockResolvedValue({ id: "term-1", isLocked: true, name: "Term 1" }) },
    } as unknown as AcademicLockTx;

    await expect(createAssessment(tx, {
      schoolId: "school-1", actorId: "teacher-1", termId: "term-1", classId: "class-1", subjectId: "subject-1",
      name: "Midterm", type: "test", weight: 20, maxScore: 100,
    })).rejects.toMatchObject({ code: "TERM_LOCKED" });
    expect(requirePermission).not.toHaveBeenCalled();
  });

  it("rejects score entry when the assessment belongs to a locked term", async () => {
    const tx = {
      assessment: { findUnique: vi.fn().mockResolvedValue({ id: "assessment-1", classId: "class-1", subjectId: "subject-1", termId: "term-1", maxScore: 100 }) },
      term: { findFirst: vi.fn().mockResolvedValue({ id: "term-1", isLocked: true, name: "Term 1" }) },
    } as unknown as AcademicLockTx;

    await expect(enterScore(tx, {
      schoolId: "school-1", actorId: "teacher-1", studentId: "student-1", assessmentId: "assessment-1", value: 70,
    })).rejects.toMatchObject({ code: "TERM_LOCKED" });
    expect(requirePermission).not.toHaveBeenCalled();
  });
});
