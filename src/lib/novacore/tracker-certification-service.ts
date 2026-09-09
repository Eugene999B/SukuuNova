import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { evaluateTrackerCertification, TRACKER_CERTIFICATION_VERSION } from "./tracker-certification";

type CertificationRow = {
  id: string;
  trackerDeviceId: string;
  startedAt: Date;
  status: string;
  createdBy: string;
};

type EventRow = {
  receivedAt: Date;
  accepted: boolean;
  rejectionReason: string | null;
};

export async function startTrackerCertification(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  trackerDeviceId: string;
}) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tracker-cert:${input.schoolId}:${input.trackerDeviceId}`}))`;
  const trackers = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    `SELECT "id","status" FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    input.schoolId,
    input.trackerDeviceId,
  );
  if (!trackers[0]) throw new AppError("Tracker was not found.", 404, "TRACKER_NOT_FOUND");
  if (trackers[0].status === "retired" || trackers[0].status === "blocked") throw new AppError("Blocked or retired trackers cannot begin certification.", 409, "TRACKER_NOT_CERTIFIABLE");

  await tx.$executeRawUnsafe(
    `UPDATE "P3TrackerCertification" SET "status"='cancelled',"endedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "trackerDeviceId"=$2 AND "status"='running'`,
    input.schoolId,
    input.trackerDeviceId,
  );
  const id = createId();
  await tx.$executeRawUnsafe(
    `INSERT INTO "P3TrackerCertification" ("id","schoolId","trackerDeviceId","status","algorithmVersion","createdBy")
     VALUES ($1,$2,$3,'running',$4,$5)`,
    id,
    input.schoolId,
    input.trackerDeviceId,
    TRACKER_CERTIFICATION_VERSION,
    input.actorId,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "P3TrackerDevice" SET "status"='testing',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    input.trackerDeviceId,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.tracker_certification_started",
    entityType: "P3TrackerCertification",
    entityId: id,
    after: { trackerDeviceId: input.trackerDeviceId, algorithmVersion: TRACKER_CERTIFICATION_VERSION },
  });
  return { id, trackerDeviceId: input.trackerDeviceId, status: "running" };
}

export async function refreshTrackerCertification(tx: TenantDb, input: {
  schoolId: string;
  trackerDeviceId: string;
  now?: Date;
}) {
  const rows = await tx.$queryRawUnsafe<CertificationRow[]>(
    `SELECT "id","trackerDeviceId","startedAt","status","createdBy"
     FROM "P3TrackerCertification"
     WHERE "schoolId"=$1 AND "trackerDeviceId"=$2 AND "status"='running'
     ORDER BY "startedAt" DESC LIMIT 1`,
    input.schoolId,
    input.trackerDeviceId,
  );
  const certification = rows[0];
  if (!certification) return null;

  const events = await tx.$queryRawUnsafe<EventRow[]>(
    `SELECT "receivedAt","accepted","rejectionReason"
     FROM "P3TrackerEvent"
     WHERE "schoolId"=$1 AND "trackerDeviceId"=$2 AND "receivedAt">=$3
     ORDER BY "receivedAt" ASC`,
    input.schoolId,
    input.trackerDeviceId,
    certification.startedAt,
  );
  const now = input.now ?? new Date();
  const result = evaluateTrackerCertification(events, {}, now.getTime());
  const passedAt = result.passed ? now : null;

  await tx.$executeRawUnsafe(
    `UPDATE "P3TrackerCertification"
     SET "acceptedPackets"=$3,"rejectedPackets"=$4,"acceptedRatio"=$5,"maxHeartbeatGapSeconds"=$6,"latestPacketAgeSeconds"=$7,
         "failureReasons"=$8::jsonb,"algorithmVersion"=$9,"status"=CASE WHEN $10::boolean THEN 'passed' ELSE "status" END,
         "endedAt"=CASE WHEN $10::boolean THEN $11 ELSE "endedAt" END,"updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1 AND "id"=$2`,
    input.schoolId,
    certification.id,
    result.acceptedPackets,
    result.rejectedPackets,
    result.acceptedRatio,
    result.maxHeartbeatGapSeconds,
    result.latestPacketAgeSeconds,
    JSON.stringify(result.failureReasons),
    result.algorithmVersion,
    result.passed,
    passedAt,
  );

  if (result.passed) {
    const activated = await tx.$executeRawUnsafe(
      `UPDATE "P3TrackerDevice" SET "status"='active',"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "status"='testing'`,
      input.schoolId,
      input.trackerDeviceId,
    );
    if (Number(activated ?? 0) > 0) {
      await appendSchoolAudit(tx, {
        schoolId: input.schoolId,
        actorId: certification.createdBy,
        action: "transport.tracker_certification_passed",
        entityType: "P3TrackerCertification",
        entityId: certification.id,
        after: {
          trackerDeviceId: input.trackerDeviceId,
          acceptedPackets: result.acceptedPackets,
          rejectedPackets: result.rejectedPackets,
          acceptedRatio: result.acceptedRatio,
          maxHeartbeatGapSeconds: result.maxHeartbeatGapSeconds,
          algorithmVersion: result.algorithmVersion,
        },
      });
    }
  }

  return { certificationId: certification.id, ...result, status: result.passed ? "passed" as const : "running" as const };
}

export async function refreshRunningTrackerCertifications(tx: TenantDb, schoolId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const rows = await tx.$queryRawUnsafe<Array<{ trackerDeviceId: string }>>(
    `SELECT "trackerDeviceId" FROM "P3TrackerCertification"
     WHERE "schoolId"=$1 AND "status"='running'
     ORDER BY "startedAt" ASC LIMIT $2`,
    schoolId,
    safeLimit,
  );
  let passed = 0;
  let running = 0;
  for (const row of rows) {
    const result = await refreshTrackerCertification(tx, { schoolId, trackerDeviceId: row.trackerDeviceId });
    if (result?.passed) passed += 1;
    else running += 1;
  }
  return { examined: rows.length, passed, running };
}

export async function failStaleTrackerCertification(tx: TenantDb, input: {
  schoolId: string;
  trackerDeviceId: string;
  actorId: string;
  maximumRunMinutes?: number;
}) {
  const maximumRunMinutes = Math.max(5, Math.min(120, input.maximumRunMinutes ?? 30));
  const rows = await tx.$queryRawUnsafe<CertificationRow[]>(
    `SELECT "id","trackerDeviceId","startedAt","status","createdBy"
     FROM "P3TrackerCertification"
     WHERE "schoolId"=$1 AND "trackerDeviceId"=$2 AND "status"='running'
     ORDER BY "startedAt" DESC LIMIT 1`,
    input.schoolId,
    input.trackerDeviceId,
  );
  const certification = rows[0];
  if (!certification) return { changed: false };
  if (Date.now() - certification.startedAt.getTime() < maximumRunMinutes * 60_000) return { changed: false };

  const result = await refreshTrackerCertification(tx, { schoolId: input.schoolId, trackerDeviceId: input.trackerDeviceId });
  if (result?.passed) return { changed: false, result };
  await tx.$executeRawUnsafe(
    `UPDATE "P3TrackerCertification" SET "status"='failed',"endedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2 AND "status"='running'`,
    input.schoolId,
    certification.id,
  );
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "transport.tracker_certification_failed",
    entityType: "P3TrackerCertification",
    entityId: certification.id,
    after: { trackerDeviceId: input.trackerDeviceId, failureReasons: result?.failureReasons ?? ["certification_timeout"] },
  });
  return { changed: true, result };
}
