import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { ensureDatabaseRoleSafe, rawDb, withTenant } from "@/lib/db";
import { getDirectionalRouteShape } from "./directional-route-service";
import { deriveLiveLocationIntelligence } from "./location-intelligence";
import { decodeTeltonikaCodec8E, type TeltonikaCodec8ERecord } from "./teltonika-codec8e";
import { processLiveTransportLocation, type ActiveTransportTrip } from "./transport-live-engine";
import { validateGpsSample, type GpsSample, type SmoothedGpsSample } from "./transport";

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
  guardianAlertsQueued: number;
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

export async function provisionTrackerGatewayBinding(input: { schoolId: string; trackerDeviceId: string; imei: string }) {
  const imeiHash = hashTrackerImei(input.imei);
  await withTenant(input.schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; imei: string }>>(
      `SELECT "id","imei" FROM "P3TrackerDevice" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
      input.schoolId,
      input.trackerDeviceId,
    );
    if (!rows[0] || rows[0].imei !== input.imei) throw new Error("Tracker binding does not match the tenant device inventory.");
  });

  await ensureDatabaseRoleSafe();
  await rawDb.$transaction(async (tx) => {
    const sameHash = await tx.$queryRawUnsafe<Array<{ schoolId: string; trackerDeviceId: string }>>(
      `SELECT "schoolId","trackerDeviceId" FROM "TrackerGatewayBinding" WHERE "imeiHash"=$1 LIMIT 1`,
      imeiHash,
    );
    if (sameHash[0] && (sameHash[0].schoolId !== input.schoolId || sameHash[0].trackerDeviceId !== input.trackerDeviceId)) {
      throw new Error("This tracker IMEI is already bound to another SukuuNova device.");
    }
    const sameDevice = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TrackerGatewayBinding" WHERE "schoolId"=$1 AND "trackerDeviceId"=$2 LIMIT 1`,
      input.schoolId,
      input.trackerDeviceId,
    );
    if (sameDevice[0]) {
      await tx.$executeRawUnsafe(
        `UPDATE "TrackerGatewayBinding" SET "imeiHash"=$1,"status"='active',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2`,
        imeiHash,
        sameDevice[0].id,
      );
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO "TrackerGatewayBinding" ("id","imeiHash","schoolId","trackerDeviceId","status") VALUES ($1,$2,$3,$4,'active')`,
        createId(),
        imeiHash,
        input.schoolId,
        input.trackerDeviceId,
      );
    }
  });
  return { schoolId: input.schoolId, trackerDeviceId: input.trackerDeviceId, imeiHash };
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
  normalizedLatitude: string | null;
  normalizedLongitude: string | null;
  routeProgressMeters: string | null;
  speedKph: string;
  heading: string | null;
  reportedAt: Date;
};

type TrackerRow = {
  id: string;
  vehicleId: string | null;
  status: string;
};

type TripRow = ActiveTransportTrip;

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
  const imeiHash = hashTrackerImei(imei);

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
      `SELECT "id","routeId","vehicleId","direction" FROM "P3TransportTrip" WHERE "schoolId"=$1 AND "vehicleId"=$2 AND "status"='active' ORDER BY "startedAt" DESC NULLS LAST LIMIT 1`,
      binding.schoolId,
      tracker.vehicleId,
    );
    const activeTrip = activeTrips[0] ?? null;
    const routeShape = activeTrip
      ? await getDirectionalRouteShape(tx, {
          schoolId: binding.schoolId,
          routeId: activeTrip.routeId,
          direction: activeTrip.direction as "morning" | "afternoon",
        })
      : [];

    const latest = await tx.$queryRawUnsafe<LocationRow[]>(
      `SELECT "latitude"::text,"longitude"::text,"normalizedLatitude"::text,"normalizedLongitude"::text,"routeProgressMeters"::text,"speedKph"::text,"heading"::text,"reportedAt"
       FROM "P3VehicleLocation"
       WHERE "schoolId"=$1 AND "vehicleId"=$2 AND "quality"='accepted'
       ORDER BY "reportedAt" DESC LIMIT 1`,
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
    let previousSmoothed: SmoothedGpsSample | null = latest[0] ? {
      latitude: Number(latest[0].normalizedLatitude ?? latest[0].latitude),
      longitude: Number(latest[0].normalizedLongitude ?? latest[0].longitude),
      reportedAtMs: latest[0].reportedAt.getTime(),
      speedKph: Number(latest[0].speedKph),
      headingDeg: latest[0].heading == null ? null : Number(latest[0].heading),
    } : null;
    let previousRouteProgressMeters = latest[0]?.routeProgressMeters == null ? null : Number(latest[0].routeProgressMeters);

    let storedLocations = 0;
    let rejectedLocations = 0;
    let guardianAlertsQueued = 0;

    for (const record of decoded.records) {
      const sample = gpsSample(record);
      const hasFix = record.gps.satellites > 0 && !(record.gps.latitude === 0 && record.gps.longitude === 0);
      const validation = hasFix
        ? validateGpsSample(sample, previous, { maxAgeMs: 120_000, maxFutureSkewMs: 30_000, maxImpliedSpeedKph: 160, maxReportedSpeedKph: 180 }, nowMs)
        : { accepted: false, reason: "no_fix" as const };
      const accepted = validation.accepted;
      const reason = accepted ? null : validation.reason;

      await tx.$executeRawUnsafe(
        `INSERT INTO "P3TrackerEvent" ("id","schoolId","trackerDeviceId","imeiHash","eventType","reportedAt","accepted","rejectionReason","payload") VALUES ($1,$2,$3,$4,'avl_location',to_timestamp($5/1000.0),$6,$7,$8::jsonb)`,
        createId(),
        binding.schoolId,
        tracker.id,
        imeiHash,
        record.timestampMs,
        accepted,
        reason,
        recordPayload(record),
      );

      if (!accepted) {
        rejectedLocations += 1;
        continue;
      }

      const intelligence = deriveLiveLocationIntelligence({
        sample,
        previousSmoothed,
        previousRouteProgressMeters,
        route: routeShape,
      });
      const match = intelligence.routeMatch;
      await tx.$executeRawUnsafe(
        `INSERT INTO "P3VehicleLocation"
          ("id","schoolId","vehicleId","routeId","trackerDeviceId","tripId","latitude","longitude","normalizedLatitude","normalizedLongitude","speedKph","heading","reportedAt","source","quality","routeDistanceMeters","routeProgressMeters","routeRemainingMeters","routeMatchConfidence","routeDeviation","algorithmVersion")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13/1000.0),'teltonika','accepted',$14,$15,$16,$17,$18,$19)`,
        createId(),
        binding.schoolId,
        tracker.vehicleId,
        activeTrip?.routeId ?? null,
        tracker.id,
        activeTrip?.id ?? null,
        record.gps.latitude,
        record.gps.longitude,
        intelligence.normalized.latitude,
        intelligence.normalized.longitude,
        record.gps.speedKph,
        record.gps.angleDegrees,
        record.timestampMs,
        match?.distanceToRouteMeters ?? null,
        match?.distanceAlongRouteMeters ?? null,
        match?.remainingRouteMeters ?? null,
        match?.confidence ?? null,
        intelligence.routeDeviation,
        intelligence.algorithmVersion,
      );
      storedLocations += 1;
      previous = sample;
      previousSmoothed = intelligence.smoothed;
      if (match) previousRouteProgressMeters = match.distanceAlongRouteMeters;

      if (activeTrip) {
        const live = await processLiveTransportLocation(
          tx,
          binding.schoolId,
          activeTrip,
          intelligence.normalized,
          new Date(record.timestampMs),
          { routeShape, vehicleRouteMatch: match, speedKph: intelligence.smoothed.speedKph },
        );
        guardianAlertsQueued += live.guardianAlertsQueued;
      }
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
      guardianAlertsQueued,
      acknowledgement: decoded.acknowledgement,
    };
  });
}
