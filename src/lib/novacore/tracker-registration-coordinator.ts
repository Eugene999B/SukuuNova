import { ensureDatabaseRoleSafe, rawDb, withTenant } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { hashTrackerImei, provisionTrackerGatewayBinding } from "./tracker-gateway-service";
import { registerCertifiedTracker } from "./transport-operations-service";

type ExistingBinding = {
  schoolId: string;
  trackerDeviceId: string;
  status: string;
};

export async function registerTrackerWithGateway(input: {
  schoolId: string;
  actorId: string;
  vehicleId: string;
  imei: string;
  model: "FMC130";
  simIccid?: string | null;
  simMsisdn?: string | null;
  apn?: string | null;
}) {
  const imeiHash = hashTrackerImei(input.imei);
  await ensureDatabaseRoleSafe();
  const existing = await rawDb.$queryRawUnsafe<ExistingBinding[]>(
    `SELECT "schoolId","trackerDeviceId","status" FROM "TrackerGatewayBinding" WHERE "imeiHash"=$1 LIMIT 1`,
    imeiHash,
  );
  if (existing[0]) {
    throw new AppError("This tracker IMEI is already provisioned in SukuuNova.", 409, "TRACKER_IMEI_ALREADY_BOUND");
  }

  const tracker = await withTenant(input.schoolId, (tx) => registerCertifiedTracker(tx, input));
  try {
    const binding = await provisionTrackerGatewayBinding({
      schoolId: input.schoolId,
      trackerDeviceId: tracker.id,
      imei: input.imei,
    });
    return { tracker, binding };
  } catch (error) {
    // The global hash is unique, so two concurrent registrations can race after both preflight.
    // A losing registration has never been reachable by a tracker because no binding exists for it,
    // making it safe to remove the just-created testing inventory/certification records.
    await withTenant(input.schoolId, async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT t."id" FROM "P3TrackerDevice" t
         WHERE t."schoolId"=$1 AND t."id"=$2 AND t."status"='testing'
           AND NOT EXISTS (SELECT 1 FROM "P3TrackerEvent" e WHERE e."schoolId"=t."schoolId" AND e."trackerDeviceId"=t."id")
           AND NOT EXISTS (SELECT 1 FROM "P3TransportTrip" tr WHERE tr."schoolId"=t."schoolId" AND tr."trackerDeviceId"=t."id")
         LIMIT 1`,
        input.schoolId,
        tracker.id,
      );
      if (rows[0]) {
        await appendSchoolAudit(tx, {
          schoolId: input.schoolId,
          actorId: input.actorId,
          action: "transport.tracker_registration_rolled_back",
          entityType: "P3TrackerDevice",
          entityId: tracker.id,
          before: { status: "testing", vehicleId: input.vehicleId, model: input.model },
          after: { removed: true, reason: "gateway_binding_failed" },
        });
        await tx.$executeRawUnsafe(
          `DELETE FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "id"=$2 AND "status"='testing'`,
          input.schoolId,
          tracker.id,
        );
      }
    });
    if (error instanceof AppError) throw error;
    throw new AppError(
      error instanceof Error ? error.message : "Tracker gateway provisioning failed.",
      409,
      "TRACKER_GATEWAY_PROVISION_FAILED",
    );
  }
}
