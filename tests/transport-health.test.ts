import { describe, expect, it } from "vitest";
import { evaluateTransportHealth } from "../src/lib/novacore/transport-health";

const now = Date.parse("2026-09-09T08:00:00.000Z");

function point(secondsAgo: number, overrides: Partial<{ routeDeviation: boolean; routeDistanceMeters: number; routeMatchConfidence: number }> = {}) {
  return {
    reportedAt: now - secondsAgo * 1000,
    routeDeviation: overrides.routeDeviation ?? false,
    routeDistanceMeters: overrides.routeDistanceMeters ?? 10,
    routeMatchConfidence: overrides.routeMatchConfidence ?? 0.9,
  };
}

describe("NovaCore operational transport health", () => {
  it("opens an offline signal only after the heartbeat threshold", () => {
    const healthy = evaluateTransportHealth({ locations: [point(30)], nowMs: now });
    expect(healthy.find((signal) => signal.type === "tracker_offline")?.active).toBe(false);

    const offline = evaluateTransportHealth({ locations: [point(180)], nowMs: now });
    expect(offline.find((signal) => signal.type === "tracker_offline")?.active).toBe(true);
    expect(offline.find((signal) => signal.type === "tracker_offline")?.severity).toBe("warning");
  });

  it("escalates a long tracker outage to critical", () => {
    const result = evaluateTransportHealth({ locations: [point(400)], nowMs: now });
    const signal = result.find((item) => item.type === "tracker_offline")!;
    expect(signal.active).toBe(true);
    expect(signal.severity).toBe("critical");
  });

  it("requires three consecutive route deviations", () => {
    const two = evaluateTransportHealth({
      locations: [point(5, { routeDeviation: true, routeDistanceMeters: 400 }), point(15, { routeDeviation: true, routeDistanceMeters: 450 }), point(25)],
      nowMs: now,
    });
    expect(two.find((signal) => signal.type === "route_deviation")?.active).toBe(false);

    const three = evaluateTransportHealth({
      locations: [
        point(5, { routeDeviation: true, routeDistanceMeters: 400 }),
        point(15, { routeDeviation: true, routeDistanceMeters: 500 }),
        point(25, { routeDeviation: true, routeDistanceMeters: 450 }),
      ],
      nowMs: now,
    });
    expect(three.find((signal) => signal.type === "route_deviation")?.active).toBe(true);
  });

  it("requires sustained low route-match confidence before GPS degraded is raised", () => {
    const locations = [5, 15, 25, 35, 45].map((seconds) => point(seconds, { routeMatchConfidence: 0.05 }));
    const result = evaluateTransportHealth({ locations, nowMs: now });
    expect(result.find((signal) => signal.type === "gps_degraded")?.active).toBe(true);
  });
});
