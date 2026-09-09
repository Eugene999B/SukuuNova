import { describe, expect, it } from "vitest";
import {
  assertAutomatedAttendanceWindow,
  attendanceLateCutoffMinutes,
  attendancePolicySchema,
  automatedAttendanceWindow,
  type AttendancePolicyState,
} from "../src/lib/attendance-policy";

function policy(overrides: Partial<AttendancePolicyState> = {}): AttendancePolicyState {
  return {
    version: 1,
    configured: true,
    timezone: "Africa/Accra",
    expectedResumptionTime: "08:00",
    attendanceGraceMinutes: 10,
    staff: { opensAt: "06:00", closesAt: "09:30" },
    students: { opensAt: "06:00", closesAt: "10:00" },
    qr: {
      enabled: true,
      rotationSeconds: 60,
      requireFace: true,
      presenceMode: "network_or_location",
    },
    devices: { enabled: true, heartbeatOfflineSeconds: 180 },
    ...overrides,
  };
}

function capturedError(run: () => unknown) {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe("attendance policy", () => {
  it("keeps legacy schools unrestricted until leadership explicitly saves the new window policy", () => {
    const legacy = policy({ configured: false });
    expect(() => assertAutomatedAttendanceWindow(legacy, "staff", new Date("2026-09-09T12:00:00.000Z"))).not.toThrow();
  });

  it("allows automated verification inside the configured staff window", () => {
    const state = automatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T08:45:00.000Z"));
    expect(state).toMatchObject({ open: true, beforeOpen: false, afterClose: false });
    expect(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T08:45:00.000Z"))).not.toThrow();
  });

  it("rejects automated verification before opening time", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T05:59:00.000Z")));
    expect(error).toMatchObject({ code: "ATTENDANCE_WINDOW_NOT_OPEN", status: 409 });
  });

  it("rejects automated verification after closing time", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T09:31:00.000Z")));
    expect(error).toMatchObject({ code: "ATTENDANCE_WINDOW_CLOSED", status: 409 });
  });

  it("uses expected arrival plus grace minutes as the late cutoff", () => {
    expect(attendanceLateCutoffMinutes(policy())).toBe(8 * 60 + 10);
  });

  it("rejects impossible attendance windows during configuration", () => {
    const parsed = attendancePolicySchema.safeParse({
      version: 1,
      staff: { opensAt: "09:00", closesAt: "08:00" },
      students: { opensAt: "06:00", closesAt: "10:00" },
      qr: { enabled: true, rotationSeconds: 60, requireFace: false, presenceMode: "network" },
      devices: { enabled: true, heartbeatOfflineSeconds: 180 },
    });
    expect(parsed.success).toBe(false);
  });
});
