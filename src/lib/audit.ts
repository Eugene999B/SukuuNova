import type { Prisma } from "@prisma/client";
import { db, type TenantDb } from "./db";

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type PlatformAuditClient = Pick<typeof db, "auditLogPlatform">;

export async function appendSchoolAudit(
  tx: TenantDb,
  entry: {
    schoolId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  return tx.auditLogSchool.create({
    data: {
      schoolId: entry.schoolId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after)
    }
  });
}

export async function appendPlatformAudit(
  entry: {
    actorId: string;
    action: string;
    targetSchoolId?: string;
    targetEntity?: string;
    meta?: unknown;
  },
  tx?: PlatformAuditClient
) {
  const client = tx ?? db;
  return client.auditLogPlatform.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetSchoolId: entry.targetSchoolId,
      targetEntity: entry.targetEntity,
      meta: toJson(entry.meta)
    }
  });
}
