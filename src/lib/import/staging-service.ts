import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { appendSchoolAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import type { PermissionKey } from "@/lib/default-rbac";
import { parseCsvImport, type ParsedCsv } from "./csv";
import {
  importContract,
  suggestColumnMapping,
  validateColumnMapping,
  type ColumnMapping,
  type ImportKind,
} from "./contracts";
import { validateMappedImportRows, type ImportRowIssue, type ValidatedImportRow } from "./row-validation";

export type SchoolImportBatchStatus = "uploaded" | "mapped" | "validated" | "ready" | "applying" | "applied" | "failed" | "cancelled";

export type SchoolImportBatch = {
  id: string;
  schoolId: string;
  kind: ImportKind;
  status: SchoolImportBatchStatus;
  sourceFileName: string;
  sourceSha256: string;
  originalHeaders: string[];
  normalizedHeaders: string[];
  columnMapping: ColumnMapping;
  rowCount: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  createdBy: string;
  summary: Record<string, unknown>;
  validatedAt: Date | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StagingRow = {
  id: string;
  rowNumber: number;
  rawData: unknown;
};

const PERMISSION_BY_KIND: Record<ImportKind, PermissionKey> = {
  students: "students:write",
  guardians: "students:write",
  staff: "users:write",
  classes: "classes:manage",
  subjects: "classes:manage",
  opening_balances: "finance:write",
};

export function requiredPermissionForImport(kind: ImportKind): PermissionKey {
  return PERMISSION_BY_KIND[kind];
}

function record(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "string" ? item : item == null ? "" : String(item)]));
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapping(value: unknown): ColumnMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "string" ? item : null]));
}

function batchFromRow(row: Record<string, unknown>): SchoolImportBatch {
  return {
    id: String(row.id),
    schoolId: String(row.schoolId),
    kind: String(row.kind) as ImportKind,
    status: String(row.status) as SchoolImportBatchStatus,
    sourceFileName: String(row.sourceFileName),
    sourceSha256: String(row.sourceSha256),
    originalHeaders: stringArray(row.originalHeaders),
    normalizedHeaders: stringArray(row.normalizedHeaders),
    columnMapping: mapping(row.columnMapping),
    rowCount: Number(row.rowCount ?? 0),
    validRows: Number(row.validRows ?? 0),
    invalidRows: Number(row.invalidRows ?? 0),
    duplicateRows: Number(row.duplicateRows ?? 0),
    createdBy: String(row.createdBy),
    summary: object(row.summary),
    validatedAt: row.validatedAt instanceof Date ? row.validatedAt : row.validatedAt ? new Date(String(row.validatedAt)) : null,
    appliedAt: row.appliedAt instanceof Date ? row.appliedAt : row.appliedAt ? new Date(String(row.appliedAt)) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(String(row.updatedAt)),
  };
}

async function readBatch(tx: TenantDb, schoolId: string, batchId: string) {
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "SchoolImportBatch" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    batchId,
  );
  return rows[0] ? batchFromRow(rows[0]) : null;
}

async function insertRawRows(tx: TenantDb, schoolId: string, batchId: string, parsed: ParsedCsv) {
  const chunkSize = 500;
  for (let offset = 0; offset < parsed.rows.length; offset += chunkSize) {
    const payload = parsed.rows.slice(offset, offset + chunkSize).map((row) => ({ id: createId(), rowNumber: row.rowNumber, rawData: row.record }));
    await tx.$executeRawUnsafe(
      `INSERT INTO "SchoolImportRow" ("id","schoolId","batchId","rowNumber","status","rawData")
       SELECT item->>'id',$1,$2,(item->>'rowNumber')::int,'pending',item->'rawData'
       FROM jsonb_array_elements($3::jsonb) AS item`,
      schoolId,
      batchId,
      JSON.stringify(payload),
    );
  }
}

export async function createCsvImportBatch(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  kind: ImportKind;
  sourceFileName: string;
  csvText: string;
}) {
  const contract = importContract(input.kind);
  if (!contract) throw new AppError("Unsupported import type.", 400, "IMPORT_KIND_INVALID");
  const sourceFileName = input.sourceFileName.trim().slice(0, 240);
  if (!sourceFileName.toLowerCase().endsWith(".csv")) throw new AppError("Upload a CSV file for this import stage.", 400, "IMPORT_FILE_TYPE");
  const parsed = parseCsvImport(input.csvText);
  if (!parsed.rows.length) throw new AppError("The CSV contains headers but no data rows.", 400, "IMPORT_NO_ROWS");
  const suggestedMapping = suggestColumnMapping(input.kind, parsed.normalizedHeaders);
  const sourceSha256 = createHash("sha256").update(input.csvText, "utf8").digest("hex");
  const batchId = createId();

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-import:${input.schoolId}`}))`;
  await tx.$executeRawUnsafe(
    `INSERT INTO "SchoolImportBatch"
      ("id","schoolId","kind","status","sourceFileName","sourceSha256","originalHeaders","normalizedHeaders","columnMapping","rowCount","createdBy","summary")
     VALUES ($1,$2,$3,'uploaded',$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb)`,
    batchId,
    input.schoolId,
    input.kind,
    sourceFileName,
    sourceSha256,
    JSON.stringify(parsed.headers),
    JSON.stringify(parsed.normalizedHeaders),
    JSON.stringify(suggestedMapping),
    parsed.rows.length,
    input.actorId,
    JSON.stringify({ contractLabel: contract.label, parser: "strict-csv-v1", suggestedMapping }),
  );
  await insertRawRows(tx, input.schoolId, batchId, parsed);
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "school_import.uploaded",
    entityType: "SchoolImportBatch",
    entityId: batchId,
    after: { kind: input.kind, sourceFileName, sourceSha256, rowCount: parsed.rows.length, headers: parsed.normalizedHeaders },
  });
  const batch = await readBatch(tx, input.schoolId, batchId);
  if (!batch) throw new AppError("Import batch could not be created.", 500, "IMPORT_CREATE_FAILED");
  return batch;
}

function addIssue(row: ValidatedImportRow, issue: ImportRowIssue, status: "invalid" | "duplicate", duplicateKey?: string) {
  row.issues.push(issue);
  if (status === "duplicate") {
    row.status = "duplicate";
    if (duplicateKey && !row.duplicateKeys.includes(duplicateKey)) row.duplicateKeys.push(duplicateKey);
  } else if (row.status !== "duplicate") {
    row.status = "invalid";
  }
}

function stringValue(row: ValidatedImportRow, key: string) {
  const value = row.normalized[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function addLiveDatabaseChecks(tx: TenantDb, kind: ImportKind, rows: ValidatedImportRow[]) {
  const usable = rows.filter((row) => row.status === "valid");
  if (!usable.length) return;

  if (kind === "students") {
    const admissions = [...new Set(usable.flatMap((row) => stringValue(row, "admissionNo") ? [stringValue(row, "admissionNo")!] : []))];
    const existing = admissions.length ? await tx.student.findMany({ where: { admissionNo: { in: admissions } }, select: { admissionNo: true } }) : [];
    const existingSet = new Set(existing.map((item) => item.admissionNo.toLowerCase()));
    const classes = await tx.class.findMany({ select: { id: true, name: true } });
    const classNames = new Map<string, number>();
    for (const item of classes) classNames.set(item.name.trim().toLowerCase(), (classNames.get(item.name.trim().toLowerCase()) ?? 0) + 1);
    for (const row of usable) {
      const admission = stringValue(row, "admissionNo");
      if (admission && existingSet.has(admission.toLowerCase())) addIssue(row, { field: "admissionNo", code: "existing_student", message: `Admission number ${admission} already exists in this school.` }, "duplicate", `student:admission:${admission.toLowerCase()}`);
      const className = stringValue(row, "className");
      if (className) {
        const matches = classNames.get(className.toLowerCase()) ?? 0;
        if (matches === 0) addIssue(row, { field: "className", code: "class_not_found", message: `Class ${className} does not exist in this school.` }, "invalid");
        if (matches > 1) addIssue(row, { field: "className", code: "class_ambiguous", message: `Class ${className} matches more than one class and must be resolved.` }, "invalid");
      }
    }
  }

  if (kind === "guardians") {
    const phones = [...new Set(usable.flatMap((row) => stringValue(row, "phone") ? [stringValue(row, "phone")!] : []))];
    const emails = [...new Set(usable.flatMap((row) => stringValue(row, "email") ? [stringValue(row, "email")!] : []))];
    const admissions = [...new Set(usable.flatMap((row) => stringValue(row, "studentAdmissionNo") ? [stringValue(row, "studentAdmissionNo")!] : []))];
    const [existingGuardians, students] = await Promise.all([
      tx.guardian.findMany({ where: { OR: [...(phones.length ? [{ phone: { in: phones } }] : []), ...(emails.length ? [{ email: { in: emails } }] : [])] }, select: { phone: true, email: true } }),
      admissions.length ? tx.student.findMany({ where: { admissionNo: { in: admissions } }, select: { admissionNo: true } }) : Promise.resolve([]),
    ]);
    const existingPhones = new Set(existingGuardians.flatMap((item) => item.phone ? [item.phone.toLowerCase()] : []));
    const existingEmails = new Set(existingGuardians.flatMap((item) => item.email ? [item.email.toLowerCase()] : []));
    const studentSet = new Set(students.map((item) => item.admissionNo.toLowerCase()));
    for (const row of usable) {
      const phone = stringValue(row, "phone");
      const email = stringValue(row, "email");
      const admission = stringValue(row, "studentAdmissionNo");
      if (phone && existingPhones.has(phone.toLowerCase())) addIssue(row, { field: "phone", code: "existing_guardian", message: `Guardian phone ${phone} already exists in this school.` }, "duplicate", `guardian:phone:${phone.toLowerCase()}`);
      if (email && existingEmails.has(email.toLowerCase())) addIssue(row, { field: "email", code: "existing_guardian", message: `Guardian email ${email} already exists in this school.` }, "duplicate", `guardian:email:${email.toLowerCase()}`);
      if (admission && !studentSet.has(admission.toLowerCase())) addIssue(row, { field: "studentAdmissionNo", code: "student_not_found", message: `Learner admission number ${admission} was not found.` }, "invalid");
    }
  }

  if (kind === "staff") {
    const emails = [...new Set(usable.flatMap((row) => stringValue(row, "email") ? [stringValue(row, "email")!] : []))];
    const phones = [...new Set(usable.flatMap((row) => stringValue(row, "phone") ? [stringValue(row, "phone")!] : []))];
    const existing = await tx.user.findMany({ where: { OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phones.length ? [{ phone: { in: phones } }] : [])] }, select: { email: true, phone: true } });
    const existingEmails = new Set(existing.flatMap((item) => item.email ? [item.email.toLowerCase()] : []));
    const existingPhones = new Set(existing.flatMap((item) => item.phone ? [item.phone.toLowerCase()] : []));
    for (const row of usable) {
      const email = stringValue(row, "email");
      const phone = stringValue(row, "phone");
      if (email && existingEmails.has(email.toLowerCase())) addIssue(row, { field: "email", code: "existing_staff", message: `Staff email ${email} already exists in this school.` }, "duplicate", `staff:email:${email.toLowerCase()}`);
      if (phone && existingPhones.has(phone.toLowerCase())) addIssue(row, { field: "phone", code: "existing_staff", message: `Staff phone ${phone} already exists in this school.` }, "duplicate", `staff:phone:${phone.toLowerCase()}`);
    }
  }

  if (kind === "classes" || kind === "subjects") {
    const names = [...new Set(usable.flatMap((row) => stringValue(row, "name") ? [stringValue(row, "name")!] : []))];
    const existing = kind === "classes"
      ? await tx.class.findMany({ select: { name: true } })
      : await tx.subject.findMany({ select: { name: true } });
    const existingNames = new Set(existing.map((item) => item.name.trim().toLowerCase()));
    for (const row of usable) {
      const name = stringValue(row, "name");
      if (name && existingNames.has(name.toLowerCase())) addIssue(row, { field: "name", code: kind === "classes" ? "existing_class" : "existing_subject", message: `${name} already exists in this school.` }, "duplicate", `${kind === "classes" ? "class" : "subject"}:name:${name.toLowerCase()}`);
    }
  }

  if (kind === "opening_balances") {
    const admissions = [...new Set(usable.flatMap((row) => stringValue(row, "studentAdmissionNo") ? [stringValue(row, "studentAdmissionNo")!] : []))];
    const students = admissions.length ? await tx.student.findMany({ where: { admissionNo: { in: admissions } }, select: { admissionNo: true } }) : [];
    const studentSet = new Set(students.map((item) => item.admissionNo.toLowerCase()));
    for (const row of usable) {
      const admission = stringValue(row, "studentAdmissionNo");
      if (admission && !studentSet.has(admission.toLowerCase())) addIssue(row, { field: "studentAdmissionNo", code: "student_not_found", message: `Learner admission number ${admission} was not found.` }, "invalid");
    }
  }
}

async function persistValidatedRows(tx: TenantDb, schoolId: string, batchId: string, sourceRows: StagingRow[], rows: ValidatedImportRow[]) {
  const idByRow = new Map(sourceRows.map((row) => [row.rowNumber, row.id]));
  const chunkSize = 300;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const payload = rows.slice(offset, offset + chunkSize).map((row) => ({
      id: idByRow.get(row.rowNumber),
      status: row.status,
      normalizedData: row.normalized,
      validationErrors: row.issues,
      duplicateKeys: row.duplicateKeys,
    })).filter((row) => row.id);
    await tx.$executeRawUnsafe(
      `UPDATE "SchoolImportRow" r
       SET "status"=item->>'status',
           "normalizedData"=item->'normalizedData',
           "validationErrors"=item->'validationErrors',
           "duplicateKeys"=item->'duplicateKeys',
           "updatedAt"=CURRENT_TIMESTAMP
       FROM jsonb_array_elements($3::jsonb) AS item
       WHERE r."schoolId"=$1 AND r."batchId"=$2 AND r."id"=item->>'id'`,
      schoolId,
      batchId,
      JSON.stringify(payload),
    );
  }
}

export async function validateSchoolImportBatch(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  batchId: string;
  columnMapping: ColumnMapping;
}) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`school-import-batch:${input.schoolId}:${input.batchId}`}))`;
  const batch = await readBatch(tx, input.schoolId, input.batchId);
  if (!batch) throw new AppError("Import batch not found.", 404, "IMPORT_NOT_FOUND");
  if (["applying", "applied", "cancelled"].includes(batch.status)) throw new AppError(`Import batch cannot be validated while ${batch.status}.`, 409, "IMPORT_STATE_INVALID");

  const mappingCheck = validateColumnMapping(batch.kind, batch.normalizedHeaders, input.columnMapping);
  if (!mappingCheck.valid) throw new AppError(mappingCheck.errors.join(" "), 400, "IMPORT_MAPPING_INVALID");
  const sourceRows = await tx.$queryRawUnsafe<StagingRow[]>(
    `SELECT "id","rowNumber","rawData" FROM "SchoolImportRow" WHERE "schoolId"=$1 AND "batchId"=$2 ORDER BY "rowNumber" ASC`,
    input.schoolId,
    input.batchId,
  );
  const parsed: ParsedCsv = {
    headers: batch.originalHeaders,
    normalizedHeaders: batch.normalizedHeaders,
    rows: sourceRows.map((row) => ({ rowNumber: row.rowNumber, values: [], record: record(row.rawData) })),
  };
  const validation = validateMappedImportRows(batch.kind, parsed, input.columnMapping);
  await addLiveDatabaseChecks(tx, batch.kind, validation.rows);
  const validRows = validation.rows.filter((row) => row.status === "valid").length;
  const invalidRows = validation.rows.filter((row) => row.status === "invalid").length;
  const duplicateRows = validation.rows.filter((row) => row.status === "duplicate").length;
  const status: SchoolImportBatchStatus = validation.rows.length > 0 && invalidRows === 0 && duplicateRows === 0 ? "ready" : "validated";
  await persistValidatedRows(tx, input.schoolId, input.batchId, sourceRows, validation.rows);
  await tx.$executeRawUnsafe(
    `UPDATE "SchoolImportBatch"
     SET "status"=$3,"columnMapping"=$4::jsonb,"validRows"=$5,"invalidRows"=$6,"duplicateRows"=$7,
         "summary"=$8::jsonb,"validatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.batchId,
    status,
    JSON.stringify(input.columnMapping),
    validRows,
    invalidRows,
    duplicateRows,
    JSON.stringify({ totalRows: validation.rows.length, validRows, invalidRows, duplicateRows, ready: status === "ready" }),
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "school_import.validated",
    entityType: "SchoolImportBatch",
    entityId: input.batchId,
    after: { kind: batch.kind, status, rowCount: validation.rows.length, validRows, invalidRows, duplicateRows, columnMapping: input.columnMapping },
  });
  const updated = await readBatch(tx, input.schoolId, input.batchId);
  if (!updated) throw new AppError("Validated import batch could not be reloaded.", 500, "IMPORT_READ_FAILED");
  return { batch: updated, rows: validation.rows };
}

export async function getSchoolImportBatch(tx: TenantDb, schoolId: string, batchId: string) {
  const batch = await readBatch(tx, schoolId, batchId);
  if (!batch) throw new AppError("Import batch not found.", 404, "IMPORT_NOT_FOUND");
  const rows = await tx.$queryRawUnsafe<Array<{
    id: string;
    rowNumber: number;
    status: string;
    rawData: unknown;
    normalizedData: unknown;
    validationErrors: unknown;
    duplicateKeys: unknown;
    appliedEntityType: string | null;
    appliedEntityId: string | null;
  }>>(
    `SELECT "id","rowNumber","status","rawData","normalizedData","validationErrors","duplicateKeys","appliedEntityType","appliedEntityId"
     FROM "SchoolImportRow" WHERE "schoolId"=$1 AND "batchId"=$2 ORDER BY "rowNumber" ASC`,
    schoolId,
    batchId,
  );
  return { batch, rows };
}

export async function listSchoolImportBatches(tx: TenantDb, schoolId: string, limit = 25) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "SchoolImportBatch" WHERE "schoolId"=$1 ORDER BY "createdAt" DESC LIMIT $2`,
    schoolId,
    safeLimit,
  );
  return rows.map(batchFromRow);
}
