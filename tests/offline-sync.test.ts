import { beforeEach, describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { MAX_OFFLINE_SYNC_OPERATIONS, processOfflineSync } from "../src/lib/offline-sync-service";

describe("offline sync state machine", () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  let deviceId: string;
  let classId: string;
  let studentId: string;

  beforeEach(async () => {
    fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      deviceId = (await tx.device.create({ data: { schoolId: fixture.schoolId, deviceSerial: "sync-device-" + fixture.schoolId, kind: "card", label: "Offline Sync Test Device", apiKeyHash: "a".repeat(64) } })).id;
      classId = (await tx.class.create({ data: { schoolId: fixture.schoolId, name: "Sync Class " + fixture.schoolId } })).id;
      studentId = (await tx.student.create({ data: { schoolId: fixture.schoolId, admissionNo: "SYNC-" + fixture.schoolId, name: "Offline Sync Student", classId } })).id;
      await tx.schoolSettings.update({ where: { schoolId: fixture.schoolId }, data: { expectedResumptionTime: "08:00" } });
    });
  });

  it("applies an attendance operation, preserves its capture timestamp, and returns ALREADY_APPLIED on retry", async () => {
    const createdAt = new Date();
    const capturedAt = new Date(createdAt.getTime() - 30 * 60 * 1000);
    const operation = {
      clientOperationId: "offline-op-001", clientVersion: 1, baseEntityVersion: 0, entityId: studentId,
      operationType: "ATTENDANCE_RECORD" as const,
      payload: { studentId, type: "in" as const, method: "card" as const, attendanceDate: createdAt.toISOString(), timestamp: capturedAt.toISOString() },
      createdAt: createdAt.toISOString()
    };
    await withTenant(fixture.schoolId, async (tx) => {
      const first = await processOfflineSync(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId, operations: [operation] });
      expect(first.results[0]).toMatchObject({ status: "APPLIED" });
      const event = await tx.attendanceEvent.findFirst({ where: { studentId, method: "card" }, orderBy: { timestamp: "desc" } });
      expect(event?.timestamp.toISOString()).toBe(capturedAt.toISOString());
      const retry = await processOfflineSync(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId, operations: [operation] });
      expect(retry.results[0]).toMatchObject({ status: "ALREADY_APPLIED" });
      const ledgerCount = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "SyncOperation" WHERE "schoolId" = ${fixture.schoolId} AND "clientOperationId" = ${operation.clientOperationId}`;
      expect(Number(ledgerCount[0]?.count ?? 0)).toBe(1);
      expect(await tx.attendanceEvent.count({ where: { studentId, method: "card" } })).toBe(1);
    });
  });

  it("returns CONFLICT when the attendance record changed online after the client snapshot", async () => {
    const createdAt = new Date().toISOString();
    const firstOperation = {
      clientOperationId: "offline-op-version-1", clientVersion: 1, entityId: studentId,
      operationType: "ATTENDANCE_RECORD" as const,
      payload: { studentId, type: "in" as const, method: "card" as const, attendanceDate: createdAt },
      createdAt
    };
    await withTenant(fixture.schoolId, async (tx) => {
      const first = await processOfflineSync(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId, operations: [firstOperation] });
      expect(first.results[0]).toMatchObject({ status: "APPLIED" });
      const conflict = await processOfflineSync(tx, {
        schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId,
        operations: [{ clientOperationId: "offline-op-version-2", clientVersion: 1, baseEntityVersion: 0, entityId: studentId, operationType: "ATTENDANCE_RECORD", payload: { studentId, type: "out", method: "card", attendanceDate: createdAt }, createdAt }]
      });
      expect(conflict.results[0]).toMatchObject({ status: "CONFLICT" });
      expect(String(conflict.results[0]?.reason)).toContain("changed online");
    });
  });

  it("rejects reuse of a client operation ID with a different payload", async () => {
    const createdAt = new Date().toISOString();
    const operation = {
      clientOperationId: "offline-op-002", clientVersion: 1, entityId: studentId,
      operationType: "ATTENDANCE_RECORD" as const,
      payload: { studentId, type: "in" as const, method: "card" as const, attendanceDate: createdAt }, createdAt
    };
    await withTenant(fixture.schoolId, async (tx) => {
      const first = await processOfflineSync(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId, operations: [operation] });
      expect(first.results[0]).toMatchObject({ status: "APPLIED" });
      const conflict = await processOfflineSync(tx, { schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId, operations: [{ ...operation, payload: { ...operation.payload, type: "out" as const } }] });
      expect(conflict.results[0]).toMatchObject({ status: "CONFLICT" });
      const ledgerCount = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "SyncOperation" WHERE "schoolId" = ${fixture.schoolId} AND "clientOperationId" = ${operation.clientOperationId}`;
      expect(Number(ledgerCount[0]?.count ?? 0)).toBe(1);
    });
  });

  it("rejects an expired offline operation", async () => {
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await withTenant(fixture.schoolId, async (tx) => {
      const result = await processOfflineSync(tx, {
        schoolId: fixture.schoolId, actorId: fixture.ownerId, deviceId,
        operations: [{ clientOperationId: "offline-op-003", clientVersion: 1, baseEntityVersion: 0, entityId: studentId, operationType: "ATTENDANCE_RECORD", payload: { studentId, type: "in", method: "card", attendanceDate: expired }, createdAt: expired }]
      });
      expect(result.results[0]).toMatchObject({ status: "EXPIRED" });
    });
  });

  it("rejects oversized batches before doing transaction work for each operation", async () => {
    await withTenant(fixture.schoolId, async (tx) => {
      const operation = {
        clientOperationId: "offline-batch-cap-001", clientVersion: 1, entityId: studentId,
        operationType: "ATTENDANCE_RECORD" as const,
        payload: { studentId, type: "in" as const, method: "card" as const, attendanceDate: new Date().toISOString() },
        createdAt: new Date().toISOString()
      };
      await expect(processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: Array.from({ length: MAX_OFFLINE_SYNC_OPERATIONS + 1 }, (_, index) => ({ ...operation, clientOperationId: operation.clientOperationId + "-" + index }))
      })).rejects.toMatchObject({ code: "SYNC_BATCH_TOO_LARGE", status: 400 });
    });
  });
});
