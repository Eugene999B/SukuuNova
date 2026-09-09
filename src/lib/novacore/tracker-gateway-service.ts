import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { ensureDatabaseRoleSafe, rawDb, withTenant } from "@/lib/db";
import { decodeTeltonikaCodec8E, type TeltonikaCodec8ERecord } from "./teltonika-codec8e";
import { validateGpsSample, type GpsSample } from "./transport";

export type TrackerGatewayBinding = {
  schoolId: string;
  trackerDeviceId: string;
  status: string;
};

export type TrackerIngestResult = {
  schoolId: string;
  trackerDeviceId: string;
  recordCount: number;
  storedLocations: number;
  rejectedLocations: number;
  acknowledgement: Buffer;
};

export function hashTrackerImei(imei: string) {
  if (!/^\d{14,20}$/.test(imei)) throw new Error("IMEI is invalid.");
  return createHash("sha256").update(imei, "ascii").digest("hex");
}

export async function resolveTrackerGatewayBinding(imei: string): Promise<TrackerGatewayBinding | null> {
  await ensureDatabaseRoleSafe();
  const imeiHash = hashTrackerImei(imei);
  const rows = await rawDb.$queryRawUnsafe<TrackerGatewayBinding[]>(
    `SELECT "schoolId","trackerDeviceId","status" FROM "TrackerGatewayBinding" WHERE "imeiHash"=$1 LIMIT 1`,
    imeiHash,
  );
  const binding = rows[0] ?? null;
  return binding?.status === "active" ? binding : null;
}

function recordPayload(record: TeltonikaCodec8ERecord) {
  return JSON.stringify({
    timestampMs: record.timestampMs,
    priority: record.priority,
    gps: record.gps,
    eventIoId: record.eventIoId,
    io: record.io,
  });
}

type LocationRow = {
  latitude: string;
  longitude: string;
  speedKph: string;
  heading: string | null;
  reportedAt: Date;
};

type TrackerRow = {
  id: string;
  vehicleId: string | null;
  status: string;
};

type TripRow = { id: string; routeId: string; vehicleId: string };

function gpsSample(record: TeltonikaCodec8ERecord): GpsSample {
  return {
    latitude: record.gps.latitude,
    longitude: record.gps.longitude,
    reportedAt: record.timestampMs,
    speedKph: record.gps.speedKph,
    headingDeg: record.gps.angleDegrees,
  };
}

export async function ingestTeltonikaPacket(imei: string, packet: Buffer, nowMs = Date.now()): Promise<TrackerIngestResult> {
  const decoded = decodeTeltonikaCodec8E(packet);
  const binding = await resolveTrackerGatewayBinding(imei);
  if (!binding) throw new Error("Tracker is not provisioned or is disabled.");

  return withTenant(binding.schoolId, async (tx) => {
    const trackers = await tx.$queryRawUnsafe<TrackerRow[]>(
      `SELECT "id","vehicleId","status" FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
      binding.schoolId,
      binding.trackerDeviceId,
    );
    const tracker = trackers[0];
    if (!tracker || tracker.status === "blocked" || tracker.status === "retired") throw new Error("Tracker is disabled for this school.");
    if (!tracker.vehicleId) throw new Error("Tracker is not assigned to a vehicle.");

    const activeTrips = await tx.$queryRawUnsafe<TripRow[]>(
      `SELECT "id","routeId","vehicleId" FROM "P3TransportTrip" WHERE "schoolId"=$1 AND "vehicleId"=$2 AND "status"='active' ORDER BY "startedAt" DESC NULLS LAST LIMIT 1`,
      binding.schoolId,
      tracker.vehicleId,
    );
    const activeTrip = activeTrips[0] ?? null;

    const latest = await tx.$queryRawUnsafe<LocationRow[]>(
      `SELECT "latitude"::text,"longitude"::text,"speedKph"::text,"heading"::text,"reportedAt" FROM "P3VehicleLocation" WHERE "schoolId"=$1 AND "vehicleId"=$2 AND "quality"='accepted' ORDER BY "reportedAt" DESC LIMIT 1`,
      binding.schoolId,
      tracker.vehicleId,
    );
    let previous: GpsSample | null = latest[0] ? {
      latitude: Number(latest[0].latitude),
      longitude: Number(latest[0].longitude),
      speedKph: Number(latest[0].speedKph),
      headingDeg: latest[0].heading == null ? null : Number(latest[0].heading),
      reportedAt: latest[0].reportedAt,
    } : null;

    let storedLocations = 0;
    let rejectedLocations = 0;

    for (const record of decoded.records) {
      const sample = gpsSample(record);
      const hasFix = record.gps.satellites > 0 && !(record.gps.latitude === 0 && record.gps.longitude === 0);
      const validation = hasFix
        ? validateGpsSample(sample, previous, { maxAgeMs: 120_000, maxFutureSkewMs: 30_000, maxImpliedSpeedKph: 160, maxReportedSpeedKph: 180 }, nowMs)
        : { accepted: false, reason: "no_fix" as const };
      const accepted = validation.accepted;
      const reason = accepted ? null : validation.reason;

      await tx.$executeRawUnsafe(
        `INSERT INTO "P3TrackerEvent" ("id","schoolId","trackerDeviceId","imei","eventType","reportedAt","accepted","rejectionReason","payload") VALUES ($1,$2,$3,$4,'avl_location',to_timestamp($5/1000.0),$6,$7,$8::jsonb)`,
        createId(),
        binding.schoolId,
        tracker.id,
        imei,
        record.timestampMs,
        accepted,
        reason,
        recordPayload(record),
      );

      if (!accepted) {
        rejectedLocations += 1;
        continue;
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "P3VehicleLocation" ("id","schoolId","vehicleId","routeId","trackerDeviceId","tripId","latitude","longitude","speedKph","heading","reportedAt","source","quality") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0),'teltonika','accepted')`,
        createId(),
        binding.schoolId,
        tracker.vehicleId,
        activeTrip?.routeId ?? null,
        tracker.id,
        activeTrip?.id ?? null,
        record.gps.latitude,
        record.gps.longitude,
        record.gps.speedKph,
        record.gps.angleDegrees,
        record.timestampMs,
      );
      storedLocations += 1;
      previous = sample;
    }

    await tx.$executeRawUnsafe(
      `UPDATE "P3TrackerDevice" SET "lastSeenAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
      binding.schoolId,
      tracker.id,
    );
    if (activeTrip && storedLocations > 0) {
      await tx.$executeRawUnsafe(
        `UPDATE "P3TransportTrip" SET "lastLocationAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "schoolId"=$1 AND "id"=$2`,
        binding.schoolId,
        activeTrip.id,
      );
    }

    return {
      schoolId: binding.schoolId,
      trackerDeviceId: tracker.id,
      recordCount: decoded.recordCount,
      storedLocations,
      rejectedLocations,
      acknowledgement: decoded.acknowledgement,
    };
  });
}
