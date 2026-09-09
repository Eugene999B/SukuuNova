export type TransportHealthLocation = {
  reportedAt: Date | string | number;
  routeDeviation: boolean;
  routeDistanceMeters?: number | null;
  routeMatchConfidence?: number | null;
};

export type TransportIncidentSignal = {
  type: "route_deviation" | "tracker_offline" | "gps_degraded";
  active: boolean;
  severity: "info" | "warning" | "critical";
  evidence: Record<string, unknown>;
};

function timestampMs(value: Date | string | number) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export function evaluateTransportHealth(input: {
  locations: TransportHealthLocation[];
  nowMs?: number;
  offlineAfterSeconds?: number;
  criticalOfflineAfterSeconds?: number;
  deviationConsecutiveSamples?: number;
  degradedConsecutiveSamples?: number;
}): TransportIncidentSignal[] {
  const nowMs = input.nowMs ?? Date.now();
  const offlineAfterSeconds = Math.max(30, input.offlineAfterSeconds ?? 120);
  const criticalOfflineAfterSeconds = Math.max(offlineAfterSeconds, input.criticalOfflineAfterSeconds ?? 300);
  const deviationConsecutiveSamples = Math.max(2, input.deviationConsecutiveSamples ?? 3);
  const degradedConsecutiveSamples = Math.max(3, input.degradedConsecutiveSamples ?? 5);
  const locations = [...input.locations]
    .filter((location) => Number.isFinite(timestampMs(location.reportedAt)))
    .sort((a, b) => timestampMs(b.reportedAt) - timestampMs(a.reportedAt));

  const latest = locations[0];
  const latestAgeSeconds = latest ? Math.max(0, (nowMs - timestampMs(latest.reportedAt)) / 1000) : Number.POSITIVE_INFINITY;
  const trackerOffline = !latest || latestAgeSeconds > offlineAfterSeconds;
  const offlineSeverity: TransportIncidentSignal["severity"] = latestAgeSeconds > criticalOfflineAfterSeconds ? "critical" : "warning";

  const deviationWindow = locations.slice(0, deviationConsecutiveSamples);
  const routeDeviation = deviationWindow.length >= deviationConsecutiveSamples && deviationWindow.every((location) => location.routeDeviation);
  const maxDeviationMeters = deviationWindow.reduce((max, location) => Math.max(max, location.routeDistanceMeters ?? 0), 0);
  const routeSeverity: TransportIncidentSignal["severity"] = maxDeviationMeters >= 1_000 ? "critical" : "warning";

  const gpsWindow = locations.slice(0, degradedConsecutiveSamples);
  const lowConfidence = gpsWindow.length >= degradedConsecutiveSamples
    && gpsWindow.every((location) => location.routeMatchConfidence != null && location.routeMatchConfidence < 0.15);

  return [
    {
      type: "tracker_offline",
      active: trackerOffline,
      severity: offlineSeverity,
      evidence: { latestAgeSeconds: Number.isFinite(latestAgeSeconds) ? Math.round(latestAgeSeconds) : null, thresholdSeconds: offlineAfterSeconds },
    },
    {
      type: "route_deviation",
      active: routeDeviation,
      severity: routeSeverity,
      evidence: { consecutiveSamples: deviationWindow.length, maxDeviationMeters: Math.round(maxDeviationMeters) },
    },
    {
      type: "gps_degraded",
      active: lowConfidence,
      severity: "warning",
      evidence: {
        consecutiveSamples: gpsWindow.length,
        confidences: gpsWindow.map((location) => location.routeMatchConfidence),
      },
    },
  ];
}
