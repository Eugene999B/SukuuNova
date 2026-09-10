import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { reviewPickupPoint } from "../src/lib/novacore/family-transport-service";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

describe("transport pickup approval safety", () => {
  it("closes an overlapping approved temporary pickup before approving its replacement", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({
        data: { schoolId: fixture.schoolId, name: "Transport learner", admissionNo: `TP-${createId()}` },
      });
      const guardian = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Transport guardian", userId: fixture.memberId },
      });
      const routeId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3BusRoute" ("id","schoolId","name","code") VALUES ($1,$2,$3,$4)`,
        routeId, fixture.schoolId, "Morning Route", `MR-${createId()}`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3StudentTransportAssignment" ("id","schoolId","studentId","routeId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy")
         VALUES ($1,$2,$3,$4,'active',true,true,$5,$6)`,
        createId(), fixture.schoolId, student.id, routeId, new Date(Date.now() - 86_400_000), fixture.ownerId,
      );

      const replacementStart = new Date(Date.now() + 60_000);
      const previousId = createId();
      const pendingId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3PickupPoint" ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","effectiveFrom","effectiveTo","approvedBy","approvedAt")
         VALUES ($1,$2,$3,$4,$5,'morning','Old temporary point',5.6037,-0.1870,'approved',true,$6,$7,$8,CURRENT_TIMESTAMP)`,
        previousId,
        fixture.schoolId,
        guardian.id,
        student.id,
        routeId,
        new Date(Date.now() - 3_600_000),
        new Date(Date.now() + 3_600_000),
        fixture.ownerId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3PickupPoint" ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","effectiveFrom")
         VALUES ($1,$2,$3,$4,$5,'morning','Replacement point',5.6040,-0.1865,'pending',false,$6)`,
        pendingId, fixture.schoolId, guardian.id, student.id, routeId, replacementStart,
      );

      const result = await reviewPickupPoint(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        pickupPointId: pendingId,
        decision: "approve",
        note: "Verified replacement pickup.",
      });
      expect(result.status).toBe("approved");

      const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string; effectiveTo: Date | null }>>(
        `SELECT "id","status","effectiveTo" FROM "P3PickupPoint" WHERE "schoolId"=$1 AND "id" IN ($2,$3) ORDER BY "id"`,
        fixture.schoolId, previousId, pendingId,
      );
      const previous = rows.find((row) => row.id === previousId);
      const replacement = rows.find((row) => row.id === pendingId);
      expect(previous?.effectiveTo?.getTime()).toBe(replacementStart.getTime());
      expect(replacement?.status).toBe("approved");
    });
  });

  it("rejects a pending pickup after the learner moves to a different route", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({
        data: { schoolId: fixture.schoolId, name: "Reassigned learner", admissionNo: `TR-${createId()}` },
      });
      const guardian = await tx.guardian.create({
        data: { schoolId: fixture.schoolId, name: "Reassigned guardian", userId: fixture.memberId },
      });
      const oldRouteId = createId();
      const newRouteId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3BusRoute" ("id","schoolId","name","code") VALUES ($1,$2,'Old Route',$3),($4,$2,'New Route',$5)`,
        oldRouteId, fixture.schoolId, `OR-${createId()}`, newRouteId, `NR-${createId()}`,
      );
      const oldAssignmentId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3StudentTransportAssignment" ("id","schoolId","studentId","routeId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy")
         VALUES ($1,$2,$3,$4,'active',true,true,$5,$6)`,
        oldAssignmentId, fixture.schoolId, student.id, oldRouteId, new Date(Date.now() - 86_400_000), fixture.ownerId,
      );
      const pendingId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3PickupPoint" ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary")
         VALUES ($1,$2,$3,$4,$5,'afternoon','Old route request',5.6037,-0.1870,'pending',false)`,
        pendingId, fixture.schoolId, guardian.id, student.id, oldRouteId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "P3StudentTransportAssignment" SET "status"='inactive',"effectiveTo"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId, oldAssignmentId, new Date(Date.now() - 1_000),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3StudentTransportAssignment" ("id","schoolId","studentId","routeId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy")
         VALUES ($1,$2,$3,$4,'active',true,true,$5,$6)`,
        createId(), fixture.schoolId, student.id, newRouteId, new Date(Date.now() - 500), fixture.ownerId,
      );

      await expect(reviewPickupPoint(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        pickupPointId: pendingId,
        decision: "approve",
      })).rejects.toMatchObject({ code: "PICKUP_REQUEST_STALE_ASSIGNMENT" });

      const rows = await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "P3PickupPoint" WHERE "schoolId"=$1 AND "id"=$2`, fixture.schoolId, pendingId,
      );
      expect(rows[0]?.status).toBe("pending");
    });
  });
});
