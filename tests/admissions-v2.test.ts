import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { canTransitionAdmission } from "../src/lib/admissions-v2";
import { createTenantFixture, rawDb, setRawTenant, type Fixture } from "./helpers";

describe("Admissions V2 lifecycle", () => {
  let fixture: Fixture;
  const applicationId = createId();
  const classId = createId();
  const yearId = createId();
  const termId = createId();

  beforeAll(async () => {
    fixture = await createTenantFixture();
    await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      await tx.academicYear.create({ data: { id: yearId, schoolId: fixture.schoolId, name: `Admissions ${yearId.slice(0, 5)}`, startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z") } });
      await tx.term.create({ data: { id: termId, schoolId: fixture.schoolId, academicYearId: yearId, name: "Entry Term", startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2026-04-30T00:00:00.000Z") } });
      await tx.class.create({ data: { id: classId, schoolId: fixture.schoolId, name: "Admissions Class", level: "JHS 1" } });
      await tx.$executeRaw`
        INSERT INTO "AdmissionApplication"
          ("id","schoolId","reference","studentName","guardianName","guardianPhone","intendedClassId","intendedClassName","academicYearId","termId","admissionDate","status","createdBy")
        VALUES
          (${applicationId},${fixture.schoolId},${`APP-TEST-${applicationId.slice(0, 6)}`},'Admissions Learner','Admissions Guardian','0240000000',${classId},'JHS 1 · Admissions Class',${yearId},${termId},${new Date("2026-02-02T00:00:00.000Z")},'submitted',${fixture.ownerId})
      `;
    });
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("permits only the controlled application progression", () => {
    expect(canTransitionAdmission("draft", "submitted")).toBe(true);
    expect(canTransitionAdmission("submitted", "offered")).toBe(true);
    expect(canTransitionAdmission("offered", "accepted")).toBe(true);
    expect(canTransitionAdmission("accepted", "enrolled")).toBe(true);
    expect(canTransitionAdmission("draft", "enrolled")).toBe(false);
    expect(canTransitionAdmission("enrolled", "submitted")).toBe(false);
    expect(canTransitionAdmission("declined", "offered")).toBe(false);
  });

  it("does not allow an application to claim enrolment without a linked student", async () => {
    await expect(rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, fixture.schoolId);
      await tx.$executeRaw`UPDATE "AdmissionApplication" SET "status"='enrolled' WHERE "id"=${applicationId} AND "schoolId"=${fixture.schoolId}`;
    })).rejects.toThrow();
  });

  it("keeps applications isolated to the active school tenant", async () => {
    const other = await createTenantFixture();
    const visible = await rawDb.$transaction(async (tx) => {
      await setRawTenant(tx, other.schoolId);
      return tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "AdmissionApplication" WHERE "id"=${applicationId}`;
    });
    expect(visible).toHaveLength(0);
  });
});
