import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { saveGuardianPickupPoint } from "../src/lib/novacore/guardian-pickup-direct-service";
import { createTenantFixture, rawDb, setRawTenant } from "./helpers";

describe("guardian pickup self-service", () => {
  it("activates a linked family's new pickup immediately and supersedes the old point", async () => {
    const fixture = await createTenantFixture();

    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, name: "Pickup learner", admissionNo: `PD-${createId()}` } });
      const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Pickup guardian", userId: fixture.memberId } });
      await tx.studentGuardian.create({ data: { schoolId: fixture.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent" } });

      const routeId = createId();
      await tx.$executeRawUnsafe(`INSERT INTO "P3BusRoute" ("id","schoolId","name","code") VALUES ($1,$2,'Family Route',$3)`, routeId, fixture.schoolId, `FR-${createId()}`);
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3StudentTransportAssignment" ("id","schoolId","studentId","routeId","status","morningEnabled","afternoonEnabled","effectiveFrom","createdBy") VALUES ($1,$2,$3,$4,'active',true,true,$5,$6)`,
        createId(), fixture.schoolId, student.id, routeId, new Date(Date.now() - 86_400_000), fixture.ownerId,
      );

      const oldId = createId();
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3PickupPoint" ("id","schoolId","guardianId","studentId","routeId","direction","label","latitude","longitude","status","isTemporary","approvedBy","approvedAt","effectiveFrom") VALUES ($1,$2,$3,$4,$5,'morning','Old home',6.6800,-1.6200,'approved',false,$6,CURRENT_TIMESTAMP,$7)`,
        oldId, fixture.schoolId, guardian.id, student.id, routeId, fixture.ownerId, new Date(Date.now() - 3_600_000),
      );

      const result = await saveGuardianPickupPoint(tx, {
        schoolId: fixture.schoolId,
        guardianId: guardian.id,
        guardianUserId: fixture.memberId,
        studentId: student.id,
        direction: "morning",
        latitude: 6.6885,
        longitude: -1.6244,
        label: "New family gate",
      });

      expect(result.status).toBe("approved");
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string; label: string | null; approvedBy: string | null; effectiveTo: Date | null }>>(
        `SELECT "id","status","label","approvedBy","effectiveTo" FROM "P3PickupPoint" WHERE "schoolId"=$1 AND "studentId"=$2 AND "direction"='morning' ORDER BY "requestedAt" DESC`,
        fixture.schoolId, student.id,
      );
      const current = rows.find((row) => row.id === result.id);
      const old = rows.find((row) => row.id === oldId);
      expect(current).toMatchObject({ status: "approved", label: "New family gate", approvedBy: fixture.memberId });
      expect(old?.status).toBe("superseded");
      expect(old?.effectiveTo).not.toBeNull();
    });
  });

  it("cannot update a pickup point for an unrelated learner", async () => {
    const fixture = await createTenantFixture();
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      const student = await tx.student.create({ data: { schoolId: fixture.schoolId, name: "Unrelated learner", admissionNo: `UP-${createId()}` } });
      const guardian = await tx.guardian.create({ data: { schoolId: fixture.schoolId, name: "Unrelated guardian", userId: fixture.memberId } });
      await expect(saveGuardianPickupPoint(tx, {
        schoolId: fixture.schoolId,
        guardianId: guardian.id,
        guardianUserId: fixture.memberId,
        studentId: student.id,
        direction: "morning",
        latitude: 6.6885,
        longitude: -1.6244,
      })).rejects.toMatchObject({ code: "GUARDIAN_STUDENT_FORBIDDEN" });
    });
  });
});
