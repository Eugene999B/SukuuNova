import { randomInt } from "node:crypto";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { isTeachingRoleKey, roleKeyForName } from "@/lib/authorization";
import type { ColumnMapping, ImportKind } from "./contracts";
import { getSchoolImportBatch, validateSchoolImportBatch } from "./staging-service";

export const APPLY_ENABLED_IMPORT_KINDS = ["students", "guardians", "classes", "subjects"] as const satisfies readonly ImportKind[];
export type ApplyEnabledImportKind = (typeof APPLY_ENABLED_IMPORT_KINDS)[number];

type ApplyRow = {
  id: string;
  rowNumber: number;
  normalizedData: unknown;
  status: string;
  appliedEntityType: string | null;
  appliedEntityId: string | null;
};

type AppliedResult = { rowId: string; rowNumber: number; entityType: string; entityId: string };

function isApplyEnabled(kind: ImportKind): kind is ApplyEnabledImportKind {
  return (APPLY_ENABLED_IMPORT_KINDS as readonly string[]).includes(kind);
}

function data(value: unknown): Record<string, string | number | boolean | null> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string | number | boolean | null> : {};
}

function text(row: Record<string, string | number | boolean | null>, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function findClassByName(tx: TenantDb, name: string) {
  return tx.class.findMany({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true }, take: 2 });
}

async function findActiveTeachingUserByEmail(tx: TenantDb, email: string) {
  const users = await tx.user.findMany({
    where: { email: { equals: email, mode: "insensitive" }, status: "active" },
    select: { id: true, name: true, userRoles: { select: { role: { select: { key: true, name: true } } } } },
    take: 2,
  });
  if (users.length !== 1) return null;
  const user = users[0];
  const teaching = user.userRoles.some(({ role }) => isTeachingRoleKey(role.key?.trim() || roleKeyForName(role.name)));
  return teaching ? user : null;
}

async function nextAdmissionNumber(tx: TenantDb, used: Set<string>) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `SN-${year}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    if (used.has(candidate.toLowerCase())) continue;
    const exists = await tx.student.findFirst({ where: { admissionNo: candidate }, select: { id: true } });
    if (!exists) {
      used.add(candidate.toLowerCase());
      return candidate;
    }
  }
  throw new AppError("Could not generate a unique learner admission number for this batch.", 409, "IMPORT_ADMISSION_EXHAUSTED");
}

async function applyClasses(tx: TenantDb, schoolId: string, rows: ApplyRow[]): Promise<AppliedResult[]> {
  const results: AppliedResult[] = [];
  for (const source of rows) {
    const row = data(source.normalizedData);
    const name = text(row, "name");
    if (!name) throw new AppError(`Row ${source.rowNumber}: class name is missing after validation.`, 409, "IMPORT_STALE_VALIDATION");
    const existing = await findClassByName(tx, name);
    if (existing.length) throw new AppError(`Row ${source.rowNumber}: class ${name} now exists. Revalidate the batch.`, 409, "IMPORT_RACE_DUPLICATE");
    const teacherEmail = text(row, "classTeacherEmail");
    const teacher = teacherEmail ? await findActiveTeachingUserByEmail(tx, teacherEmail) : null;
    if (teacherEmail && !teacher) throw new AppError(`Row ${source.rowNumber}: class teacher ${teacherEmail} is not one active teaching account.`, 409, "IMPORT_TEACHER_INVALID");
    const created = await tx.class.create({ data: {
      schoolId,
      name,
      level: text(row, "level"),
      classTeacherId: teacher?.id ?? null,
    }, select: { id: true } });
    results.push({ rowId: source.id, rowNumber: source.rowNumber, entityType: "Class", entityId: created.id });
  }
  return results;
}

async function applySubjects(tx: TenantDb, schoolId: string, rows: ApplyRow[]): Promise<AppliedResult[]> {
  const results: AppliedResult[] = [];
  for (const source of rows) {
    const row = data(source.normalizedData);
    const name = text(row, "name");
    if (!name) throw new AppError(`Row ${source.rowNumber}: subject name is missing after validation.`, 409, "IMPORT_STALE_VALIDATION");
    const existing = await tx.subject.findMany({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true }, take: 1 });
    if (existing.length) throw new AppError(`Row ${source.rowNumber}: subject ${name} now exists. Revalidate the batch.`, 409, "IMPORT_RACE_DUPLICATE");
    const created = await tx.subject.create({ data: { schoolId, name }, select: { id: true } });
    results.push({ rowId: source.id, rowNumber: source.rowNumber, entityType: "Subject", entityId: created.id });
  }
  return results;
}

async function applyStudents(tx: TenantDb, schoolId: string, rows: ApplyRow[]): Promise<AppliedResult[]> {
  const results: AppliedResult[] = [];
  const existingAdmissions = await tx.student.findMany({ select: { admissionNo: true } });
  const usedAdmissions = new Set(existingAdmissions.map((item) => item.admissionNo.toLowerCase()));
  const houses = await tx.house.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const grouped = houses.length ? await tx.student.groupBy({ by: ["houseId"], where: { status: "active", houseId: { not: null } }, _count: { _all: true } }) : [];
  const houseCounts = new Map(houses.map((house) => [house.id, grouped.find((item) => item.houseId === house.id)?._count._all ?? 0]));

  for (const source of rows) {
    const row = data(source.normalizedData);
    const name = text(row, "name");
    if (!name) throw new AppError(`Row ${source.rowNumber}: learner name is missing after validation.`, 409, "IMPORT_STALE_VALIDATION");
    let admissionNo = text(row, "admissionNo");
    if (admissionNo) {
      if (usedAdmissions.has(admissionNo.toLowerCase())) throw new AppError(`Row ${source.rowNumber}: admission number ${admissionNo} now exists. Revalidate the batch.`, 409, "IMPORT_RACE_DUPLICATE");
      usedAdmissions.add(admissionNo.toLowerCase());
    } else {
      admissionNo = await nextAdmissionNumber(tx, usedAdmissions);
    }

    const className = text(row, "className");
    let classId: string | null = null;
    if (className) {
      const matches = await findClassByName(tx, className);
      if (matches.length !== 1) throw new AppError(`Row ${source.rowNumber}: class ${className} must resolve to exactly one class.`, 409, "IMPORT_CLASS_INVALID");
      classId = matches[0].id;
    }
    const house = houses.length
      ? [...houses].sort((a, b) => (houseCounts.get(a.id)! - houseCounts.get(b.id)!) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0]
      : null;
    const dob = text(row, "dob");
    const student = await tx.student.create({ data: {
      schoolId,
      name,
      admissionNo,
      dob: dob ? new Date(`${dob}T00:00:00.000Z`) : null,
      classId,
      houseId: house?.id ?? null,
      status: "active",
    }, select: { id: true } });
    if (house) houseCounts.set(house.id, (houseCounts.get(house.id) ?? 0) + 1);

    const guardianName = text(row, "guardianName");
    const guardianPhone = text(row, "guardianPhone");
    if (guardianName && guardianPhone) {
      const guardian = await tx.guardian.upsert({
        where: { schoolId_phone: { schoolId, phone: guardianPhone } },
        update: { name: guardianName },
        create: { schoolId, name: guardianName, phone: guardianPhone },
        select: { id: true },
      });
      await tx.studentGuardian.create({ data: {
        schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: text(row, "guardianRelationship") ?? "Parent",
        isPrimary: true,
      } });
    }
    results.push({ rowId: source.id, rowNumber: source.rowNumber, entityType: "Student", entityId: student.id });
  }
  return results;
}

async function applyGuardians(tx: TenantDb, schoolId: string, rows: ApplyRow[]): Promise<AppliedResult[]> {
  const results: AppliedResult[] = [];
  for (const source of rows) {
    const row = data(source.normalizedData);
    const name = text(row, "name");
    const phone = text(row, "phone");
    const email = text(row, "email");
    if (!name || (!phone && !email)) throw new AppError(`Row ${source.rowNumber}: guardian identity is incomplete after validation.`, 409, "IMPORT_STALE_VALIDATION");
    const duplicate = await tx.guardian.findFirst({ where: { OR: [
      ...(phone ? [{ phone }] : []),
      ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
    ] }, select: { id: true } });
    if (duplicate) throw new AppError(`Row ${source.rowNumber}: guardian contact now exists. Revalidate the batch.`, 409, "IMPORT_RACE_DUPLICATE");
    const guardian = await tx.guardian.create({ data: { schoolId, name, phone, email }, select: { id: true } });
    const admissionNo = text(row, "studentAdmissionNo");
    if (admissionNo) {
      const student = await tx.student.findFirst({ where: { admissionNo }, select: { id: true } });
      if (!student) throw new AppError(`Row ${source.rowNumber}: learner ${admissionNo} no longer exists.`, 409, "IMPORT_STUDENT_INVALID");
      await tx.studentGuardian.create({ data: {
        schoolId,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: text(row, "relationship") ?? "Guardian",
        isPrimary: row.isPrimary === true,
      } });
    }
    results.push({ rowId: source.id, rowNumber: source.rowNumber, entityType: "Guardian", entityId: guardian.id });
  }
  return results;
}

async function persistAppliedRows(tx: TenantDb, schoolId: string, batchId: string, results: AppliedResult[]) {
  const chunkSize = 300;
  for (let offset = 0; offset < results.length; offset += chunkSize) {
    const payload = results.slice(offset, offset + chunkSize);
    await tx.$executeRawUnsafe(
      `UPDATE "SchoolImportRow" r
       SET "status"='applied',"appliedEntityType"=item->>'entityType',"appliedEntityId"=item->>'entityId',"updatedAt"=CURRENT_TIMESTAMP
       FROM jsonb_array_elements($3::jsonb) AS item
       WHERE r."schoolId"=$1 AND r."batchId"=$2 AND r."id"=item->>'rowId'`,
      schoolId,
      batchId,
      JSON.stringify(payload),
    );
  }
}

export async function applySchoolImportBatch(tx: TenantDb, input: { schoolId: string; actorId: string; batchId: string }) {
  const initial = await getSchoolImportBatch(tx, input.schoolId, input.batchId);
  if (initial.batch.status === "applied") {
    return { batch: initial.batch, alreadyApplied: true, appliedRows: initial.rows.filter((row) => row.status === "applied").length };
  }
  if (!isApplyEnabled(initial.batch.kind)) {
    throw new AppError(`${initial.batch.kind} imports are staging-only until their dedicated production writer is certified.`, 409, "IMPORT_APPLY_NOT_CERTIFIED");
  }
  if (["applying", "cancelled", "failed"].includes(initial.batch.status)) {
    throw new AppError(`Import batch cannot be applied while ${initial.batch.status}.`, 409, "IMPORT_STATE_INVALID");
  }

  const revalidated = await validateSchoolImportBatch(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    batchId: input.batchId,
    columnMapping: initial.batch.columnMapping as ColumnMapping,
  });
  if (revalidated.batch.status !== "ready") {
    throw new AppError("Import changed since its last review. Resolve all validation and duplicate issues before applying.", 409, "IMPORT_NOT_READY");
  }

  const rows = await tx.$queryRawUnsafe<ApplyRow[]>(
    `SELECT "id","rowNumber","normalizedData","status","appliedEntityType","appliedEntityId"
     FROM "SchoolImportRow" WHERE "schoolId"=$1 AND "batchId"=$2 ORDER BY "rowNumber" ASC`,
    input.schoolId,
    input.batchId,
  );
  if (!rows.length || rows.some((row) => row.status !== "valid")) throw new AppError("Import rows are not all in a valid state.", 409, "IMPORT_NOT_READY");

  await tx.$executeRawUnsafe(
    `UPDATE "SchoolImportBatch" SET "status"='applying',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.batchId,
  );

  let results: AppliedResult[];
  if (revalidated.batch.kind === "classes") results = await applyClasses(tx, input.schoolId, rows);
  else if (revalidated.batch.kind === "subjects") results = await applySubjects(tx, input.schoolId, rows);
  else if (revalidated.batch.kind === "students") results = await applyStudents(tx, input.schoolId, rows);
  else results = await applyGuardians(tx, input.schoolId, rows);

  await persistAppliedRows(tx, input.schoolId, input.batchId, results);
  await tx.$executeRawUnsafe(
    `UPDATE "SchoolImportBatch"
     SET "status"='applied',"appliedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP,
         "summary"="summary" || $3::jsonb
     WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.batchId,
    JSON.stringify({ appliedRows: results.length, appliedKind: revalidated.batch.kind }),
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "school_import.applied",
    entityType: "SchoolImportBatch",
    entityId: input.batchId,
    after: {
      kind: revalidated.batch.kind,
      sourceSha256: revalidated.batch.sourceSha256,
      rowCount: results.length,
      entityTypes: [...new Set(results.map((result) => result.entityType))],
    },
  });
  const completed = await getSchoolImportBatch(tx, input.schoolId, input.batchId);
  return { batch: completed.batch, alreadyApplied: false, appliedRows: results.length };
}
