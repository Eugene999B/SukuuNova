export type GeoPoint = { latitude: number; longitude: number };

export type GpsSample = GeoPoint & {
  reportedAt: Date | string | number;
  speedKph?: number | null;
  headingDeg?: number | null;
  accuracyMeters?: number | null;
};

export type GpsValidationReason =
  | "accepted"
  | "invalid_coordinates"
  | "invalid_timestamp"
  | "future_timestamp"
  | "stale"
  | "non_monotonic_timestamp"
  | "implausible_jump"
  | "implausible_speed";

export type GpsValidationResult = {
  accepted: boolean;
  reason: GpsValidationReason;
  ageMs: number | null;
  impliedSpeedKph: number | null;
  distanceFromPreviousMeters: number | null;
};

export type GpsValidationOptions = {
  maxAgeMs?: number;
  maxFutureSkewMs?: number;
  maxImpliedSpeedKph?: number;
  maxReportedSpeedKph?: number;
  jumpGraceMeters?: number;
};

export type SmoothedGpsSample = GeoPoint & {
  reportedAtMs: number;
  speedKph: number | null;
  headingDeg: number | null;
};

export type GeofenceState = "outside" | "approaching" | "arriving" | "arrived" | "passed";

export type GeofenceThresholds = {
  approachingMeters?: number;
  arrivingMeters?: number;
  arrivedMeters?: number;
  hysteresisMeters?: number;
  directionToleranceMeters?: number;
  minimumConsecutiveSamples?: number;
};

export type GeofenceMemory = {
  state: GeofenceState;
  previousDistanceMeters: number | null;
  consecutiveSamples: number;
};

export type GeofenceDecision = GeofenceMemory & {
  transitioned: boolean;
  notification: "approaching" | "arriving" | "arrived" | null;
};

const EARTH_RADIUS_METERS = 6_371_008.8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function timestampMs(value: Date | string | number) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export function isValidGeoPoint(point: GeoPoint) {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint) {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validateGpsSample(
  sample: GpsSample,
  previous?: GpsSample | null,
  options: GpsValidationOptions = {},
  nowMs = Date.now(),
): GpsValidationResult {
  const maxAgeMs = options.maxAgeMs ?? 120_000;
  const maxFutureSkewMs = options.maxFutureSkewMs ?? 30_000;
  const maxImpliedSpeedKph = options.maxImpliedSpeedKph ?? 160;
  const maxReportedSpeedKph = options.maxReportedSpeedKph ?? 180;
  const jumpGraceMeters = options.jumpGraceMeters ?? 120;
  const reportedAtMs = timestampMs(sample.reportedAt);

  if (!isValidGeoPoint(sample)) {
    return { accepted: false, reason: "invalid_coordinates", ageMs: null, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }
  if (!Number.isFinite(reportedAtMs)) {
    return { accepted: false, reason: "invalid_timestamp", ageMs: null, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }

  const ageMs = nowMs - reportedAtMs;
  if (ageMs < -maxFutureSkewMs) {
    return { accepted: false, reason: "future_timestamp", ageMs, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }
  if (ageMs > maxAgeMs) {
    return { accepted: false, reason: "stale", ageMs, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }
  if (sample.speedKph != null && (!Number.isFinite(sample.speedKph) || sample.speedKph < 0 || sample.speedKph > maxReportedSpeedKph)) {
    return { accepted: false, reason: "implausible_speed", ageMs, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }
  if (!previous) {
    return { accepted: true, reason: "accepted", ageMs, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }

  const previousAtMs = timestampMs(previous.reportedAt);
  if (!Number.isFinite(previousAtMs) || reportedAtMs <= previousAtMs) {
    return { accepted: false, reason: "non_monotonic_timestamp", ageMs, impliedSpeedKph: null, distanceFromPreviousMeters: null };
  }

  const distanceMeters = haversineDistanceMeters(previous, sample);
  const elapsedSeconds = (reportedAtMs - previousAtMs) / 1000;
  const impliedSpeedKph = elapsedSeconds > 0 ? distanceMeters / elapsedSeconds * 3.6 : null;
  if (distanceMeters > jumpGraceMeters && impliedSpeedKph != null && impliedSpeedKph > maxImpliedSpeedKph) {
    return {
      accepted: false,
      reason: "implausible_jump",
      ageMs,
      impliedSpeedKph,
      distanceFromPreviousMeters: distanceMeters,
    };
  }

  return { accepted: true, reason: "accepted", ageMs, impliedSpeedKph, distanceFromPreviousMeters: distanceMeters };
}

export function smoothGpsSample(
  previous: SmoothedGpsSample | null,
  sample: GpsSample,
  alpha = 0.35,
): SmoothedGpsSample {
  const reportedAtMs = timestampMs(sample.reportedAt);
  const safeAlpha = clamp(alpha, 0.05, 1);
  if (!previous) {
    return {
      latitude: sample.latitude,
      longitude: sample.longitude,
      reportedAtMs,
      speedKph: sample.speedKph ?? null,
      headingDeg: sample.headingDeg ?? null,
    };
  }
  return {
    latitude: previous.latitude + (sample.latitude - previous.latitude) * safeAlpha,
    longitude: previous.longitude + (sample.longitude - previous.longitude) * safeAlpha,
    reportedAtMs,
    speedKph: sample.speedKph == null
      ? previous.speedKph
      : previous.speedKph == null
        ? sample.speedKph
        : previous.speedKph + (sample.speedKph - previous.speedKph) * safeAlpha,
    headingDeg: sample.headingDeg ?? previous.headingDeg,
  };
}

function targetStateForDistance(distanceMeters: number, thresholds: Required<GeofenceThresholds>): GeofenceState {
  if (distanceMeters <= thresholds.arrivedMeters) return "arrived";
  if (distanceMeters <= thresholds.arrivingMeters) return "arriving";
  if (distanceMeters <= thresholds.approachingMeters) return "approaching";
  return "outside";
}

export function nextGeofenceState(
  memory: GeofenceMemory,
  distanceMeters: number,
  thresholds: GeofenceThresholds = {},
): GeofenceDecision {
  const config: Required<GeofenceThresholds> = {
    approachingMeters: thresholds.approachingMeters ?? 1_500,
    arrivingMeters: thresholds.arrivingMeters ?? 300,
    arrivedMeters: thresholds.arrivedMeters ?? 80,
    hysteresisMeters: thresholds.hysteresisMeters ?? 120,
    directionToleranceMeters: thresholds.directionToleranceMeters ?? 25,
    minimumConsecutiveSamples: Math.max(1, thresholds.minimumConsecutiveSamples ?? 2),
  };

  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return { ...memory, transitioned: false, notification: null };
  }

  const previousDistance = memory.previousDistanceMeters;
  const movingToward = previousDistance == null || distanceMeters <= previousDistance + config.directionToleranceMeters;
  const movingAway = previousDistance != null && distanceMeters > previousDistance + config.directionToleranceMeters;
  let candidate = targetStateForDistance(distanceMeters, config);

  if (memory.state === "passed") {
    return { state: "passed", previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: false, notification: null };
  }

  if (memory.state === "arrived" && movingAway && distanceMeters > config.arrivedMeters + config.hysteresisMeters) {
    return { state: "passed", previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: true, notification: null };
  }

  if (memory.state === "arriving" && distanceMeters > config.arrivingMeters + config.hysteresisMeters) candidate = "approaching";
  if (memory.state === "approaching" && distanceMeters > config.approachingMeters + config.hysteresisMeters) candidate = "outside";

  const rank: Record<Exclude<GeofenceState, "passed">, number> = { outside: 0, approaching: 1, arriving: 2, arrived: 3 };
  const currentRank = rank[memory.state as Exclude<GeofenceState, "passed">];
  const candidateRank = rank[candidate as Exclude<GeofenceState, "passed">];

  if (candidateRank > currentRank && !movingToward) {
    return { ...memory, previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: false, notification: null };
  }

  if (candidate === memory.state) {
    return { state: memory.state, previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: false, notification: null };
  }

  const consecutiveSamples = memory.consecutiveSamples + 1;
  if (consecutiveSamples < config.minimumConsecutiveSamples) {
    return { state: memory.state, previousDistanceMeters: distanceMeters, consecutiveSamples, transitioned: false, notification: null };
  }

  const notification = candidate === "approaching" || candidate === "arriving" || candidate === "arrived" ? candidate : null;
  return { state: candidate, previousDistanceMeters: distanceMeters, consecutiveSamples: 0, transitioned: true, notification };
}

export type EtaEstimate = {
  minutes: number | null;
  confidenceMinutes: number | null;
  effectiveSpeedKph: number | null;
};

export function estimateEta(input: {
  remainingMeters: number;
  currentSpeedKph?: number | null;
  segmentHistoricalSpeedKph?: number | null;
  routeHistoricalSpeedKph?: number | null;
  minimumOperationalSpeedKph?: number;
  maximumOperationalSpeedKph?: number;
  uncertaintyRatio?: number;
}): EtaEstimate {
  if (!Number.isFinite(input.remainingMeters) || input.remainingMeters < 0) {
    return { minutes: null, confidenceMinutes: null, effectiveSpeedKph: null };
  }
  if (input.remainingMeters === 0) return { minutes: 0, confidenceMinutes: 0, effectiveSpeedKph: 0 };

  const minSpeed = input.minimumOperationalSpeedKph ?? 6;
  const maxSpeed = input.maximumOperationalSpeedKph ?? 90;
  const sources = [
    { value: input.currentSpeedKph, weight: 0.5 },
    { value: input.segmentHistoricalSpeedKph, weight: 0.35 },
    { value: input.routeHistoricalSpeedKph, weight: 0.15 },
  ].filter((source): source is { value: number; weight: number } => source.value != null && Number.isFinite(source.value) && source.value >= 3);

  if (!sources.length) return { minutes: null, confidenceMinutes: null, effectiveSpeedKph: null };
  const weightTotal = sources.reduce((sum, source) => sum + source.weight, 0);
  const weightedSpeed = sources.reduce((sum, source) => sum + source.value * source.weight, 0) / weightTotal;
  const effectiveSpeedKph = clamp(weightedSpeed, minSpeed, maxSpeed);
  const minutes = input.remainingMeters / 1000 / effectiveSpeedKph * 60;
  const roundedMinutes = Math.max(1, Math.round(minutes));
  const confidenceMinutes = Math.max(1, Math.ceil(roundedMinutes * (input.uncertaintyRatio ?? 0.25)));
  return { minutes: roundedMinutes, confidenceMinutes, effectiveSpeedKph: Math.round(effectiveSpeedKph * 10) / 10 };
}

function projectMeters(point: GeoPoint, origin: GeoPoint) {
  const lat0 = toRadians(origin.latitude);
  return {
    x: toRadians(point.longitude - origin.longitude) * EARTH_RADIUS_METERS * Math.cos(lat0),
    y: toRadians(point.latitude - origin.latitude) * EARTH_RADIUS_METERS,
  };
}

export function distanceToRouteMeters(point: GeoPoint, route: GeoPoint[]) {
  if (!isValidGeoPoint(point) || !route.length || route.some((item) => !isValidGeoPoint(item))) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return haversineDistanceMeters(point, route[0]);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    const a = projectMeters(route[index], point);
    const b = projectMeters(route[index + 1], point);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : clamp((-(a.x) * dx + -(a.y) * dy) / lengthSquared, 0, 1);
    const nearestX = a.x + dx * t;
    const nearestY = a.y + dy * t;
    best = Math.min(best, Math.hypot(nearestX, nearestY));
  }
  return best;
}

export function classifyRouteDeviation(point: GeoPoint, route: GeoPoint[], thresholdMeters = 250) {
  const distanceMeters = distanceToRouteMeters(point, route);
  return {
    deviated: Number.isFinite(distanceMeters) && distanceMeters > thresholdMeters,
    distanceMeters,
  };
}
