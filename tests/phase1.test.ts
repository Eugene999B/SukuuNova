import { beforeAll, describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import {
  attendanceSummary,
  recordAttendance
} from "../src/lib/attendance-service";
import { enterScore } from "../src/lib/gradebook-service";
import {
  approveReportCard,
  submitReportCard
} from "../src/lib/report-card-service";
import { visibleStudents } from "../src/lib/sis-service";
import { enqueueSms } from "../src/lib/sms-outbox";
import { createTenantFixture, type Fixture } from "./helpers";

describe("Phase 1 MVP security and workflow gates", () => {
  let fixture: Fixture;
  let academicYearId: string;
  let termId: string;
  let classId: string;
  let otherClassId: string;
  let mathId: string;
  let scienceId: string;
  let studentId: string;
  let otherStudentId: string;
  let teacherId: string;
  let subjectTeacherId: string;
  let parentId: string;

  beforeAll(async () => {
    fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: {
          expectedResumptionTime: "08:00",
          attendanceGraceMinutes: 10,
          timezone: "Africa/Accra"
        }
      });
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Phase 1 Test Year",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z")
        }
      });
      academicYearId = year.id;
      const term = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: year.id,
          name: "Term 1",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-04-30T00:00:00.000Z")
        }
      });
      termId = term.id;
      teacherId = (await tx.user.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Assigned Teacher",
          email: "teacher-" + fixture.schoolId + "@test.invalid",
          passwordHash: "test-only"
        }
      })).id;
      subjectTeacherId = (await tx.user.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Assigned Subject Teacher",
          email: "subject-teacher-" + fixture.schoolId + "@test.invalid",
          passwordHash: "test-only"
        }
      })).id;
      parentId = (await tx.user.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Linked Parent",
          email: "parent-" + fixture.schoolId + "@test.invalid",
          phone: "+233200000001",
          passwordHash: "test-only"
        }
      })).id;
      for (const [userId, permission] of [
        [subjectTeacherId, "scores:write:assigned"],
        [teacherId, "report_cards:submit"],
        [parentId, "parents:read_linked"]
      ] as const) {
        await tx.userPermissionOverride.create({
          data: {
            schoolId: fixture.schoolId,
            userId,
            permissionId: fixture.permissionIds.get(permission)!,
            granted: true
          }
        });
      }
      const schoolClass = await tx.class.create({
        data: {
          schoolId: fixture.schoolId,
          name: "Primary 6 " + fixture.schoolId,
          classTeacherId: teacherId
        }
      });
      classId = schoolClass.id;
      otherClassId = (await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "JHS 1 " + fixture.schoolId }
      })).id;
      mathId = (await tx.subject.create({
        data: { schoolId: fixture.schoolId, name: "Mathematics " + fixture.schoolId }
      })).id;
      scienceId = (await tx.subject.create({
        data: { schoolId: fixture.schoolId, name: "Science " + fixture.schoolId }
      })).id;
      studentId = (await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "P1-" + fixture.schoolId,
          name: "Linked Child",
          classId
        }
      })).id;
      otherStudentId = (await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "P2-" + fixture.schoolId,
          name: "Other Child",
          classId: otherClassId
        }
      })).id;
      const guardian = await tx.guardian.create({
        data: {
          schoolId: fixture.schoolId,
          userId: parentId,
          name: "Linked Parent",
          phone: "+233200000001"
        }
      });
      await tx.studentGuardian.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          guardianId: guardian.id,
          relationship: "Parent",
          isPrimary: true
        }
      });
      await tx.classSubjectTeacher.create({
        data: {
          schoolId: fixture.schoolId,
          classId,
          subjectId: mathId,
          teacherId: subjectTeacherId
        }
      });
    });
  });

  it("marks post-grace arrival late and suppresses attendance on a holiday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-02T08:11:00.000Z"));

    try {
      await withTenant(fixture.schoolId, async (tx) => {
        const event = await recordAttendance(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          target: { studentId },
          type: "in",
          method: "manual",
          timestamp: new Date("2000-01-01T00:00:00.000Z")
        });
        expect(event.isLate).toBe(true);

        const holiday = new Date("2026-02-03T00:00:00.000Z");
        await tx.calendarEvent.create({
          data: {
            schoolId: fixture.schoolId,
            academicYearId,
            type: "holiday",
            name: "Test holiday",
            startDate: holiday,
            endDate: holiday,
            affectsAttendance: true
          }
        });

        vi.setSystemTime(new Date("2026-02-03T08:30:00.000Z"));
        await expect(
          recordAttendance(tx, {
            schoolId: fixture.schoolId,
            actorId: fixture.ownerId,
            target: { studentId },
            type: "in",
            method: "manual",
            timestamp: new Date("1999-01-01T00:00:00.000Z")
          })
        ).rejects.toMatchObject({ code: "CALENDAR_BLOCKS_ATTENDANCE" });
        await expect(
          attendanceSummary(tx, { actorId: fixture.ownerId, day: holiday, classId })
        ).resolves.toEqual({ calendarBlocked: true, present: 0, late: 0, absent: 0 });
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 403 when a teacher writes outside an assigned subject", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const assessment = await tx.assessment.create({
        data: {
          schoolId: fixture.schoolId,
          termId,
          classId,
          subjectId: scienceId,
          name: "Unassigned Science Test",
          type: "ca",
          weight: 100,
          maxScore: 100
        }
      });
      await expect(
        enterScore(tx, {
          schoolId: fixture.schoolId,
          actorId: subjectTeacherId,
          studentId,
          assessmentId: assessment.id,
          value: 80
        })
      ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    });
  });

  it("enforces class-teacher submission and a distinct approver", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const report = await tx.reportCard.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          termId,
          pdfData: Buffer.from("phase-1-test-pdf")
        }
      });
      await expect(
        submitReportCard(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          reportCardId: report.id
        })
      ).rejects.toMatchObject({ status: 403 });

      const submitted = await submitReportCard(tx, {
        schoolId: fixture.schoolId,
        actorId: teacherId,
        reportCardId: report.id
      });
      expect(submitted.status).toBe("submitted");

      await expect(
        approveReportCard(tx, {
          schoolId: fixture.schoolId,
          actorId: teacherId,
          reportCardId: report.id
        })
      ).rejects.toMatchObject({ status: 403 });

      const approved = await approveReportCard(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        reportCardId: report.id
      });
      expect(approved.status).toBe("approved");
      expect(approved.approvedBy).toBe(fixture.ownerId);
    });
  });

  it("limits a parent to linked children only", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const rows = await visibleStudents(tx, parentId);
      expect(rows.map((row) => row.id)).toEqual([studentId]);
      expect(rows.some((row) => row.id === otherStudentId)).toBe(false);
    });
  });

  it("sends SMS synchronously without requiring a worker", async () => {
    const sender = async () => undefined;
    await withTenant(fixture.schoolId, async (tx) => {
      const messages = await enqueueSms(tx, {
        schoolId: fixture.schoolId,
        recipientType: "guardian",
        recipientId: parentId,
        recipientPhone: "+233200000001",
        body: "Phase 1 synchronous SMS proof"
      }, { sms: sender });
      expect(messages[0].status).toBe("sent");
    });
  });

  it("keeps new SIS records isolated by tenant RLS", async () => {
    const other = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      expect(await tx.student.findUnique({ where: { id: otherStudentId } })).not.toBeNull();
      expect(
        await tx.student.findFirst({ where: { admissionNo: "missing-from-this-tenant" } })
      ).toBeNull();
    });
    await withTenant(other.schoolId, async (tx) => {
      expect(await tx.student.findUnique({ where: { id: studentId } })).toBeNull();
    });
  });
});
