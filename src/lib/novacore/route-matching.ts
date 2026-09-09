import { haversineDistanceMeters, isValidGeoPoint, type GeoPoint } from "./transport";

const EARTH_RADIUS_METERS = 6_371_008.8;

export type RouteMatchOptions = {
  previousAlongMeters?: number | null;
  headingDeg?: number | null;
  backwardToleranceMeters?: number;
  headingPenaltyMeters?: number;
};

export type RouteMatch = {
  matchedPoint: GeoPoint;
  segmentIndex: number;
  segmentFraction: number;
  distanceToRouteMeters: number;
  distanceAlongRouteMeters: number;
  remainingRouteMeters: number;
  routeLengthMeters: number;
  confidence: number;
  segmentBearingDeg: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function toDegrees(value: number) {
  return value * 180 / Math.PI;
}

function localMeters(point: GeoPoint, origin: GeoPoint) {
  const latitude = toRadians(origin.latitude);
  return {
    x: toRadians(point.longitude - origin.longitude) * EARTH_RADIUS_METERS * Math.cos(latitude),
    y: toRadians(point.latitude - origin.latitude) * EARTH_RADIUS_METERS,
  };
}

function bearingDegrees(a: GeoPoint, b: GeoPoint) {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function headingDifference(a: number, b: number) {
  const raw = Math.abs(((a - b + 540) % 360) - 180);
  return clamp(raw, 0, 180);
}

export function routeLengthMeters(route: GeoPoint[]) {
  if (route.length < 2 || route.some((point) => !isValidGeoPoint(point))) return 0;
  let total = 0;
  for (let index = 0; index < route.length - 1; index += 1) total += haversineDistanceMeters(route[index], route[index + 1]);
  return total;
}

export function matchPointToRoute(point: GeoPoint, route: GeoPoint[], options: RouteMatchOptions = {}): RouteMatch | null {
  if (!isValidGeoPoint(point) || route.length < 2 || route.some((candidate) => !isValidGeoPoint(candidate))) return null;

  const segmentLengths: number[] = [];
  const cumulative: number[] = [0];
  for (let index = 0; index < route.length - 1; index += 1) {
    const length = haversineDistanceMeters(route[index], route[index + 1]);
    segmentLengths.push(length);
    cumulative.push(cumulative[index] + length);
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return null;

  const backwardTolerance = options.backwardToleranceMeters ?? 120;
  const headingPenaltyMeters = options.headingPenaltyMeters ?? 90;
  let best: (RouteMatch & { score: number }) | null = null;

  for (let index = 0; index < route.length - 1; index += 1) {
    const a = localMeters(route[index], point);
    const b = localMeters(route[index + 1], point);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    const fraction = squared === 0 ? 0 : clamp(((-a.x) * dx + (-a.y) * dy) / squared, 0, 1);
    const nearestX = a.x + dx * fraction;
    const nearestY = a.y + dy * fraction;
    const distance = Math.hypot(nearestX, nearestY);
    const along = cumulative[index] + segmentLengths[index] * fraction;
    const bearing = bearingDegrees(route[index], route[index + 1]);
    const backwardPenalty = options.previousAlongMeters != null && along < options.previousAlongMeters - backwardTolerance
      ? (options.previousAlongMeters - backwardTolerance - along) * 1.75
      : 0;
    const headingPenalty = options.headingDeg != null && Number.isFinite(options.headingDeg)
      ? headingDifference(options.headingDeg, bearing) / 180 * headingPenaltyMeters
      : 0;
    const score = distance + backwardPenalty + headingPenalty;
    const matchedPoint = {
      latitude: route[index].latitude + (route[index + 1].latitude - route[index].latitude) * fraction,
      longitude: route[index].longitude + (route[index + 1].longitude - route[index].longitude) * fraction,
    };
    const confidence = clamp(Math.exp(-distance / 70) * (1 - Math.min(0.45, headingPenalty / Math.max(1, headingPenaltyMeters) * 0.35)), 0, 1);
    const candidate: RouteMatch & { score: number } = {
      matchedPoint,
      segmentIndex: index,
      segmentFraction: fraction,
      distanceToRouteMeters: distance,
      distanceAlongRouteMeters: along,
      remainingRouteMeters: Math.max(0, total - along),
      routeLengthMeters: total,
      confidence,
      segmentBearingDeg: bearing,
      score,
    };
    if (!best || candidate.score < best.score) best = candidate;
  }

  if (!best) return null;
  const { score: _score, ...match } = best;
  void _score;
  return match;
}

export function routeDistanceBetweenMatches(from: RouteMatch, to: RouteMatch) {
  return Math.max(0, to.distanceAlongRouteMeters - from.distanceAlongRouteMeters);
}
