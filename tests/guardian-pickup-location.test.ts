import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { setGuardianPickupLocation } from "../src/lib/novacore/guardian-pickup-location-service";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

describe("guardian pickup location", () => {
  it("lets a linked guardian set an immediately active point and safely replace it", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, name: "Family transport learner", admissionNo: `GPL-${createId()}` } });
      const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Family transport guardian", userId: fixture.memberId } });
      await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent", isPrimary: true } });
      const routeId = createId();
      await tx.$executeRawUnsafe(`INSERT INTO "P3BusRoute" ("id","schoolId","name","code") VALUES ($1,$2,'Direct Family Route',$3)`, routeId, fixture.schoolId, `DFR-${createId()}`);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3StudentTransportAssignment" ("id","schoolId","studentId","routeId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy") VALUES ($1,$2,$3,$4,'active',true,true,$5,$6)`,
        createId(), fixture.schoolId, student.id, routeId, new Date(Date.now() - 60_000), fixture.ownerId,
      );

      const first = await setGuardianPickupLocation(tx, {
        schoolId: fixture.schoolId,
        guardianId: guardian.id,
        guardianUserId: fixture.memberId,
        studentId: student.id,
        direction: "morning",
        latitude: 6.68848,
        longitude: -1.62443,
        label: "First family point",
      });
      expect(first.status).toBe("approved");
      expect(first.active).toBe(true);

      const second = await setGuardianPickupLocation(tx, {
        schoolId: fixture.schoolId,
        guardianId: guardian.id,
        guardianUserId: fixture.memberId,
        studentId: student.id,
        direction: "morning",
        latitude: 6.68901,
        longitude: -1.62392,
        label: "Changed family point",
      });
      expect(second.status).toBe("approved");

      const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string; label: string | null; effectiveTo: Date | null }>>(
        `SELECT "id","status","label","effectiveTo" FROM "P3PickupPoint" WHERE "schoolId"=$1 AND "guardianId"=$2 AND "studentId"=$3 AND "direction"='morning' ORDER BY "requestedAt" ASC`,
        fixture.schoolId, guardian.id, student.id,
      );
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === first.id)?.status).toBe("superseded");
      expect(rows.find((row) => row.id === first.id)?.effectiveTo).not.toBeNull();
      expect(rows.find((row) => row.id === second.id)?.status).toBe("approved");
      expect(rows.find((row) => row.id === second.id)?.label).toBe("Changed family point");
    });
  });

  it("never lets a guardian set a point for an unlinked learner", async () => {
    const fixture = await createTenantFixture();
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, name: "Unlinked learner", admissionNo: `GPU-${createId()}` } });
      const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Unlinked guardian", userId: fixture.memberId } });
      await expect(setGuardianPickupLocation(tx, {
        schoolId: fixture.schoolId,
        guardianId: guardian.id,
        guardianUserId: fixture.memberId,
        studentId: student.id,
        direction: "morning",
        latitude: 6.68848,
        longitude: -1.62443,
      })).rejects.toMatchObject({ status: 403 });
    });
  });
});
