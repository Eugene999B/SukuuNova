import { beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";
import { processOfflineSync } from "../src/lib/offline-sync-service";

describe("offline sync state machine", () => {
  let fixture: Awaited<ReturnType<typeof createTenantFixture>>;
  let deviceId: string;
  let classId: string;
  let studentId: string;

  beforeAll(async () => {
    fixture = await createTenantFixture();
    await withTenant(fixture.schoolId, async (tx) => {
      deviceId = (await tx.device.create({
        data: {
          schoolId: fixture.schoolId,
          deviceSerial: "sync-device-" + fixture.schoolId,
          kind: "card",
          label: "Offline Sync Test Device",
          apiKeyHash: "a".repeat(64)
        }
      })).id;
      classId = (await tx.class.create({
        data: { schoolId: fixture.schoolId, name: "Sync Class " + fixture.schoolId }
      })).id;
      studentId = (await tx.student.create({
        data: {
          schoolId: fixture.schoolId,
          admissionNo: "SYNC-" + fixture.schoolId,
          name: "Offline Sync Student",
          classId
        }
      })).id;
      await tx.schoolSettings.update({
        where: { schoolId: fixture.schoolId },
        data: { expectedResumptionTime: "08:00" }
      });
    });
  });

  it("applies an attendance operation and returns ALREADY_APPLIED on the exact retry", async () => {
    const createdAt = new Date();
    const operation = {
      clientOperationId: "offline-op-001",
      clientVersion: 1,
      entityId: studentId,
      operationType: "ATTENDANCE_RECORD" as const,
      payload: {
        studentId,
        type: "in" as const,
        method: "card" as const,
        attendanceDate: createdAt.toISOString()
      },
      createdAt: createdAt.toISOString()
    };

    await withTenant(fixture.schoolId, async (tx) => {
      const first = await processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: [operation]
      });
      expect(first.results[0]).toMatchObject({ status: "APPLIED" });

      const retry = await processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: [operation]
      });
      expect(retry.results[0]).toMatchObject({ status: "ALREADY_APPLIED" });
      expect(await tx.syncOperation.count({ where: { clientOperationId: operation.clientOperationId } })).toBe(1);
      expect(await tx.attendanceEvent.count({ where: { studentId, method: "card" } })).toBe(1);
    });
  });

  it("rejects reuse of a client operation ID with a different payload", async () => {
    const operation = {
      clientOperationId: "offline-op-002",
      clientVersion: 1,
      entityId: studentId,
      operationType: "ATTENDANCE_RECORD" as const,
      payload: {
        studentId,
        type: "in" as const,
        method: "card" as const,
        attendanceDate: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };

    await withTenant(fixture.schoolId, async (tx) => {
      const first = await processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: [operation]
      });
      expect(first.results[0]).toMatchObject({ status: "APPLIED" });

      const conflict = await processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: [{
          ...operation,
          payload: { ...operation.payload, type: "out" as const }
        }]
      });
      expect(conflict.results[0]).toMatchObject({ status: "CONFLICT" });
      expect(await tx.syncOperation.count({ where: { clientOperationId: operation.clientOperationId } })).toBe(1);
    });
  });

  it("rejects an expired offline operation", async () => {
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await withTenant(fixture.schoolId, async (tx) => {
      const result = await processOfflineSync(tx, {
        schoolId: fixture.schoolId,
        actorId: fixture.ownerId,
        deviceId,
        operations: [{
          clientOperationId: "offline-op-003",
          clientVersion: 1,
          entityId: studentId,
          operationType: "ATTENDANCE_RECORD",
          payload: { studentId, type: "in", method: "card", attendanceDate: expired },
          createdAt: expired
        }]
      });
      expect(result.results[0]).toMatchObject({ status: "EXPIRED" });
    });
  });
});
