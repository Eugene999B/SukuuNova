export const TRACKER_CERTIFICATION_VERSION = "tracker-cert-v1.0.0";

export type TrackerCertificationPacket = {
  receivedAt: Date | string | number;
  accepted: boolean;
  rejectionReason?: string | null;
};

export type TrackerCertificationThresholds = {
  minimumPackets?: number;
  minimumAcceptedRatio?: number;
  maximumHeartbeatGapSeconds?: number;
  maximumLatestPacketAgeSeconds?: number;
};

export type TrackerCertificationResult = {
  passed: boolean;
  acceptedPackets: number;
  rejectedPackets: number;
  acceptedRatio: number;
  maxHeartbeatGapSeconds: number | null;
  latestPacketAgeSeconds: number | null;
  failureReasons: string[];
  algorithmVersion: string;
};

function timestampMs(value: Date | string | number) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export function evaluateTrackerCertification(
  packets: TrackerCertificationPacket[],
  thresholds: TrackerCertificationThresholds = {},
  nowMs = Date.now(),
): TrackerCertificationResult {
  const minimumPackets = Math.max(3, thresholds.minimumPackets ?? 12);
  const minimumAcceptedRatio = Math.min(1, Math.max(0.5, thresholds.minimumAcceptedRatio ?? 0.9));
  const maximumHeartbeatGapSeconds = Math.max(5, thresholds.maximumHeartbeatGapSeconds ?? 90);
  const maximumLatestPacketAgeSeconds = Math.max(5, thresholds.maximumLatestPacketAgeSeconds ?? 120);

  const valid = packets
    .map((packet) => ({ ...packet, atMs: timestampMs(packet.receivedAt) }))
    .filter((packet) => Number.isFinite(packet.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  const acceptedPackets = valid.filter((packet) => packet.accepted).length;
  const rejectedPackets = valid.length - acceptedPackets;
  const acceptedRatio = valid.length ? acceptedPackets / valid.length : 0;
  let maxHeartbeatGapSeconds: number | null = null;
  for (let index = 1; index < valid.length; index += 1) {
    const gap = Math.max(0, (valid[index].atMs - valid[index - 1].atMs) / 1000);
    maxHeartbeatGapSeconds = maxHeartbeatGapSeconds == null ? gap : Math.max(maxHeartbeatGapSeconds, gap);
  }
  const latestPacketAgeSeconds = valid.length
    ? Math.max(0, (nowMs - valid[valid.length - 1].atMs) / 1000)
    : null;

  const failureReasons: string[] = [];
  if (valid.length < minimumPackets) failureReasons.push(`minimum_packets:${valid.length}/${minimumPackets}`);
  if (acceptedRatio < minimumAcceptedRatio) failureReasons.push(`accepted_ratio:${acceptedRatio.toFixed(3)}/${minimumAcceptedRatio.toFixed(3)}`);
  if (maxHeartbeatGapSeconds != null && maxHeartbeatGapSeconds > maximumHeartbeatGapSeconds) failureReasons.push(`heartbeat_gap:${maxHeartbeatGapSeconds.toFixed(1)}s/${maximumHeartbeatGapSeconds}s`);
  if (latestPacketAgeSeconds == null || latestPacketAgeSeconds > maximumLatestPacketAgeSeconds) failureReasons.push(`latest_packet_age:${latestPacketAgeSeconds == null ? "none" : latestPacketAgeSeconds.toFixed(1) + "s"}/${maximumLatestPacketAgeSeconds}s`);

  const protocolRejections = valid.filter((packet) => !packet.accepted && packet.rejectionReason && packet.rejectionReason !== "no_fix");
  if (protocolRejections.length > Math.max(1, Math.floor(valid.length * 0.1))) {
    failureReasons.push(`protocol_rejections:${protocolRejections.length}`);
  }

  return {
    passed: failureReasons.length === 0,
    acceptedPackets,
    rejectedPackets,
    acceptedRatio,
    maxHeartbeatGapSeconds,
    latestPacketAgeSeconds,
    failureReasons,
    algorithmVersion: TRACKER_CERTIFICATION_VERSION,
  };
}
