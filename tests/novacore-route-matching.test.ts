import { describe, expect, it } from "vitest";
import { matchPointToRoute, routeDistanceBetweenMatches, routeLengthMeters } from "../src/lib/novacore/route-matching";

describe("NovaCore route matching", () => {
  const route = [
    { latitude: 5.6000, longitude: -0.2000 },
    { latitude: 5.6100, longitude: -0.2000 },
    { latitude: 5.6200, longitude: -0.1900 },
  ];

  it("matches a noisy location to the nearest route segment with progress", () => {
    const match = matchPointToRoute({ latitude: 5.6050, longitude: -0.1998 }, route, { headingDeg: 0 });
    expect(match).not.toBeNull();
    expect(match!.segmentIndex).toBe(0);
    expect(match!.distanceToRouteMeters).toBeLessThan(30);
    expect(match!.distanceAlongRouteMeters).toBeGreaterThan(400);
    expect(match!.remainingRouteMeters).toBeGreaterThan(1_000);
    expect(match!.confidence).toBeGreaterThan(0.6);
  });

  it("uses previous progress to resist snapping backwards at ambiguous geometry", () => {
    const first = matchPointToRoute({ latitude: 5.615, longitude: -0.195 }, route);
    expect(first).not.toBeNull();
    const next = matchPointToRoute(
      { latitude: 5.6099, longitude: -0.1999 },
      route,
      { previousAlongMeters: first!.distanceAlongRouteMeters, backwardToleranceMeters: 40 },
    );
    expect(next).not.toBeNull();
    expect(next!.distanceAlongRouteMeters).toBeGreaterThan(500);
  });

  it("calculates directed route distance between two matched pickup positions", () => {
    const bus = matchPointToRoute({ latitude: 5.603, longitude: -0.2 }, route)!;
    const pickup = matchPointToRoute({ latitude: 5.615, longitude: -0.195 }, route)!;
    expect(routeDistanceBetweenMatches(bus, pickup)).toBeGreaterThan(1_000);
    expect(routeDistanceBetweenMatches(pickup, bus)).toBe(0);
  });

  it("returns a realistic route length and rejects invalid geometry", () => {
    expect(routeLengthMeters(route)).toBeGreaterThan(2_000);
    expect(matchPointToRoute({ latitude: 95, longitude: 0 }, route)).toBeNull();
  });
});
