import { matchPointToRoute, type RouteMatch } from "./route-matching";
import { smoothGpsSample, type GeoPoint, type GpsSample, type SmoothedGpsSample } from "./transport";

export const LOCATION_INTELLIGENCE_VERSION = "transport-location-v1.1.0";

export type LiveLocationIntelligence = {
  smoothed: SmoothedGpsSample;
  normalized: GeoPoint;
  routeMatch: RouteMatch | null;
  routeDeviation: boolean;
  algorithmVersion: string;
};

function dynamicSmoothingAlpha(speedKph?: number | null) {
  if (speedKph == null || !Number.isFinite(speedKph)) return 0.35;
  if (speedKph < 2) return 0.2;
  if (speedKph < 15) return 0.3;
  if (speedKph < 45) return 0.4;
  return 0.5;
}

export function deriveLiveLocationIntelligence(input: {
  sample: GpsSample;
  previousSmoothed?: SmoothedGpsSample | null;
  previousRouteProgressMeters?: number | null;
  route: GeoPoint[];
  deviationThresholdMeters?: number;
  snapThresholdMeters?: number;
}): LiveLocationIntelligence {
  const smoothed = smoothGpsSample(input.previousSmoothed ?? null, input.sample, dynamicSmoothingAlpha(input.sample.speedKph));
  const routeMatch = matchPointToRoute(smoothed, input.route, {
    previousAlongMeters: input.previousRouteProgressMeters,
    headingDeg: input.sample.headingDeg,
  });
  const deviationThreshold = input.deviationThresholdMeters ?? 250;
  const snapThreshold = input.snapThresholdMeters ?? 75;
  const routeDeviation = routeMatch ? routeMatch.distanceToRouteMeters > deviationThreshold : false;

  // Only snap the display position to the route when the mathematical match is close and confident.
  // Raw tracker coordinates stay untouched in P3VehicleLocation for audit/trip replay evidence.
  const normalized = routeMatch
    && !routeDeviation
    && routeMatch.distanceToRouteMeters <= snapThreshold
    && routeMatch.confidence >= 0.35
    ? routeMatch.matchedPoint
    : { latitude: smoothed.latitude, longitude: smoothed.longitude };

  return {
    smoothed,
    normalized,
    routeMatch,
    routeDeviation,
    algorithmVersion: LOCATION_INTELLIGENCE_VERSION,
  };
}
