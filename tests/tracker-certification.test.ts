import { describe, expect, it } from "vitest";
import { evaluateTrackerCertification, type TrackerCertificationPacket } from "../src/lib/novacore/tracker-certification";

function packets(count: number, startMs: number, intervalMs = 10_000): TrackerCertificationPacket[] {
  return Array.from({ length: count }, (_, index) => ({
    receivedAt: startMs + index * intervalMs,
    accepted: true,
    rejectionReason: null,
  }));
}

describe("NovaCore tracker certification", () => {
  it("passes a fresh stable packet stream", () => {
    const start = Date.parse("2026-09-09T07:00:00.000Z");
    const evidence = packets(12, start);
    const now = start + 11 * 10_000 + 5_000;
    const result = evaluateTrackerCertification(evidence, {}, now);
    expect(result.passed).toBe(true);
    expect(result.acceptedPackets).toBe(12);
    expect(result.rejectedPackets).toBe(0);
    expect(result.maxHeartbeatGapSeconds).toBe(10);
    expect(result.latestPacketAgeSeconds).toBe(5);
  });

  it("does not certify before enough packets arrive", () => {
    const start = Date.parse("2026-09-09T07:00:00.000Z");
    const result = evaluateTrackerCertification(packets(6, start), {}, start + 55_000);
    expect(result.passed).toBe(false);
    expect(result.failureReasons.some((reason) => reason.startsWith("minimum_packets:"))).toBe(true);
  });

  it("fails a tracker with a long telemetry gap", () => {
    const start = Date.parse("2026-09-09T07:00:00.000Z");
    const evidence = packets(6, start).concat(packets(6, start + 300_000));
    const result = evaluateTrackerCertification(evidence, {}, start + 355_000);
    expect(result.passed).toBe(false);
    expect(result.failureReasons.some((reason) => reason.startsWith("heartbeat_gap:"))).toBe(true);
  });

  it("fails excessive invalid protocol/location evidence", () => {
    const start = Date.parse("2026-09-09T07:00:00.000Z");
    const evidence = packets(12, start);
    evidence[2] = { ...evidence[2], accepted: false, rejectionReason: "implausible_jump" };
    evidence[5] = { ...evidence[5], accepted: false, rejectionReason: "invalid_coordinates" };
    const result = evaluateTrackerCertification(evidence, {}, start + 115_000);
    expect(result.passed).toBe(false);
    expect(result.acceptedRatio).toBeLessThan(0.9);
    expect(result.failureReasons.some((reason) => reason.startsWith("protocol_rejections:"))).toBe(true);
  });

  it("fails stale evidence even when historical packets were good", () => {
    const start = Date.parse("2026-09-09T07:00:00.000Z");
    const result = evaluateTrackerCertification(packets(12, start), {}, start + 11 * 10_000 + 180_000);
    expect(result.passed).toBe(false);
    expect(result.failureReasons.some((reason) => reason.startsWith("latest_packet_age:"))).toBe(true);
  });
});
