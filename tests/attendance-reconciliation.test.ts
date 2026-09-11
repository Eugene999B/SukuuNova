import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

describe("attendance event/register reconciliation", () => {
  it("derives one period register from the event stream and escalates conflicting evidence", async () => {
    const fixture = await createTenantFixture();
    const day = new Date("2026-09-11T00:00:00.000Z");

    await withTenant(fixture.schoolId, async (tx) => {
      const schoolClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: `Attendance Class ${createId()}` },
      });
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: `AR-${createId()}`,
          name: "Attendance Reconciliation Learner",
          status: "active",
          classId: schoolClass.id,
        },
      });

      const absent = await tx.attendanceEvent.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          type: "absent",
          method: "manual",
          timestamp: new Date("2026-09-11T08:00:00.000Z"),
          attendanceDate: day,
          periodId: "P1",
          recordedBy: fixture.ownerId,
        },
      });

      let records = await tx.attendanceRecord.findMany({
        where: { schoolId: fixture.schoolId, studentId: student.id, attendanceDate: day },
        orderBy: { periodId: "asc" },
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ periodId: "P1", status: "ABSENT", classId: schoolClass.id, source: "MANUAL" });
      expect(records[0].eventIds).toEqual([absent.id]);

      const present = await tx.attendanceEvent.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          type: "in",
          method: "qr",
          timestamp: new Date("2026-09-11T08:10:00.000Z"),
          attendanceDate: day,
          periodId: "P1",
          recordedBy: fixture.ownerId,
        },
      });

      const periodTwo = await tx.attendanceEvent.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          type: "in",
          method: "manual",
          timestamp: new Date("2026-09-11T09:00:00.000Z"),
          attendanceDate: day,
          periodId: "P2",
          recordedBy: fixture.ownerId,
        },
      });

      const excused = await tx.attendanceEvent.create({
        data: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          type: "excused",
          method: "school_register",
          timestamp: new Date("2026-09-11T10:00:00.000Z"),
          attendanceDate: day,
          periodId: "P3",
          recordedBy: fixture.ownerId,
        },
      });

      records = await tx.attendanceRecord.findMany({
        where: { schoolId: fixture.schoolId, studentId: student.id, attendanceDate: day },
        orderBy: { periodId: "asc" },
      });
      expect(records).toHaveLength(3);

      const p1 = records.find((row) => row.periodId === "P1");
      const p2 = records.find((row) => row.periodId === "P2");
      const p3 = records.find((row) => row.periodId === "P3");
      expect(p1).toMatchObject({ status: "PENDING_REVIEW", classId: schoolClass.id });
      expect(p1?.eventIds).toEqual([absent.id, present.id]);
      expect(p2).toMatchObject({ status: "PRESENT", source: "MANUAL", classId: schoolClass.id });
      expect(p2?.eventIds).toEqual([periodTwo.id]);
      expect(p3).toMatchObject({ status: "EXCUSED", source: "MANUAL", classId: schoolClass.id });
      expect(p3?.eventIds).toEqual([excused.id]);

      const statusProducingEvents = await tx.attendanceEvent.count({
        where: {
          schoolId: fixture.schoolId,
          studentId: student.id,
          attendanceDate: day,
          type: { in: ["absent", "late", "in", "excused"] },
        },
      });
      const linkedEventIds = records.flatMap((row) => Array.isArray(row.eventIds) ? row.eventIds.map(String) : []);
      expect(new Set(linkedEventIds).size).toBe(statusProducingEvents);
      expect(linkedEventIds).toEqual(expect.arrayContaining([absent.id, present.id, periodTwo.id, excused.id]));
    });
  });
});
