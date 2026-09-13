import { describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import {
  attendanceSummary,
  getAttendanceCalendarState,
  isAttendanceBlocked,
  recordAttendance,
  resolveAttendanceRoster,
} from "../src/lib/attendance-service";
import { createTenantFixture } from "./helpers";

async function grantAttendanceTeacher(tx: Parameters<Parameters<typeof withTenant>[1]>[0], fixture: Awaited<ReturnType<typeof createTenantFixture>>) {
  const teacherRole = await tx.role.create({
    data: { schoolId: fixture.schoolId, name: `Attendance Teacher ${createId()}`, key: "teacher", isSystem: true },
  });
  await tx.userRole.create({ data: { schoolId: fixture.schoolId, userId: fixture.memberId, roleId: teacherRole.id } });
  for (const key of ["attendance:record", "attendance:record_assigned"]) {
    const permissionId = fixture.permissionIds.get(key);
    if (!permissionId) throw new Error(`${key} permission is missing from the default registry`);
    await tx.userPermissionOverride.create({
      data: { schoolId: fixture.schoolId, userId: fixture.memberId, permissionId, granted: true },
    });
  }
}

describe("attendance historical placement and calendar authority", () => {
  it("uses term Enrollment for historical rosters, summaries and assigned-teacher authorization", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await grantAttendanceTeacher(tx, fixture);
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: { expectedResumptionTime: "08:00" },
      });

      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Attendance History ${createId()}`,
          startDate: new Date("2025-09-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      });
      const historicalTerm = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Historical Term",
          startDate: new Date("2025-09-01T00:00:00.000Z"),
          endDate: new Date("2025-12-19T00:00:00.000Z"),
        },
      });
      await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Legacy Fallback Term",
          startDate: new Date("2026-01-12T00:00:00.000Z"),
          endDate: new Date("2026-04-02T00:00:00.000Z"),
        },
      });

      const historicalClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Historical Class ${createId()}`, classTeacherId: fixture.memberId },
      });
      const currentClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Current Class ${createId()}`, classTeacherId: fixture.ownerId },
      });
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `ATT-HIST-${createId()}`,
          name: "Historical Attendance Learner",
          classId: currentClass.id,
          status: "active",
        },
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO "Enrollment" ("id","schoolId","studentId","academicYearId","termId","classId","status","entryType","guardianVerified","documentsReady","feeReady","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed','returning',true,true,true,$7)`,
        `attendance-historical-${createId()}`,
        fixture.schoolId,
        student.id,
        year.id,
        historicalTerm.id,
        historicalClass.id,
        fixture.ownerId,
      );

      const historicalDay = new Date("2025-09-15T00:00:00.000Z");
      const historicalRoster = await resolveAttendanceRoster(tx, fixture.schoolId, historicalDay, [historicalClass.id, currentClass.id]);
      expect(historicalRoster.source).toBe("enrollment");
      expect(historicalRoster.termId).toBe(historicalTerm.id);
      expect(historicalRoster.rows).toEqual([{ studentId: student.id, classId: historicalClass.id }]);

      const fallbackRoster = await resolveAttendanceRoster(tx, fixture.schoolId, new Date("2026-02-02T00:00:00.000Z"), [historicalClass.id, currentClass.id]);
      expect(fallbackRoster.source).toBe("student");
      expect(fallbackRoster.rows).toEqual([{ studentId: student.id, classId: currentClass.id }]);

      await expect(recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.memberId,
        target: { studentId: student.id },
        type: "in",
        method: "manual",
        timestamp: new Date("2025-09-15T08:05:00.000Z"),
        periodId: "HISTORICAL",
      })).resolves.toMatchObject({ studentId: student.id, recordedBy: fixture.memberId });

      const historicalSummary = await attendanceSummary(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        day: historicalDay,
        classId: historicalClass.id,
        periodId: "HISTORICAL",
      });
      expect(historicalSummary).toMatchObject({ calendarBlocked: false, present: 1, absent: 0 });

      const wrongCurrentClassSummary = await attendanceSummary(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        day: historicalDay,
        classId: currentClass.id,
        periodId: "HISTORICAL",
      });
      expect(wrongCurrentClassSummary).toMatchObject({ calendarBlocked: false, present: 0, absent: 0 });
    });
  });

  it("uses SchoolCalendarDay for vacations and make-up days while preserving legacy event fallback", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: { expectedResumptionTime: "08:00" },
      });
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Attendance Calendar ${createId()}`,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      });
      await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Calendar Term",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-04-30T00:00:00.000Z"),
        },
      });
      const classroom = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Calendar Class ${createId()}`, classTeacherId: fixture.ownerId },
      });
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `ATT-CAL-${createId()}`,
          name: "Calendar Learner",
          classId: classroom.id,
          status: "active",
        },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO "SchoolCalendarDay" ("id","schoolId","academicYearId","calendarDate","dayType","isInstructional","affectsAttendance","affectsTransport","source")
         VALUES ($1,$2,$3,$4::date,'vacation',false,true,false,'generated')`,
        `attendance-vacation-${createId()}`,
        fixture.schoolId,
        year.id,
        "2026-01-06",
      );
      const vacationDay = new Date("2026-01-06T00:00:00.000Z");
      const vacationState = await getAttendanceCalendarState(tx, fixture.schoolId, vacationDay, [1, 2, 3, 4, 5]);
      expect(vacationState).toMatchObject({ calendarBlocked: true, schoolDay: false, source: "generated", dayType: "vacation" });
      await expect(recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId: student.id },
        type: "in",
        method: "manual",
        timestamp: new Date("2026-01-06T08:00:00.000Z"),
        periodId: "VACATION",
      })).rejects.toMatchObject({ code: "CALENDAR_BLOCKS_ATTENDANCE" });

      await tx.$executeRawUnsafe(
        `INSERT INTO "SchoolCalendarDay" ("id","schoolId","academicYearId","calendarDate","dayType","label","isInstructional","affectsAttendance","affectsTransport","source","overriddenBy")
         VALUES ($1,$2,$3,$4::date,'makeup','Saturday make-up school day',true,true,false,'manual',$5)`,
        `attendance-makeup-${createId()}`,
        fixture.schoolId,
        year.id,
        "2026-01-10",
        fixture.ownerId,
      );
      const makeupDay = new Date("2026-01-10T00:00:00.000Z");
      const makeupState = await getAttendanceCalendarState(tx, fixture.schoolId, makeupDay, [1, 2, 3, 4, 5]);
      expect(makeupState).toMatchObject({ calendarBlocked: false, schoolDay: true, source: "manual", dayType: "makeup" });
      await expect(recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId: student.id },
        type: "in",
        method: "manual",
        timestamp: new Date("2026-01-10T08:00:00.000Z"),
        periodId: "MAKEUP",
      })).resolves.toMatchObject({ studentId: student.id });

      await tx.calendarEvent.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          type: "closure",
          name: "Legacy closure",
          startDate: new Date("2026-01-07T00:00:00.000Z"),
          endDate: new Date("2026-01-07T23:59:59.000Z"),
          affectsAttendance: true,
          affectsTransport: false,
        },
      });
      const legacyDay = new Date("2026-01-07T00:00:00.000Z");
      const legacyState = await getAttendanceCalendarState(tx, fixture.schoolId, legacyDay, [1, 2, 3, 4, 5]);
      expect(legacyState).toMatchObject({ calendarBlocked: true, schoolDay: false, source: "legacy_event", dayType: "closure" });
      await expect(isAttendanceBlocked(tx, fixture.schoolId, legacyDay)).resolves.toBe(true);
    });
  });
});