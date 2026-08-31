import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { recordAttendance } from "../src/lib/attendance-service";
import { createTenantFixture } from "./helpers";

describe("attendance period identity", () => {
  it("keeps separate attendance records for separate periods on the same date", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: {
          expectedResumptionTime: "08:00",
          attendanceGraceMinutes: 10,
          timezone: "Africa/Accra"
        }
      });

      const schoolClass = await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Period Test Class " + fixture.schoolId }
      });
      const student = await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "PERIOD-" + fixture.schoolId,
          name: "Period Test Student",
          classId: schoolClass.id
        }
      });

      await recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId: student.id },
        type: "in",
        method: "manual",
        periodId: "MORNING"
      });

      await recordAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        target: { studentId: student.id },
        type: "in",
        method: "manual",
        periodId: "AFTERNOON"
      });

      const records = await tx.$queryRaw<Array<{ periodId: string; version: number }>>`
        SELECT "periodId", "version"
        FROM "AttendanceRecord"
        WHERE "schoolId" = ${fixture.schoolId}
          AND "studentId" = ${student.id}
        ORDER BY "periodId"
      `;

      expect(records).toHaveLength(2);
      expect(records.map((row) => row.periodId)).toEqual(["AFTERNOON", "MORNING"]);
      expect(records.every((row) => row.version >= 1)).toBe(true);
    });
  });
});
