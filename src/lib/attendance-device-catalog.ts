export type AttendanceDeviceCatalogItem = {
  id: string;
  vendor: string;
  model: string;
  label: string;
  description: string;
  kind: "face" | "fingerprint" | "card";
  capabilities: Array<"face" | "fingerprint" | "card">;
  connectionMode: "https_push" | "vendor_bridge";
  readiness: "native" | "bridge_required";
  notes: string;
};

export const ATTENDANCE_DEVICE_CATALOG: AttendanceDeviceCatalogItem[] = [
  {
    id: "generic-face-https",
    vendor: "Generic",
    model: "HTTPS Face Terminal",
    label: "Generic HTTPS face-recognition terminal",
    description: "For terminals or a local gateway that can send a captured face image to SukuuNova over HTTPS.",
    kind: "face",
    capabilities: ["face"],
    connectionMode: "https_push",
    readiness: "native",
    notes: "The terminal/gateway sends authenticated attendance events to SukuuNova. Raw face templates are not stored in the device profile."
  },
  {
    id: "generic-fingerprint-https",
    vendor: "Generic",
    model: "HTTPS Fingerprint Terminal",
    label: "Generic HTTPS fingerprint terminal",
    description: "For fingerprint terminals or gateways that expose a stable enrolled-user ID for each scan.",
    kind: "fingerprint",
    capabilities: ["fingerprint"],
    connectionMode: "https_push",
    readiness: "native",
    notes: "SukuuNova stores only the external identity mapping, not raw fingerprint templates."
  },
  {
    id: "generic-card-https",
    vendor: "Generic",
    model: "HTTPS RFID/Card Terminal",
    label: "Generic HTTPS RFID/card terminal",
    description: "For RFID, NFC or card terminals that can push a stable external card/user identifier.",
    kind: "card",
    capabilities: ["card"],
    connectionMode: "https_push",
    readiness: "native",
    notes: "Use the device identity mapping screen to connect the terminal external ID to a learner or staff account."
  },
  {
    id: "zkteco-bridge",
    vendor: "ZKTeco",
    model: "ADMS / Push-family terminal",
    label: "ZKTeco attendance terminal",
    description: "Fingerprint, face or card terminals commonly deployed with ADMS/Push-style middleware.",
    kind: "fingerprint",
    capabilities: ["fingerprint", "face", "card"],
    connectionMode: "vendor_bridge",
    readiness: "bridge_required",
    notes: "Requires a SukuuNova/vendor bridge that translates the terminal protocol into the authenticated SukuuNova attendance event contract. Exact support depends on the purchased model and firmware."
  },
  {
    id: "hikvision-bridge",
    vendor: "Hikvision",
    model: "Access-control / MinMoe-family terminal",
    label: "Hikvision face/access terminal",
    description: "Face, card and access-control terminals that expose vendor event APIs.",
    kind: "face",
    capabilities: ["face", "card", "fingerprint"],
    connectionMode: "vendor_bridge",
    readiness: "bridge_required",
    notes: "Requires a model-specific gateway/ISAPI adapter. Choose this profile only after confirming the exact terminal model and event interface."
  },
  {
    id: "dahua-bridge",
    vendor: "Dahua",
    model: "ASI / access-control-family terminal",
    label: "Dahua biometric/access terminal",
    description: "Face/card/fingerprint access terminals that can publish attendance/access events through a vendor integration.",
    kind: "face",
    capabilities: ["face", "card", "fingerprint"],
    connectionMode: "vendor_bridge",
    readiness: "bridge_required",
    notes: "Requires a model-specific Dahua gateway adapter. The exact purchased model and firmware must be verified before deployment."
  }
];

export function attendanceDeviceCatalogItem(id: string) {
  return ATTENDANCE_DEVICE_CATALOG.find((item) => item.id === id);
}
