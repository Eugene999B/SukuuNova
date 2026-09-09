import { describe, expect, it } from "vitest";
import {
  classifyRouteDeviation,
  estimateEta,
  haversineDistanceMeters,
  nextGeofenceState,
  smoothGpsSample,
  validateGpsSample,
  type GeofenceMemory,
} from "../src/lib/novacore/transport";
import { simulateTransportTrip } from "../src/lib/novacore/transport-simulator";

describe("NovaCore transport intelligence", () => {
  it("calculates useful geodesic distances", () => {
    expect(haversineDistanceMeters({ latitude: 5.6037, longitude: -0.187 }, { latitude: 5.6037, longitude: -0.187 })).toBe(0);
    const roughly111m = haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 });
    expect(roughly111m).toBeGreaterThan(110);
    expect(roughly111m).toBeLessThan(112);
  });

  it("rejects stale and physically impossible tracker points", () => {
    const now = new Date("2026-09-09T07:00:00.000Z").getTime();
    expect(validateGpsSample({ latitude: 5.6, longitude: -0.18, reportedAt: now - 180_000 }, null, {}, now).reason).toBe("stale");

    const previous = { latitude: 5.6, longitude: -0.18, reportedAt: now - 10_000 };
    const jump = { latitude: 5.7, longitude: -0.18, reportedAt: now };
    const result = validateGpsSample(jump, previous, {}, now);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("implausible_jump");
    expect(result.impliedSpeedKph).toBeGreaterThan(1_000);
  });

  it("smooths noisy GPS without moving the output all the way to the raw sample", () => {
    const previous = {
      latitude: 5.6,
      longitude: -0.18,
      reportedAtMs: 1_000,
      speedKph: 20,
      headingDeg: 90,
    };
    const next = smoothGpsSample(previous, {
      latitude: 5.61,
      longitude: -0.17,
      reportedAt: 2_000,
      speedKph: 40,
      headingDeg: 95,
    }, 0.25);
    expect(next.latitude).toBeCloseTo(5.6025, 6);
    expect(next.longitude).toBeCloseTo(-0.1775, 6);
    expect(next.speedKph).toBe(25);
    expect(next.headingDeg).toBe(95);
  });

  it("requires consecutive inward samples before transport alerts fire", () => {
    let memory: GeofenceMemory = { state: "outside", previousDistanceMeters: null, consecutiveSamples: 0 };
    const first = nextGeofenceState(memory, 1_400, { minimumConsecutiveSamples: 2 });
    expect(first.state).toBe("outside");
    expect(first.notification).toBeNull();

    memory = first;
    const second = nextGeofenceState(memory, 1_300, { minimumConsecutiveSamples: 2 });
    expect(second.state).toBe("approaching");
    expect(second.notification).toBe("approaching");

    memory = second;
    const arrivingFirst = nextGeofenceState(memory, 250, { minimumConsecutiveSamples: 2 });
    const arrivingSecond = nextGeofenceState(arrivingFirst, 220, { minimumConsecutiveSamples: 2 });
    expect(arrivingSecond.state).toBe("arriving");
    expect(arrivingSecond.notification).toBe("arriving");

    const arrivedFirst = nextGeofenceState(arrivingSecond, 70, { minimumConsecutiveSamples: 2 });
    const arrivedSecond = nextGeofenceState(arrivedFirst, 55, { minimumConsecutiveSamples: 2 });
    expect(arrivedSecond.state).toBe("arrived");
    expect(arrivedSecond.notification).toBe("arrived");

    const passed = nextGeofenceState(arrivedSecond, 230, { minimumConsecutiveSamples: 2 });
    expect(passed.state).toBe("passed");
  });

  it("blends live and historical speeds into an ETA with uncertainty", () => {
    const eta = estimateEta({
      remainingMeters: 5_000,
      currentSpeedKph: 30,
      segmentHistoricalSpeedKph: 24,
      routeHistoricalSpeedKph: 26,
    });
    expect(eta.minutes).toBeGreaterThanOrEqual(10);
    expect(eta.minutes).toBeLessThanOrEqual(14);
    expect(eta.confidenceMinutes).toBeGreaterThanOrEqual(1);
    expect(eta.effectiveSpeedKph).toBeGreaterThan(20);
  });

  it("detects a route deviation from a route polyline", () => {
    const route = [
      { latitude: 5.6, longitude: -0.18 },
      { latitude: 5.61, longitude: -0.18 },
    ];
    expect(classifyRouteDeviation({ latitude: 5.605, longitude: -0.1802 }, route, 100).deviated).toBe(false);
    expect(classifyRouteDeviation({ latitude: 5.605, longitude: -0.17 }, route, 250).deviated).toBe(true);
  });

  it("generates deterministic simulated trips for repeatable transport tests", () => {
    const route = [
      { latitude: 5.6037, longitude: -0.187 },
      { latitude: 5.61, longitude: -0.18 },
      { latitude: 5.62, longitude: -0.175 },
    ];
    const a = simulateTransportTrip(route, { seed: 7, gpsNoiseMeters: 4, speedKph: 25 });
    const b = simulateTransportTrip(route, { seed: 7, gpsNoiseMeters: 4, speedKph: 25 });
    expect(a.length).toBeGreaterThan(2);
    expect(a).toEqual(b);
    expect(a[0].routeProgress).toBe(0);
    expect(a[a.length - 1].routeProgress).toBe(1);
  });
});
