import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { recordAttendance, resolveAttendanceClassScope } from "../src/lib/attendance-service";
import { createTenantFixture } from "./helpers";

async function grantAssignedAttendance(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  fixture: Awaited<ReturnType<typeof createTenantFixture>>,
) {
  for (const key of ["attendance:record", "attendance:record_assigned"]) {
    const permissionId = fixture.permissionIds.get(key);
    if (!permissionId) throw new Error(`${key} permission is missing from the default registry`);
    await tx.userPermissionOverride.create({
      data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: true },
    });
  }
}

describe("attendance academic-year class-teacher scope", () => {
  it("uses ClassSectionStaffAssignment instead of the legacy Class.classTeacherId when an annual section exists", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await grantAssignedAttendance(tx, fixture);
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: { expectedResumptionTime: "08:00" },
      });

      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Attendance Scope ${createId()}`,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Attendance Scope Term",
          startDate: new Date("2026-01-12T00:00:00.000Z"),
          endDate: new Date("2026-04-02T00:00:00.000Z"),
        },
      });

      const annualTeacherClass = await tx.class.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Annual Teacher Class ${createId()}`,
          classTeacherId: fixture.ownerId,
        },
      });
      const legacyOnlyTeacherClass = await tx.class.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Legacy Teacher Class ${createId()}`,
          classTeacherId: fixture.memberId,
        },
      });

      const annualStudent = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `ATT-ANNUAL-${createId()}`,
          name: "Annual Scope Learner",
          classId: annualTeacherClass.id,
          status: "active",
        },
      });
      const legacyStudent = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `ATT-LEGACY-${createId()}`,
          name: "Legacy Scope Learner",
          classId: legacyOnlyTeacherClass.id,
          status: "active",
        },
      });

      for (const [studentId, classId] of [
        [annualStudent.id, annualTeacherClass.id],
        [legacyStudent.id, legacyOnlyTeacherClass.id],
      ] as const) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
          `attendance-scope-enrollment-${createId()}`,
          fixture.schoolId,
          studentId,
          year.id,
          term.id,
          classId,
          fixture.ownerId,
        );
      }

      const frameworkId = `attendance-framework-${createId()}`;
      const gradeId = `attendance-grade-${createId()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "AcademicFramework" ("id","schoolId","name","status","isDefault","createdBy")
         VALUES ($1,$2,$3,'active',false,$4)`,
        frameworkId,
        fixture.schoolId,
        `Attendance Framework ${createId()}`,
        fixture.ownerId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "GradeLevel" ("id","schoolId","frameworkId","key","name","phase","sequence","kind","isTerminal","pathwayRequired","isActive")
         VALUES ($1,$2,$3,$4,'Attendance Grade','basic',1,'grade',false,false,true)`,
        gradeId,
        fixture.schoolId,
        frameworkId,
        `attendance-grade-${createId()}`,
      );

      const annualSectionId = `attendance-section-${createId()}`;
      const legacySectionId = `attendance-section-${createId()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "ClassSection" ("id","schoolId","academicYearId","gradeLevelId","classId","sectionCode","displayName","isActive")
         VALUES ($1,$2,$3,$4,$5,'A',$6,true),($7,$2,$3,$4,$8,'B',$9,true)`,
        annualSectionId,
        fixture.schoolId,
        year.id,
        gradeId,
        annualTeacherClass.id,
        annualTeacherClass.name,
        legacySectionId,
        legacyOnlyTeacherClass.id,
        legacyOnlyTeacherClass.name,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ClassSectionStaffAssignment" ("id","schoolId","academicYearId","classSectionId","userId","responsibility","isPrimary","status","startedAt")
         VALUES ($1,$2,$3,$4,$5,'class_teacher',true,'active',$6),($7,$2,$3,$8,$9,'class_teacher',true,'active',$6)`,
        `attendance-assignment-${createId()}`,
        fixture.schoolId,
        year.id,
        annualSectionId,
        fixture.memberId,
        year.startDate,
        `attendance-assignment-${createId()}`,
        legacySectionId,
        fixture.ownerId,
      );

      const day = new Date("2026-02-02T00:00:00.000Z");
      const scope = await resolveAttendanceClassScope(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        day,
        canRecordAll: false,
      });
      expect(scope).toEqual([
        expect.objectContaining({ id: annualTeacherClass.id, scopeSource: "annual_class_section" }),
      ]);

      await expect(recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        target: { studentId: annualStudent.id },
        type: "in",
        method: "manual",
        timestamp: new Date("2026-02-02T08:05:00.000Z"),
        periodId: "ANNUAL_SCOPE",
      })).resolves.toMatchObject({ studentId: annualStudent.id, recordedBy: fixture.memberId });

      await expect(recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        target: { studentId: legacyStudent.id },
        type: "in",
        method: "manual",
        timestamp: new Date("2026-02-02T08:06:00.000Z"),
        periodId: "ANNUAL_SCOPE",
      })).rejects.toMatchObject({ code: "CLASS_TEACHER_SCOPE_REQUIRED" });
    });
  });
});
