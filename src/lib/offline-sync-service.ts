import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { hasPermission } from "./rbac";
import { recordAttendance } from "./attendance-service";

export type SyncOutcome =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "CONFLICT"
  | "REJECTED_PERMISSION"
  | "REJECTED_VALIDATION"
  | "EXPIRED";

export type SyncInput = {
  clientOperationId: string;
  clientVersion: number;
  baseEntityVersion?: number;
  entityId?: string;
  operationType: "ATTENDANCE_RECORD";
  payload: Record<string, unknown>;
  createdAt: string;
};

const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function payloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function localDateKey(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

async function assertDevice(tx: TenantDb, deviceId: string) {
  const device = await tx.device.findFirst({ where: { id: deviceId, status: "active" }, select: { id: true } });
  if (!device) throw new AppError("Offline sync device is not active in this school.", 401, "INVALID_DEVICE");
}

export async function processOfflineSync(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; deviceId: string; operations: SyncInput[] }
) {
  await assertDevice(tx, input.deviceId);
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { timezone: true } });
  const timezone = settings?.timezone || "Africa/Accra";
  const results: Array<Record<string, unknown>> = [];

  for (const operation of input.operations) {
    const createdAt = new Date(operation.createdAt);
    const hash = payloadHash(operation.payload);
    const base = { clientOperationId: operation.clientOperationId, operationType: operation.operationType };

    if (!Number.isInteger(operation.clientVersion) || operation.clientVersion < 1 || !operation.clientOperationId.trim()) {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "Invalid client operation metadata." });
      continue;
    }
    if (operation.baseEntityVersion !== undefined && (!Number.isInteger(operation.baseEntityVersion) || operation.baseEntityVersion < 0)) {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "Invalid base entity version." });
      continue;
    }
    if (Number.isNaN(createdAt.getTime())) {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "Invalid createdAt." });
      continue;
    }
    if (Date.now() - createdAt.getTime() > MAX_OFFLINE_AGE_MS) {
      results.push({ ...base, status: "EXPIRED" as SyncOutcome, reason: "Offline operation is older than the allowed sync window." });
      continue;
    }

    const existing = await tx.$queryRaw<Array<{ id: string; payloadHash: string; status: SyncOutcome; result: Prisma.JsonValue | null; reason: string | null }>>`
      SELECT "id", "payloadHash", "status", "result", "reason"
      FROM "SyncOperation"
      WHERE "schoolId" = ${input.schoolId}
        AND "deviceId" = ${input.deviceId}
        AND "clientOperationId" = ${operation.clientOperationId}
      LIMIT 1
    `;
    if (existing[0]) {
      if (existing[0].payloadHash !== hash) {
        results.push({ ...base, status: "CONFLICT" as SyncOutcome, reason: "The same client operation ID was already used with a different payload." });
      } else {
        results.push({ ...base, status: "ALREADY_APPLIED" as SyncOutcome, result: existing[0].result ?? null, reason: existing[0].reason ?? null });
      }
      continue;
    }

    if (operation.operationType !== "ATTENDANCE_RECORD") {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "This operation type is not enabled for offline sync." });
      continue;
    }

    const studentId = typeof operation.payload.studentId === "string" ? operation.payload.studentId : "";
    const type = operation.payload.type === "in" || operation.payload.type === "out" ? operation.payload.type : null;
    const method = operation.payload.method === "manual" || operation.payload.method === "qr" || operation.payload.method === "face" || operation.payload.method === "fingerprint" || operation.payload.method === "card"
      ? operation.payload.method
      : null;
    const rawTimestamp = typeof operation.payload.timestamp === "string"
      ? operation.payload.timestamp
      : typeof operation.payload.attendanceDate === "string"
        ? operation.payload.attendanceDate
        : null;
    const timestamp = rawTimestamp ? new Date(rawTimestamp) : null;
    if (!studentId || !type || !method || !timestamp || Number.isNaN(timestamp.getTime())) {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "Attendance payload is incomplete or invalid." });
      continue;
    }
    if (localDateKey(timestamp, timezone) !== localDateKey(new Date(), timezone)) {
      results.push({ ...base, status: "REJECTED_VALIDATION" as SyncOutcome, reason: "Offline attendance may only be synchronized for the current attendance date." });
      continue;
    }
    if (!(await hasPermission(tx, input.actorId, "attendance:record"))) {
      results.push({ ...base, status: "REJECTED_PERMISSION" as SyncOutcome, reason: "This account no longer has attendance recording permission." });
      continue;
    }

    const periodId = typeof operation.payload.periodId === "string" && operation.payload.periodId.trim()
      ? operation.payload.periodId.trim()
      : "DAILY";
    const attendanceDate = new Date(localDateKey(timestamp, timezone) + "T00:00:00.000Z");
    const currentRecord = await tx.$queryRaw<Array<{ id: string; version: number; status: string }>>`
      SELECT "id", "version", "status"
      FROM "AttendanceRecord"
      WHERE "schoolId" = ${input.schoolId}
        AND "studentId" = ${studentId}
        AND "attendanceDate" = ${attendanceDate.toISOString().slice(0, 10)}::date
        AND "periodId" = ${periodId}
      LIMIT 1
    `;
    const currentVersion = currentRecord[0]?.version ?? 0;
    if (operation.baseEntityVersion !== undefined) {
      if (!currentRecord[0] && operation.baseEntityVersion !== 0) {
        results.push({ ...base, status: "CONFLICT" as SyncOutcome, reason: "The offline client expected an existing attendance record, but it no longer exists." });
        continue;
      }
      if (currentRecord[0] && operation.baseEntityVersion !== currentVersion) {
        results.push({
          ...base,
          status: "CONFLICT" as SyncOutcome,
          reason: `The attendance record changed online. Client version ${operation.baseEntityVersion}; server version ${currentVersion}.`
        });
        continue;
      }
    }

    const operationId = `sync-${input.deviceId}-${operation.clientOperationId}`;
    const inserted = await tx.$executeRaw`
      INSERT INTO "SyncOperation" (
        "id", "schoolId", "deviceId", "clientOperationId", "clientVersion",
        "baseEntityVersion", "entityId", "operationType", "payload", "payloadHash", "status", "createdAt"
      ) VALUES (
        ${operationId}, ${input.schoolId}, ${input.deviceId}, ${operation.clientOperationId}, ${operation.clientVersion},
        ${operation.baseEntityVersion ?? null}, ${operation.entityId ?? studentId}, ${operation.operationType}, ${JSON.stringify(operation.payload)}::jsonb,
        ${hash}, 'QUEUED', ${createdAt}
      )
      ON CONFLICT ("schoolId", "deviceId", "clientOperationId") DO NOTHING
    `;
    if (inserted === 0) {
      const raced = await tx.$queryRaw<Array<{ payloadHash: string; status: SyncOutcome; result: Prisma.JsonValue | null; reason: string | null }>>`
        SELECT "payloadHash", "status", "result", "reason"
        FROM "SyncOperation"
        WHERE "schoolId" = ${input.schoolId}
          AND "deviceId" = ${input.deviceId}
          AND "clientOperationId" = ${operation.clientOperationId}
        LIMIT 1
      `;
      if (raced[0]?.payloadHash !== hash) {
        results.push({ ...base, status: "CONFLICT" as SyncOutcome, reason: "The same client operation ID was already used with a different payload." });
      } else {
        results.push({ ...base, status: "ALREADY_APPLIED" as SyncOutcome, result: raced[0]?.result ?? null, reason: raced[0]?.reason ?? null });
      }
      continue;
    }

    try {
      const event = await recordAttendance(tx, { schoolId: input.schoolId, actorId: input.actorId, target: { studentId }, type, method, periodId, timestamp });
      const result = { eventId: event.id };
      await tx.$executeRaw`
        UPDATE "SyncOperation"
        SET "status" = 'APPLIED', "result" = ${JSON.stringify(result)}::jsonb, "processedAt" = NOW()
        WHERE "id" = ${operationId} AND "schoolId" = ${input.schoolId}
      `;
      results.push({ ...base, status: "APPLIED" as SyncOutcome, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Attendance operation failed.";
      const status: SyncOutcome = message.includes("permission") || message.includes("permitted") ? "REJECTED_PERMISSION" : "REJECTED_VALIDATION";
      await tx.$executeRaw`
        UPDATE "SyncOperation"
        SET "status" = ${status}, "reason" = ${message.slice(0, 500)}, "processedAt" = NOW()
        WHERE "id" = ${operationId} AND "schoolId" = ${input.schoolId}
      `;
      results.push({ ...base, status, reason: message.slice(0, 500) });
    }
  }

  return { results };
}
