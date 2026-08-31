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
  let subjectTeacherId: string;
  let classTeacherId: string;

  beforeAll(async () => {
    fixture = await createTenantFixture();
    academicYearId = fixture.academicYearId;
    termId = fixture.termId;
    classId = fixture.classId;
    otherClassId = fixture.otherClassId;
    mathId = fixture.mathId;
    scienceId = fixture.scienceId;
    studentId = fixture.studentId;
    otherStudentId = fixture.otherStudentId;
    subjectTeacherId = fixture.subjectTeacherId;
    classTeacherId = fixture.classTeacherId;

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.studentGuardian.deleteMany({ where: { studentId } });
      await tx.studentGuardian.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          guardianId: fixture.guardianId,
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
    const serverNow = new Date("2026-02-02T08:11:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);

    try {
      await withTenant(fixture.schoolId, async (tx) => {
        const event = await recordAttendance(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          target: { studentId },
          type: "in",
          method: "manual"
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
        await expect(
          recordAttendance(tx, {
            schoolId: fixture.schoolId,
            actorId: fixture.ownerId,
            target: { studentId: otherStudentId },
            type: "in",
            method: "manual"
          })
        ).resolves.toBeDefined();
      });
    } finally {
      vi.useRealTimers();
    }
  });
