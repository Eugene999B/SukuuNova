export type AttendanceDeviceProfile = {
  id: string;
  name: string;
  connectionMode: "direct" | "gateway";
  kinds: Array<"face" | "fingerprint" | "card">;
  summary: string;
  setup: string[];
};

/**
 * These are SukuuNova connection profiles, not a claim that every vendor model
 * speaks the SukuuNova API natively. Gateway profiles deliberately make the
 * adapter boundary visible so a school never buys hardware assuming plug-and-play
 * support that the vendor firmware does not provide.
 */
export const ATTENDANCE_DEVICE_PROFILES: AttendanceDeviceProfile[] = [
  {
    id: "sukuunova-direct",
    name: "SukuuNova Direct API terminal",
    connectionMode: "direct",
    kinds: ["face", "fingerprint", "card"],
    summary: "For a terminal or controller that can send signed HTTPS attendance events directly to SukuuNova.",
    setup: ["Register the terminal serial and attendance method.", "Copy the one-time device secret into the terminal/controller integration.", "Send a heartbeat when the unit starts and periodically while online.", "Send each scan to the signed attendance endpoint with a unique operation key."],
  },
  {
    id: "zkteco-gateway",
    name: "ZKTeco-compatible gateway",
    connectionMode: "gateway",
    kinds: ["face", "fingerprint", "card"],
    summary: "For ZKTeco-family hardware connected through a small local SukuuNova gateway/adapter.",
    setup: ["Connect the terminal to the school's LAN and vendor software/protocol.", "Run the SukuuNova gateway on an always-on local computer or supported edge box.", "Map the vendor user/enrollment IDs to SukuuNova people.", "The gateway signs and forwards heartbeats and scan events to SukuuNova."],
  },
  {
    id: "hikvision-gateway",
    name: "Hikvision-compatible gateway",
    connectionMode: "gateway",
    kinds: ["face", "card", "fingerprint"],
    summary: "For Hikvision attendance/access terminals whose events are translated by a local gateway.",
    setup: ["Enable the vendor's supported event/API integration on the local network.", "Register the device in SukuuNova using the terminal serial.", "Configure the local gateway with the one-time SukuuNova secret.", "Verify heartbeat, identity mapping and a test attendance event before going live."],
  },
  {
    id: "anviz-gateway",
    name: "Anviz-compatible gateway",
    connectionMode: "gateway",
    kinds: ["face", "fingerprint", "card"],
    summary: "For Anviz-family terminals connected through a local translation gateway.",
    setup: ["Connect the terminal and gateway on the school network.", "Register the terminal serial and method in SukuuNova.", "Map vendor enrollment identifiers to students/staff.", "Run a live scan test and confirm the device appears online before relying on it."],
  },
  {
    id: "generic-gateway",
    name: "Other biometric terminal via gateway",
    connectionMode: "gateway",
    kinds: ["face", "fingerprint", "card"],
    summary: "For other vendors where a supported local adapter can read events and forward the SukuuNova signed payload.",
    setup: ["Confirm the vendor exposes a supported SDK, API or event feed.", "Translate vendor identities into SukuuNova external IDs.", "Use the SukuuNova signing contract for heartbeat and attendance requests.", "Complete a controlled test before enabling the terminal for daily attendance."],
  },
];

export function attendanceDeviceProfile(id: string | undefined) {
  return ATTENDANCE_DEVICE_PROFILES.find((profile) => profile.id === id) ?? ATTENDANCE_DEVICE_PROFILES[0];
}
