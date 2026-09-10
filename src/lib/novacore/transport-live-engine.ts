import { createId } from "@paralleldrive/cuid2";
import type { TenantDb } from "@/lib/db";
import { fingerprintNovaCoreInput, recordNovaCoreDecisionBestEffort } from "./decision-ledger";
import { evaluateEtaArrivalBestEffort, recordEtaShadowPredictionBestEffort } from "./eta-shadow-evaluation";
import { matchPointToRoute, routeDistanceBetweenMatches, type RouteMatch } from "./route-matching";
import {
  estimateEta,
  haversineDistanceMeters,
  nextGeofenceState,
  type GeofenceDecision,
  type GeofenceMemory,
  type GeoPoint,
} from "./transport";

export const PICKUP_PREDICTION_VERSION = "transport-pickup-v1.1.0";

export type ActiveTransportTrip = {
  id: string;
  routeId: string;
  vehicleId: string;
  direction: string;
};

type PickupRow = {
  id: string;
  studentId: string;
  latitude: string;
  longitude: string;
};

type StateRow = {
  state: GeofenceMemory["state"];
  previousDistanceMeters: string | null;
  consecutiveSamples: number;
};

type HistoricalSpeedRow = { averageSpeedKph: string | null };

export type LiveTransportLocationContext = {
  routeShape?: GeoPoint[];
  vehicleRouteMatch?: RouteMatch | null;
  speedKph?: number | null;
};

export type PickupProgress = {
  directDistanceMeters: number;
  routeDistanceMeters: number | null;
  decisionDistanceMeters: number;
  pickupRouteMatch: RouteMatch | null;
  pickupPassed: boolean;
};

export type LiveTransportProcessingResult = {
  pickupsEvaluated: number;
  transitions: number;
  guardianAlertsQueued: number;
};

function directionColumn(direction: string) {
  if (direction === "morning") return 'a."morningEnabled"=true';
  if (direction === "afternoon") return 'a."afternoonEnabled"=true';
  return "true";
}

export function derivePickupProgress(input: {
  vehiclePoint: GeoPoint;
  pickupPoint: GeoPoint;
  routeShape?: GeoPoint[];
  vehicleRouteMatch?: RouteMatch | null;
  passedToleranceMeters?: number;
}): PickupProgress {
  const directDistanceMeters = haversineDistanceMeters(input.vehiclePoint, input.pickupPoint);
  const routeShape = input.routeShape ?? [];
  const vehicleMatch = input.vehicleRouteMatch ?? null;
  const pickupRouteMatch = routeShape.length >= 2 ? matchPointToRoute(input.pickupPoint, routeShape) : null;
  const passedToleranceMeters = input.passedToleranceMeters ?? 120;

  if (!vehicleMatch || !pickupRouteMatch || vehicleMatch.confidence < 0.2 || pickupRouteMatch.confidence < 0.2) {
    return {
      directDistanceMeters,
      routeDistanceMeters: null,
      decisionDistanceMeters: directDistanceMeters,
      pickupRouteMatch,
      pickupPassed: false,
    };
  }

  const signedRemaining = pickupRouteMatch.distanceAlongRouteMeters - vehicleMatch.distanceAlongRouteMeters;
  const pickupPassed = signedRemaining < -passedToleranceMeters;
  const routeDistanceMeters = pickupPassed ? 0 : routeDistanceBetweenMatches(vehicleMatch, pickupRouteMatch);
  return {
    directDistanceMeters,
    routeDistanceMeters,
    decisionDistanceMeters: pickupPassed ? directDistanceMeters : Math.max(directDistanceMeters, routeDistanceMeters),
    pickupRouteMatch,
    pickupPassed,
  };
}

function passedDecision(memory: GeofenceMemory, distanceMeters: number): GeofenceDecision {
  if (memory.state === "passed") {
    return { state: "passed", previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: false, notification: null };
  }
  return { state: "passed", previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: true, notification: null };
}

async function historicalRouteSpeedKph(tx: TenantDb, schoolId: string, trip: ActiveTransportTrip) {
  const rows = await tx.$queryRawUnsafe<HistoricalSpeedRow[]>(
    `SELECT AVG(l."speedKph")::text AS "averageSpeedKph"
     FROM "P3VehicleLocation" l
     JOIN "P3TransportTrip" t ON t."id"=l."tripId" AND t."schoolId"=l."schoolId"
     WHERE l."schoolId"=$1
       AND t."routeId"=$2
       AND t."direction"=$3
       AND t."id"<>$4
       AND l."quality"='accepted'
       AND l."speedKph" BETWEEN 5 AND 90
       AND l."reportedAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
    schoolId,
    trip.routeId,
    trip.direction,
    trip.id,
  );
  const value = rows[0]?.averageSpeedKph == null ? null : Number(rows[0].averageSpeedKph);
  return value != null && Number.isFinite(value) ? value : null;
}

export async function processLiveTransportLocation(
  tx: TenantDb,
  schoolId: string,
  trip: ActiveTransportTrip,
  point: GeoPoint,
  reportedAt: Date,
  context: LiveTransportLocationContext = {},
): Promise<LiveTransportProcessingResult> {
  const processingStartedAt = Date.now();
  const pickups = await tx.$queryRawUnsafe<PickupRow[]>(
    `SELECT p."id",p."studentId",p."latitude"::text,p."longitude"::text
     FROM "P3PickupPoint" p
     JOIN "P3StudentTransportAssignment" a
       ON a."schoolId"=p."schoolId" AND a."studentId"=p."studentId" AND a."routeId"=$2
     WHERE p."schoolId"=$1
       AND p."routeId"=$2
       AND p."direction"=$3
       AND p."status"='approved'
       AND (p."effectiveFrom" IS NULL OR p."effectiveFrom" <= $4)
       AND (p."effectiveTo" IS NULL OR p."effectiveTo" >= $4)
       AND a."status"='active'
       AND a."effectiveFrom" <= $4
       AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= $4)
       AND ${directionColumn(trip.direction)}`,
    schoolId,
    trip.routeId,
    trip.direction,
    reportedAt,
  );

  const routeHistoricalSpeedKph = pickups.length
    ? await historicalRouteSpeedKph(tx, schoolId, trip)
    : null;
  let transitions = 0;
  let guardianAlertsQueued = 0;
  let routeBasedPickups = 0;
  let directFallbackPickups = 0;
  let etaPredictions = 0;
  const stateCounts = new Map<string, number>();

  for (const pickup of pickups) {
    const pickupPoint = { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) };
    const progress = derivePickupProgress({
      vehiclePoint: point,
      pickupPoint,
      routeShape: context.routeShape,
      vehicleRouteMatch: context.vehicleRouteMatch,
    });
    if (progress.routeDistanceMeters == null) directFallbackPickups += 1;
    else routeBasedPickups += 1;

    const existing = await tx.$queryRawUnsafe<StateRow[]>(
      `SELECT "state","previousDistanceMeters"::text,"consecutiveSamples"
       FROM "P3GeofenceState"
       WHERE "schoolId"=$1 AND "tripId"=$2 AND "studentId"=$3
       LIMIT 1`,
      schoolId,
      trip.id,
      pickup.studentId,
    );
    const memory: GeofenceMemory = existing[0] ? {
      state: existing[0].state,
      previousDistanceMeters: existing[0].previousDistanceMeters == null ? null : Number(existing[0].previousDistanceMeters),
      consecutiveSamples: existing[0].consecutiveSamples,
    } : { state: "outside", previousDistanceMeters: null, consecutiveSamples: 0 };

    const decision = progress.pickupPassed
      ? passedDecision(memory, progress.directDistanceMeters)
      : nextGeofenceState(memory, progress.decisionDistanceMeters);
    if (decision.transitioned) transitions += 1;
    stateCounts.set(decision.state, (stateCounts.get(decision.state) ?? 0) + 1);

    const etaDistanceMeters = progress.routeDistanceMeters ?? progress.directDistanceMeters;
    const eta = progress.pickupPassed ? { minutes: null, confidenceMinutes: null, effectiveSpeedKph: null } : estimateEta({
      remainingMeters: etaDistanceMeters,
      currentSpeedKph: context.speedKph,
      routeHistoricalSpeedKph,
      uncertaintyRatio: progress.routeDistanceMeters == null ? 0.4 : 0.25,
    });
    if (eta.minutes != null) {
      etaPredictions += 1;
      await recordEtaShadowPredictionBestEffort(tx, {
        schoolId,
        tripId: trip.id,
        pickupPointId: pickup.id,
        predictedAt: reportedAt,
        predictedMinutes: eta.minutes,
        confidenceMinutes: eta.confidenceMinutes,
        distanceMode: progress.routeDistanceMeters == null ? "direct" : "route",
        routeRemainingMeters: progress.routeDistanceMeters,
      });
    }

    if (decision.transitioned && decision.state === "arrived") {
      const evaluation = await evaluateEtaArrivalBestEffort(tx, {
        schoolId,
        tripId: trip.id,
        pickupPointId: pickup.id,
        actualArrivalAt: reportedAt,
      });
      if (evaluation?.evaluatedPredictions) {
        await recordNovaCoreDecisionBestEffort(tx, {
          schoolId,
          algorithmKey: "transport.eta",
          entityType: "P3TransportTrip",
          entityId: trip.id,
          inputFingerprint: fingerprintNovaCoreInput({
            event: "actual_arrival",
            tripDirection: trip.direction,
            predictionVersion: PICKUP_PREDICTION_VERSION,
            reportedAtMinute: Math.floor(reportedAt.getTime() / 60_000),
            evaluatedPredictions: evaluation.evaluatedPredictions,
          }),
          reasonCodes: [
            "actual_arrival_evaluated",
            ...(evaluation.maeMinutes != null && evaluation.maeMinutes <= 5 ? ["mae_within_5_minutes"] : ["mae_above_5_minutes"]),
          ],
          outputSummary: evaluation,
          shadowGroupKey: `transport-eta-evaluation:${trip.id}:${Math.floor(reportedAt.getTime() / 60_000)}`,
          latencyMs: Date.now() - processingStartedAt,
        });
      }
    }

    const transitionAt = decision.transitioned ? reportedAt : null;
    await tx.$executeRawUnsafe(
      `INSERT INTO "P3GeofenceState"
        ("id","schoolId","tripId","studentId","pickupPointId","state","previousDistanceMeters","consecutiveSamples","approachingAt","arrivingAt","arrivedAt","passedAt","etaMinutes","etaConfidenceMinutes","routeRemainingMeters","predictionVersion","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         CASE WHEN $6='approaching' THEN $9 ELSE NULL END,
         CASE WHEN $6='arriving' THEN $9 ELSE NULL END,
         CASE WHEN $6='arrived' THEN $9 ELSE NULL END,
         CASE WHEN $6='passed' THEN $9 ELSE NULL END,
         $10,$11,$12,$13,CURRENT_TIMESTAMP)
       ON CONFLICT ("schoolId","tripId","studentId") DO UPDATE SET
         "pickupPointId"=EXCLUDED."pickupPointId",
         "state"=EXCLUDED."state",
         "previousDistanceMeters"=EXCLUDED."previousDistanceMeters",
         "consecutiveSamples"=EXCLUDED."consecutiveSamples",
         "approachingAt"=COALESCE("P3GeofenceState"."approachingAt",EXCLUDED."approachingAt"),
         "arrivingAt"=COALESCE("P3GeofenceState"."arrivingAt",EXCLUDED."arrivingAt"),
         "arrivedAt"=COALESCE("P3GeofenceState"."arrivedAt",EXCLUDED."arrivedAt"),
         "passedAt"=COALESCE("P3GeofenceState"."passedAt",EXCLUDED."passedAt"),
         "etaMinutes"=EXCLUDED."etaMinutes",
         "etaConfidenceMinutes"=EXCLUDED."etaConfidenceMinutes",
         "routeRemainingMeters"=EXCLUDED."routeRemainingMeters",
         "predictionVersion"=EXCLUDED."predictionVersion",
         "updatedAt"=CURRENT_TIMESTAMP`,
      createId(),
      schoolId,
      trip.id,
      pickup.studentId,
      pickup.id,
      decision.state,
      progress.decisionDistanceMeters,
      decision.consecutiveSamples,
      transitionAt,
      eta.minutes,
      eta.confidenceMinutes,
      progress.routeDistanceMeters,
      PICKUP_PREDICTION_VERSION,
    );

    if (!decision.transitioned || !decision.notification) continue;
    const guardians = await tx.studentGuardian.findMany({
      where: { schoolId, studentId: pickup.studentId },
      select: { guardianId: true },
    });
    for (const guardian of guardians) {
      const idempotencyKey = `${trip.id}:${pickup.studentId}:${guardian.guardianId}:${decision.notification}`;
      const inserted = await tx.$executeRawUnsafe(
        `INSERT INTO "P3TransportAlert"
          ("id","schoolId","tripId","studentId","guardianId","type","channel","idempotencyKey","status","details")
         VALUES ($1,$2,$3,$4,$5,$6,'policy',$7,'queued',$8::jsonb)
         ON CONFLICT ("schoolId","idempotencyKey") DO NOTHING`,
        createId(),
        schoolId,
        trip.id,
        pickup.studentId,
        guardian.guardianId,
        decision.notification,
        idempotencyKey,
        JSON.stringify({
          pickupPointId: pickup.id,
          directDistanceMeters: Math.round(progress.directDistanceMeters),
          routeDistanceMeters: progress.routeDistanceMeters == null ? null : Math.round(progress.routeDistanceMeters),
          etaMinutes: eta.minutes,
          etaConfidenceMinutes: eta.confidenceMinutes,
          predictionVersion: PICKUP_PREDICTION_VERSION,
          reportedAt: reportedAt.toISOString(),
        }),
      );
      guardianAlertsQueued += Number(inserted ?? 0);
    }
  }

  const stateSummary = Object.fromEntries([...stateCounts.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const decisionFingerprint = fingerprintNovaCoreInput({
    predictionVersion: PICKUP_PREDICTION_VERSION,
    tripDirection: trip.direction,
    routeShapePoints: context.routeShape?.length ?? 0,
    routeMatchConfidence: context.vehicleRouteMatch?.confidence == null ? null : Math.round(context.vehicleRouteMatch.confidence * 1000) / 1000,
    speedBucketKph: context.speedKph == null ? null : Math.round(context.speedKph / 5) * 5,
    pickupCount: pickups.length,
    reportedAtMinute: Math.floor(reportedAt.getTime() / 60_000),
  });

  await recordNovaCoreDecisionBestEffort(tx, {
    schoolId,
    algorithmKey: "transport.geofence",
    entityType: "P3TransportTrip",
    entityId: trip.id,
    inputFingerprint: decisionFingerprint,
    confidence: context.vehicleRouteMatch?.confidence ?? null,
    reasonCodes: [
      ...(routeBasedPickups ? ["route_aware_distance"] : []),
      ...(directFallbackPickups ? ["direct_distance_fallback"] : []),
      ...(transitions ? ["state_transition"] : ["state_stable"]),
      ...(guardianAlertsQueued ? ["guardian_alert_queued"] : []),
    ],
    outputSummary: {
      pickupsEvaluated: pickups.length,
      transitions,
      guardianAlertsQueued,
      routeBasedPickups,
      directFallbackPickups,
      states: stateSummary,
      predictionVersion: PICKUP_PREDICTION_VERSION,
    },
    latencyMs: Date.now() - processingStartedAt,
  });

  if (pickups.length) {
    await recordNovaCoreDecisionBestEffort(tx, {
      schoolId,
      algorithmKey: "transport.eta",
      entityType: "P3TransportTrip",
      entityId: trip.id,
      inputFingerprint: decisionFingerprint,
      reasonCodes: [
        ...(context.speedKph != null ? ["live_speed_available"] : ["live_speed_missing"]),
        ...(routeHistoricalSpeedKph != null ? ["historical_speed_available"] : ["historical_speed_missing"]),
        ...(directFallbackPickups ? ["direct_distance_fallback"] : ["route_distance_available"]),
      ],
      outputSummary: {
        pickupsEvaluated: pickups.length,
        etaPredictions,
        routeBasedPickups,
        directFallbackPickups,
        liveSpeedAvailable: context.speedKph != null,
        historicalSpeedAvailable: routeHistoricalSpeedKph != null,
        predictionVersion: PICKUP_PREDICTION_VERSION,
      },
      shadowGroupKey: `transport-eta:${trip.id}:${decisionFingerprint}`,
      latencyMs: Date.now() - processingStartedAt,
    });
  }

  return { pickupsEvaluated: pickups.length, transitions, guardianAlertsQueued };
}
