import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { getAttendanceCalendarState } from "../src/lib/attendance-service";
import { createTenantFixture } from "./helpers";

describe("attendance instructional calendar semantics", () => {
  it("opens attendance on a generated instructional make-up day even when it is outside the normal working week", async () => {
    const fixture = await createTenantFixture();

    await withTenant(fixture.schoolId, async (tx) => {
      const year = await tx.academicYear.create({
        data: {
          schoolId: fixture.schoolId,
          name: `Instructional Calendar ${createId()}`,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-07-31T00:00:00.000Z"),
        },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO "SchoolCalendarDay" ("id","schoolId","academicYearId","calendarDate","dayType","label","isInstructional","affectsAttendance","affectsTransport","source")
         VALUES ($1,$2,$3,$4::date,'makeup','Generated Saturday make-up',true,false,false,'generated')`,
        `attendance-generated-makeup-${createId()}`,
        fixture.schoolId,
        year.id,
        "2026-01-10",
      );

      const state = await getAttendanceCalendarState(
        tx,
        fixture.schoolId,
        new Date("2026-01-10T00:00:00.000Z"),
        [1, 2, 3, 4, 5],
      );

      expect(state).toMatchObject({
        calendarBlocked: false,
        schoolDay: true,
        source: "generated",
        dayType: "makeup",
      });
    });
  });
});
