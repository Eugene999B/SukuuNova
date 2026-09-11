import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { onboardStudent } from "../src/lib/student-onboarding-service";
import { createTenantFixture, rawDb, setRawTenant, type Fixture } from "./helpers";

describe("canonical learner onboarding", () => {
  let fixture: Fixture;
  const academicYearId = createId();
  const termId = createId();
  const classId = createId();

  beforeAll(async () => {
    fixture = await createTenantFixture();
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          schoolId: fixture.schoolId,
          name: `2026-${academicYearId.slice(0, 6)}`,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
        },
      });
      await tx.term.create({
        data: {
          id: termId,
          schoolId: fixture.schoolId,
          academicYearId,
          name: "Term 1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-04-30T00:00:00.000Z"),
        },
      });
      await tx.class.create({
        data: { id: classId, schoolId: fixture.schoolId, name: `Class ${classId.slice(0, 6)}`, level: "JHS 1" },
      });
    });
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("creates intake and draft placement without mutating the learner's live class", async () => {
    const result = await onboardStudent({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      name: "Canonical Learner",
      intakeAcademicYearId: academicYearId,
      admissionDate: new Date("2026-02-10T00:00:00.000Z"),
      entryType: "New enrollment",
      guardian: { name: "Canonical Guardian", phone: `024${Date.now().toString().slice(-7)}`, relationship: "Parent" },
      placement: { termId, classId },
      auditSource: "integrity_test",
    });

    expect(result.enrollmentId).toBeTruthy();
    expect(result.student.classId).toBeNull();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.findFirstOrThrow({ where: { id: result.student.id, schoolId: fixture.schoolId } });
      expect(student.classId).toBeNull();

      const intake = await tx.$queryRaw<Array<{ academicYearId: string; entryType: string }>>`
        SELECT "academicYearId","entryType" FROM "StudentAcademicIntake"
        WHERE "schoolId"=${fixture.schoolId} AND "studentId"=${result.student.id}
      `;
      expect(intake).toEqual([{ academicYearId, entryType: "New enrollment" }]);

      const enrollment = await tx.$queryRaw<Array<{ termId: string; classId: string; status: string; guardianVerified: boolean }>>`
        SELECT "termId","classId","status","guardianVerified" FROM "Enrollment"
        WHERE "schoolId"=${fixture.schoolId} AND "studentId"=${result.student.id}
      `;
      expect(enrollment).toEqual([{ termId, classId, status: "draft", guardianVerified: true }]);
    });
  });
});
