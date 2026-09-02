import { describe, expect, it } from "vitest";
import { recordStaffSelfAttendance } from "../src/lib/attendance-service";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

describe("staff attendance state machine", () => {
  it("requires IN before OUT and closes the day after OUT", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: { expectedResumptionTime: "08:00", attendanceGraceMinutes: 10, timezone: "Africa/Accra" }
      });

      await expect(
        recordStaffSelfAttendance(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          type: "out",
          verification: "test"
        })
      ).rejects.toMatchObject({ code: "INVALID_CHECKOUT_STATE", status: 409 });

      await recordStaffSelfAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        type: "in",
        verification: "test"
      });

      await recordStaffSelfAttendance(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        type: "out",
        verification: "test"
      });

      await expect(
        recordStaffSelfAttendance(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          type: "out",
          verification: "test"
        })
      ).rejects.toMatchObject({ code: "INVALID_CHECKOUT_STATE", status: 409 });

      await expect(
        recordStaffSelfAttendance(tx, {
          schoolId: fixture.schoolId,
          actorId: fixture.ownerId,
          type: "in",
          verification: "test"
        })
      ).rejects.toMatchObject({ code: "ATTENDANCE_CLOSED", status: 409 });
    });
  });
});
