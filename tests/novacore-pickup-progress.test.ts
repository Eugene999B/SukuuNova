import { describe, expect, it } from "vitest";
import { derivePickupProgress } from "../src/lib/novacore/transport-live-engine";
import { matchPointToRoute } from "../src/lib/novacore/route-matching";

const route = [
  { latitude: 5.6000, longitude: -0.2000 },
  { latitude: 5.6100, longitude: -0.2000 },
  { latitude: 5.6200, longitude: -0.1900 },
  { latitude: 5.6300, longitude: -0.1800 },
];

describe("NovaCore pickup progress", () => {
  it("uses along-route distance instead of unsafe straight-line proximity", () => {
    const vehiclePoint = { latitude: 5.603, longitude: -0.2000 };
    const pickupPoint = { latitude: 5.625, longitude: -0.1850 };
    const vehicleRouteMatch = matchPointToRoute(vehiclePoint, route)!;
    const progress = derivePickupProgress({ vehiclePoint, pickupPoint, routeShape: route, vehicleRouteMatch });

    expect(progress.pickupPassed).toBe(false);
    expect(progress.routeDistanceMeters).not.toBeNull();
    expect(progress.routeDistanceMeters!).toBeGreaterThan(progress.directDistanceMeters * 0.8);
    expect(progress.decisionDistanceMeters).toBeGreaterThanOrEqual(progress.directDistanceMeters);
  });

  it("marks a pickup behind the vehicle as passed rather than arrived", () => {
    const vehiclePoint = { latitude: 5.625, longitude: -0.1850 };
    const pickupPoint = { latitude: 5.605, longitude: -0.2000 };
    const vehicleRouteMatch = matchPointToRoute(vehiclePoint, route)!;
    const progress = derivePickupProgress({ vehiclePoint, pickupPoint, routeShape: route, vehicleRouteMatch, passedToleranceMeters: 50 });

    expect(progress.pickupPassed).toBe(true);
    expect(progress.routeDistanceMeters).toBe(0);
    expect(progress.decisionDistanceMeters).toBe(progress.directDistanceMeters);
  });

  it("falls back safely to direct distance when no certified route match exists", () => {
    const vehiclePoint = { latitude: 5.603, longitude: -0.2000 };
    const pickupPoint = { latitude: 5.604, longitude: -0.2000 };
    const progress = derivePickupProgress({ vehiclePoint, pickupPoint, routeShape: [] });

    expect(progress.routeDistanceMeters).toBeNull();
    expect(progress.pickupPassed).toBe(false);
    expect(progress.decisionDistanceMeters).toBeCloseTo(progress.directDistanceMeters, 6);
  });
});
