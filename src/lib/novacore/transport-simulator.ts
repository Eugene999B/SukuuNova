import { haversineDistanceMeters, type GeoPoint, type GpsSample } from "./transport";

type SimulatorConfig = {
  startAt?: Date;
  speedKph?: number;
  intervalSeconds?: number;
  gpsNoiseMeters?: number;
  seed?: number;
  dropoutEvery?: number | null;
  deviationAtFraction?: number | null;
  deviationMeters?: number;
};

export type SimulatedGpsSample = GpsSample & {
  sequence: number;
  routeProgress: number;
  simulated: true;
};

const EARTH_RADIUS_METERS = 6_371_008.8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4_294_967_296;
  };
}

function offsetPoint(point: GeoPoint, eastMeters: number, northMeters: number): GeoPoint {
  const latitudeRadians = point.latitude * Math.PI / 180;
  const dLat = northMeters / EARTH_RADIUS_METERS;
  const dLon = eastMeters / (EARTH_RADIUS_METERS * Math.max(0.01, Math.cos(latitudeRadians)));
  return {
    latitude: point.latitude + dLat * 180 / Math.PI,
    longitude: point.longitude + dLon * 180 / Math.PI,
  };
}

function routeSegments(route: GeoPoint[]) {
  const segments: Array<{ from: GeoPoint; to: GeoPoint; startMeters: number; lengthMeters: number }> = [];
  let totalMeters = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const lengthMeters = haversineDistanceMeters(route[index], route[index + 1]);
    segments.push({ from: route[index], to: route[index + 1], startMeters: totalMeters, lengthMeters });
    totalMeters += lengthMeters;
  }
  return { segments, totalMeters };
}

function interpolate(from: GeoPoint, to: GeoPoint, fraction: number): GeoPoint {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  };
}

function pointAtDistance(
  route: GeoPoint[],
  segments: ReturnType<typeof routeSegments>["segments"],
  totalMeters: number,
  distanceMeters: number,
): GeoPoint {
  if (!segments.length) return route[0];
  const target = clamp(distanceMeters, 0, totalMeters);
  const segment = segments.find((item) => target <= item.startMeters + item.lengthMeters) ?? segments[segments.length - 1];
  const localDistance = target - segment.startMeters;
  const fraction = segment.lengthMeters <= 0 ? 0 : clamp(localDistance / segment.lengthMeters, 0, 1);
  return interpolate(segment.from, segment.to, fraction);
}

export function simulateTransportTrip(route: GeoPoint[], config: SimulatorConfig = {}): SimulatedGpsSample[] {
  if (route.length < 2) return [];
  const { segments, totalMeters } = routeSegments(route);
  if (totalMeters <= 0) return [];

  const speedKph = clamp(config.speedKph ?? 28, 3, 120);
  const intervalSeconds = clamp(config.intervalSeconds ?? 10, 1, 300);
  const noiseMeters = clamp(config.gpsNoiseMeters ?? 5, 0, 100);
  const startAtMs = (config.startAt ?? new Date("2026-01-01T06:00:00.000Z")).getTime();
  const random = mulberry32(config.seed ?? 42);
  const metersPerSecond = speedKph / 3.6;
  const stepMeters = metersPerSecond * intervalSeconds;
  const count = Math.max(2, Math.ceil(totalMeters / stepMeters) + 1);
  const results: SimulatedGpsSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const distanceMeters = Math.min(totalMeters, index * stepMeters);
    const progress = totalMeters === 0 ? 1 : distanceMeters / totalMeters;
    if (config.dropoutEvery && index > 0 && index < count - 1 && index % config.dropoutEvery === 0) continue;

    let point = pointAtDistance(route, segments, totalMeters, distanceMeters);
    if (noiseMeters > 0) {
      const angle = random() * Math.PI * 2;
      const radius = random() * noiseMeters;
      point = offsetPoint(point, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    if (config.deviationAtFraction != null && Math.abs(progress - clamp(config.deviationAtFraction, 0, 1)) <= 0.035) {
      point = offsetPoint(point, config.deviationMeters ?? 450, 0);
    }

    results.push({
      ...point,
      sequence: index,
      routeProgress: progress,
      simulated: true,
      reportedAt: new Date(startAtMs + index * intervalSeconds * 1000),
      speedKph,
      headingDeg: null,
      accuracyMeters: Math.max(3, noiseMeters),
    });
  }

  const final = results[results.length - 1];
  if (final && final.routeProgress < 1) {
    results.push({
      ...route[route.length - 1],
      sequence: count,
      routeProgress: 1,
      simulated: true,
      reportedAt: new Date(startAtMs + count * intervalSeconds * 1000),
      speedKph: 0,
      headingDeg: null,
      accuracyMeters: Math.max(3, noiseMeters),
    });
  }

  return results;
}
