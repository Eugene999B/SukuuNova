import { afterEach, describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { runRiskScanForSchool } from "../src/lib/phase4-ops-service";

afterEach(() => {
  vi.useRealTimers();
});

describe("deterministic risk signal engine", () => {
  it("uses 7-day/30-day attendance and current-vs-previous-term evidence with expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));

    const fixture = await createTenantFixture();
    let studentId = "";

    await withTenant(fixture.schoolId, async (tx) => {
      const yearPrevious = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "2025/2026",
          startDate: new Date("2025-09-01T00:00:00.000Z"),
          endDate: new Date("2026-06-30T00:00:00.000Z"),
        },
      });
      const previousTerm = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: yearPrevious.id,
          name: "Term 3",
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: new Date("2026-06-30T00:00:00.000Z"),
        },
      });
      const yearCurrent = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: "2026/2027",
          startDate: new Date("2026-08-01T00:00:00.000Z"),
          endDate: new Date("2027-07-31T00:00:00.000Z"),
        },
      });
      const currentTerm = await tx.term.create({
        data: {
          schoolId: fixture.schoolId,
          academicYearId: yearCurrent.id,
          name: "Term 1",
          startDate: new Date("2026-08-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
        },
      });
      const klass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Risk Test Class" },
      });
      const subject = await tx.subject.create({
        data: { schoolId: fixture.schoolId, name: "Risk Test Mathematics" },
      });
      studentId = (
        await tx.student.create({
          data: {
            schoolId: fixture.schoolId,
            admissionNo: `RISK-${fixture.schoolId}`,
            name: "Risk Test Student",
            classId: klass.id,
          },
        })
      ).id;

      const previousAssessment = await tx.assessment.create({
        data: {
          schoolId: fixture.schoolId,
          termId: previousTerm.id,
          classId: klass.id,
          subjectId: subject.id,
          name: "Previous exam",
          type: "exam",
          weight: 100,
          maxScore: 100,
        },
      });
      const currentAssessment = await tx.assessment.create({
        data: {
          schoolId: fixture.schoolId,
          termId: currentTerm.id,
          classId: klass.id,
          subjectId: subject.id,
          name: "Current exam",
          type: "exam",
          weight: 100,
          maxScore: 100,
        },
      });
      await tx.score.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          subjectId: subject.id,
          assessmentId: previousAssessment.id,
          value: 90,
          enteredBy: fixture.ownerId,
        },
      });
      await tx.score.create({
        data: {
          schoolId: fixture.schoolId,
          studentId,
          subjectId: subject.id,
          assessmentId: currentAssessment.id,
          value: 65,
          enteredBy: fixture.ownerId,
        },
      });

      const attendanceDates = [
        "2026-08-27",
        "2026-08-28",
        "2026-08-31",
      ];
      for (const date of attendanceDates) {
        await tx.attendanceEvent.create({
          data: {
            schoolId: fixture.schoolId,
            studentId,
            type: "in",
            method: "manual",
            timestamp: new Date(`${date}T08:00:00.000Z`),
            attendanceDate: new Date(`${date}T00:00:00.000Z`),
          },
        });
      }
    });

    const result = await runRiskScanForSchool(fixture.schoolId);
    expect(result.created).toBeGreaterThanOrEqual(2);

    await withTenant(fixture.schoolId, async (tx) => {
      const flags = await tx.$queryRaw<
        Array<{
          reason: string;
          severity: string;
          detail: Record<string, unknown>;
          expiresAt: Date | null;
          reviewStatus: string;
        }>
      >`
        SELECT "reason","severity","detail","expiresAt","reviewStatus"
        FROM "StudentRiskFlag"
        WHERE "schoolId"=${fixture.schoolId} AND "studentId"=${studentId}
        ORDER BY "reason"
      `;

      expect(flags.map((row) => row.reason)).toEqual(
        expect.arrayContaining(["ATTENDANCE_CONCERN", "ACADEMIC_DECLINE"])
      );

      const attendance = flags.find((row) => row.reason === "ATTENDANCE_CONCERN")!;
      const detail = attendance.detail as {
        window7: { expectedSessions: number; presentSessions: number };
        window30: { expectedSessions: number; presentSessions: number };
      };
      expect(detail.window7.expectedSessions).toBe(5);
      expect(detail.window7.presentSessions).toBe(3);
      expect(detail.window30.expectedSessions).toBe(22);
      expect(detail.window30.presentSessions).toBe(3);
      expect(attendance.expiresAt).toBeInstanceOf(Date);
      expect(attendance.reviewStatus).toBe("OPEN");
      expect(flags.find((row) => row.reason === "ACADEMIC_DECLINE")?.severity).toBe("HIGH");
    });
  });
});
