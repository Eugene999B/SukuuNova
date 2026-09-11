import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { onboardStudentInTransaction } from "../src/lib/student-onboarding-service";
import { addApprovedPickup, attemptPickup } from "../src/lib/pickup-service";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

describe("Release D system integrity", () => {
  it("creates intake and draft placement without mutating the learner's live class", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `2026/2027 ${createId()}`,
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2027-07-31T00:00:00.000Z"),
        },
      });
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Term 1",
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-12-15T00:00:00.000Z"),
        },
      });
      const schoolClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Primary 4 ${createId()}`, level: "Primary 4" },
      });

      const result = await onboardStudentInTransaction(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        name: "Canonical Learner",
        admissionNo: `D-${createId()}`,
        intakeAcademicYearId: year.id,
        admissionDate: new Date("2026-09-03T00:00:00.000Z"),
        entryType: "New enrollment",
        guardian: { name: "Canonical Guardian", phone: `024${Date.now()}`, relationship: "Parent" },
        placement: { termId: term.id, classId: schoolClass.id },
      });

      const student = await tx.student.findUniqueOrThrow({ where: { id: result.student.id } });
      expect(student.classId).toBeNull();

      const intake = await tx.$queryRawUnsafe<Array<{ academicYearId: string }>>(
        `SELECT "academicYearId" FROM "StudentAcademicIntake" WHERE "schoolId"=$1 AND "studentId"=$2`,
        fixture.schoolId,
        student.id,
      );
      expect(intake).toEqual([{ academicYearId: year.id }]);

      const enrollment = await tx.$queryRawUnsafe<Array<{ termId: string; classId: string; status: string }>>(
        `SELECT "termId","classId","status" FROM "Enrollment" WHERE "schoolId"=$1 AND "studentId"=$2`,
        fixture.schoolId,
        student.id,
      );
      expect(enrollment).toEqual([{ termId: term.id, classId: schoolClass.id, status: "draft" }]);
    });
  });

  it("enforces one guardian portal persona per user and one primary guardian per learner", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({
        data: { schoolId: fixture.schoolId, name: "Family Learner", admissionNo: `FG-${createId()}` },
      });
      const first = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Primary Guardian", phone: `020${Date.now()}`, userId: fixture.memberId },
      });
      const second = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Secondary Guardian", phone: `021${Date.now()}` },
      });

      await expect(tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Ambiguous Guardian", phone: `022${Date.now()}`, userId: fixture.memberId },
      })).rejects.toBeTruthy();

      await tx.studentGuardian.create({
        data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: first.id, relationship: "Parent", isPrimary: true },
      });
      await expect(tx.studentGuardian.create({
        data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: second.id, relationship: "Guardian", isPrimary: true },
      })).rejects.toBeTruthy();
    });
  });

  it("rejects direct timetable teacher and venue collisions", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const role = await tx.role.create({
        data: { schoolId: fixture.schoolId, name: `Teacher ${createId()}`, key: "teacher" },
      });
      const teacherA = await tx.user.create({
        data: { schoolId: fixture.schoolId, name: "Teacher A", email: `${createId()}@test.invalid`, passwordHash: "fixture" },
      });
      const teacherB = await tx.user.create({
        data: { schoolId: fixture.schoolId, name: "Teacher B", email: `${createId()}@test.invalid`, passwordHash: "fixture" },
      });
      await tx.userRole.createMany({
        data: [
          { schoolId: fixture.schoolId, userId: teacherA.id, roleId: role.id },
          { schoolId: fixture.schoolId, userId: teacherB.id, roleId: role.id },
        ],
      });
      const classA = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `Class A ${createId()}` } });
      const classB = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `Class B ${createId()}` } });
      const classC = await tx.class.create({ data: { schoolId: fixture.schoolId, name: `Class C ${createId()}` } });
      const subjectA = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: `Subject A ${createId()}` } });
      const subjectB = await tx.subject.create({ data: { schoolId: fixture.schoolId, name: `Subject B ${createId()}` } });

      await tx.timetableSlot.create({
        data: { schoolId: fixture.schoolId, classId: classA.id, subjectId: subjectA.id, teacherId: teacherA.id, dayOfWeek: 1, period: 1, venue: "Lab 1" },
      });

      await expect(tx.timetableSlot.create({
        data: { schoolId: fixture.schoolId, classId: classB.id, subjectId: subjectB.id, teacherId: teacherA.id, dayOfWeek: 1, period: 1, venue: "Lab 2" },
      })).rejects.toBeTruthy();

      await expect(tx.timetableSlot.create({
        data: { schoolId: fixture.schoolId, classId: classC.id, subjectId: subjectB.id, teacherId: teacherB.id, dayOfWeek: 1, period: 1, venue: " lab 1 " },
      })).rejects.toBeTruthy();
    });
  });

  it("requires an active learner and allows only one completed pickup per school-local day", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const guardian = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Pickup Guardian", phone: `023${Date.now()}` },
      });
      const activeStudent = await tx.student.create({
        data: { schoolId: fixture.schoolId, name: "Pickup Learner", admissionNo: `PU-${createId()}`, status: "active" },
      });
      const inactiveStudent = await tx.student.create({
        data: { schoolId: fixture.schoolId, name: "Inactive Learner", admissionNo: `PI-${createId()}`, status: "inactive" },
      });

      await addApprovedPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: activeStudent.id,
        guardianId: guardian.id,
      });
      const first = await attemptPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: activeStudent.id,
        guardianId: guardian.id,
      });
      expect(first.status).toBe("completed");

      await expect(attemptPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: activeStudent.id,
        guardianId: guardian.id,
      })).rejects.toMatchObject({ code: "PICKUP_ALREADY_COMPLETED" });

      await expect(attemptPickup(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        studentId: inactiveStudent.id,
        guardianId: guardian.id,
      })).rejects.toMatchObject({ code: "PICKUP_STUDENT_NOT_ACTIVE" });

      await expect(tx.pickupEvent.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: activeStudent.id,
          collectedByGuardianId: guardian.id,
          wasPreApproved: true,
        },
      })).rejects.toBeTruthy();
    });
  });
});
