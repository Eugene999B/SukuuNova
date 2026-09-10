import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { withTenant } from "../src/lib/db";
import { createCsvImportBatch, validateSchoolImportBatch } from "../src/lib/import/staging-service";
import { applySchoolImportBatch } from "../src/lib/import/apply-service";
import { suggestColumnMapping } from "../src/lib/import/contracts";
import { parseCsvImport } from "../src/lib/import/csv";
import { assertRlsTestRoleIsSafe, createTenantFixture, rawDb } from "./helpers";

beforeAll(async () => {
  await assertRlsTestRoleIsSafe();
});

afterAll(async () => {
  await rawDb.$disconnect();
});

async function stageAndValidate(input: {
  schoolId: string;
  actorId: string;
  kind: "classes" | "subjects" | "students" | "guardians";
  csv: string;
  fileName: string;
}) {
  const parsed = parseCsvImport(input.csv);
  const mapping = suggestColumnMapping(input.kind, parsed.normalizedHeaders);
  return withTenant(input.schoolId, async (tx) => {
    const batch = await createCsvImportBatch(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      kind: input.kind,
      sourceFileName: input.fileName,
      csvText: input.csv,
    });
    const validated = await validateSchoolImportBatch(tx, {
      schoolId: input.schoolId,
      actorId: input.actorId,
      batchId: batch.id,
      columnMapping: mapping,
    });
    return validated.batch;
  });
}

describe("school import transactional apply", () => {
  it("applies a validated class batch and records row/entity linkage", async () => {
    const fixture = await createTenantFixture();
    const suffix = createId().slice(0, 7);
    const classOne = `Basic 7 ${suffix}`;
    const classTwo = `Basic 8 ${suffix}`;
    const batch = await stageAndValidate({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      kind: "classes",
      fileName: "classes.csv",
      csv: `Class Name,Level\n${classOne},Basic 7\n${classTwo},Basic 8\n`,
    });
    expect(batch.status).toBe("ready");

    const applied = await withTenant(fixture.schoolId, (tx) => applySchoolImportBatch(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      batchId: batch.id,
    }));
    expect(applied).toMatchObject({ alreadyApplied: false, appliedRows: 2 });
    expect(applied.batch.status).toBe("applied");

    const evidence = await withTenant(fixture.schoolId, async (tx) => {
      const classes = await tx.class.findMany({ where: { name: { in: [classOne, classTwo] } }, select: { id: true, name: true } });
      const rows = await tx.$queryRawUnsafe<Array<{ status: string; appliedEntityType: string | null; appliedEntityId: string | null }>>(
        `SELECT "status","appliedEntityType","appliedEntityId" FROM "SchoolImportRow" WHERE "schoolId"=$1 AND "batchId"=$2 ORDER BY "rowNumber"`,
        fixture.schoolId,
        batch.id,
      );
      return { classes, rows };
    });
    expect(evidence.classes).toHaveLength(2);
    expect(evidence.rows).toHaveLength(2);
    expect(evidence.rows.every((row) => row.status === "applied" && row.appliedEntityType === "Class" && Boolean(row.appliedEntityId))).toBe(true);
  });

  it("treats a second apply of the same subject batch as an idempotent retry", async () => {
    const fixture = await createTenantFixture();
    const subjectName = `Robotics ${createId().slice(0, 7)}`;
    const batch = await stageAndValidate({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      kind: "subjects",
      fileName: "subjects.csv",
      csv: `Subject Name\n${subjectName}\n`,
    });

    const first = await withTenant(fixture.schoolId, (tx) => applySchoolImportBatch(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      batchId: batch.id,
    }));
    const second = await withTenant(fixture.schoolId, (tx) => applySchoolImportBatch(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      batchId: batch.id,
    }));
    expect(first.alreadyApplied).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.appliedRows).toBe(1);

    const count = await withTenant(fixture.schoolId, (tx) => tx.subject.count({ where: { name: subjectName } }));
    expect(count).toBe(1);
  });

  it("rolls the entire batch back when a later class row fails at apply time", async () => {
    const fixture = await createTenantFixture();
    const suffix = createId().slice(0, 7);
    const firstName = `Rollback One ${suffix}`;
    const secondName = `Rollback Two ${suffix}`;
    const missingTeacher = `missing-${suffix}@test.invalid`;
    const batch = await stageAndValidate({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      kind: "classes",
      fileName: "rollback-classes.csv",
      csv: `Class Name,Level,Class Teacher Email\n${firstName},Basic 4,\n${secondName},Basic 5,${missingTeacher}\n`,
    });
    expect(batch.status).toBe("ready");

    await expect(withTenant(fixture.schoolId, (tx) => applySchoolImportBatch(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      batchId: batch.id,
    }))).rejects.toThrow(/class teacher/i);

    const state = await withTenant(fixture.schoolId, async (tx) => {
      const count = await tx.class.count({ where: { name: { in: [firstName, secondName] } } });
      const batches = await tx.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "SchoolImportBatch" WHERE "schoolId"=$1 AND "id"=$2`,
        fixture.schoolId,
        batch.id,
      );
      const rows = await tx.$queryRawUnsafe<Array<{ status: string; appliedEntityId: string | null }>>(
        `SELECT "status","appliedEntityId" FROM "SchoolImportRow" WHERE "schoolId"=$1 AND "batchId"=$2 ORDER BY "rowNumber"`,
        fixture.schoolId,
        batch.id,
      );
      return { count, batchStatus: batches[0]?.status, rows };
    });
    expect(state.count).toBe(0);
    expect(state.batchStatus).toBe("ready");
    expect(state.rows.every((row) => row.status === "valid" && row.appliedEntityId == null)).toBe(true);
  });

  it("keeps import staging batches invisible across school tenants", async () => {
    const schoolA = await createTenantFixture();
    const schoolB = await createTenantFixture();
    const batch = await stageAndValidate({
      schoolId: schoolA.schoolId,
      actorId: schoolA.ownerId,
      kind: "subjects",
      fileName: "tenant-subject.csv",
      csv: `Subject Name\nTenant Science ${createId().slice(0, 7)}\n`,
    });

    const visibleToOwner = await withTenant(schoolA.schoolId, (tx) => tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "SchoolImportBatch" WHERE "id"=$1`,
      batch.id,
    ));
    const visibleToOther = await withTenant(schoolB.schoolId, (tx) => tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "SchoolImportBatch" WHERE "id"=$1`,
      batch.id,
    ));
    expect(visibleToOwner).toEqual([{ id: batch.id }]);
    expect(visibleToOther).toEqual([]);
  });

  it("imports a learner with its class and primary guardian without exposing a separate partial state", async () => {
    const fixture = await createTenantFixture();
    const suffix = createId().slice(0, 7);
    const className = `Learner Class ${suffix}`;
    await withTenant(fixture.schoolId, (tx) => tx.class.create({ data: { schoolId: fixture.schoolId, name: className, level: "Basic 3" } }));
    const admissionNo = `IMP-${suffix}`;
    const guardianPhone = `024${String(randomIntForTest(suffix)).padStart(7, "0").slice(0, 7)}`;
    const batch = await stageAndValidate({
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      kind: "students",
      fileName: "learners.csv",
      csv: `Student Name,Admission No,Class,Parent Name,Parent Phone,Relationship\nImported Learner ${suffix},${admissionNo},${className},Imported Parent ${suffix},${guardianPhone},Parent\n`,
    });
    expect(batch.status).toBe("ready");

    await withTenant(fixture.schoolId, (tx) => applySchoolImportBatch(tx, {
      schoolId: fixture.schoolId,
      actorId: fixture.ownerId,
      batchId: batch.id,
    }));
    const result = await withTenant(fixture.schoolId, async (tx) => {
      const student = await tx.student.findFirst({ where: { admissionNo }, select: { id: true, class: { select: { name: true } }, guardians: { select: { isPrimary: true, relationship: true, guardian: { select: { name: true, phone: true } } } } } });
      return student;
    });
    expect(result?.class?.name).toBe(className);
    expect(result?.guardians).toHaveLength(1);
    expect(result?.guardians[0]).toMatchObject({ isPrimary: true, relationship: "Parent", guardian: { phone: guardianPhone } });
  });
});

function randomIntForTest(seed: string) {
  let value = 0;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) % 10_000_000;
  return value;
}
