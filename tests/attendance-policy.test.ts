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
    staff: { opensAt: "06:00", closesAt: "09:30", exitOpensAt: "14:00", exitClosesAt: "20:00" },
    students: { opensAt: "06:00", closesAt: "10:00", exitOpensAt: "13:00", exitClosesAt: "19:00" },
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
    expect(() => assertAutomatedAttendanceWindow(legacy, "staff", new Date("2026-09-09T23:30:00.000Z"), "out")).not.toThrow();
  });

  it("allows automated arrival verification inside the configured staff window", () => {
    const state = automatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T08:45:00.000Z"));
    expect(state).toMatchObject({ open: true, beforeOpen: false, afterClose: false, direction: "in" });
    expect(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T08:45:00.000Z"))).not.toThrow();
  });

  it("rejects automated arrival verification before opening time", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T05:59:00.000Z")));
    expect(error).toMatchObject({ code: "ATTENDANCE_WINDOW_NOT_OPEN", status: 409 });
  });

  it("rejects automated arrival verification after closing time", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T09:31:00.000Z")));
    expect(error).toMatchObject({ code: "ATTENDANCE_WINDOW_CLOSED", status: 409 });
  });

  it("allows staff departure verification inside the configured exit window", () => {
    const state = automatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T16:30:00.000Z"), "out");
    expect(state).toMatchObject({ open: true, beforeOpen: false, afterClose: false, direction: "out", opensAt: "14:00", closesAt: "20:00" });
    expect(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T16:30:00.000Z"), "out")).not.toThrow();
  });

  it("rejects staff departure verification before the exit window", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T13:59:00.000Z"), "out"));
    expect(error).toMatchObject({ code: "ATTENDANCE_EXIT_WINDOW_NOT_OPEN", status: 409 });
  });

  it("rejects staff departure verification after the exit window", () => {
    const error = capturedError(() => assertAutomatedAttendanceWindow(policy(), "staff", new Date("2026-09-09T20:01:00.000Z"), "out"));
    expect(error).toMatchObject({ code: "ATTENDANCE_EXIT_WINDOW_CLOSED", status: 409 });
  });

  it("uses expected arrival plus grace minutes as the late cutoff", () => {
    expect(attendanceLateCutoffMinutes(policy())).toBe(8 * 60 + 10);
  });

  it("accepts a legacy stored policy and fills departure defaults", () => {
    const parsed = attendancePolicySchema.parse({
      version: 1,
      staff: { opensAt: "06:00", closesAt: "09:30" },
      students: { opensAt: "06:00", closesAt: "10:00" },
      qr: { enabled: true, rotationSeconds: 60, requireFace: false, presenceMode: "network" },
      devices: { enabled: true, heartbeatOfflineSeconds: 180 },
    });
    expect(parsed.staff).toMatchObject({ exitOpensAt: "09:00", exitClosesAt: "23:00" });
    expect(parsed.students).toMatchObject({ exitOpensAt: "09:00", exitClosesAt: "23:00" });
  });

  it("rejects impossible attendance windows during configuration", () => {
    const parsed = attendancePolicySchema.safeParse({
      version: 1,
      staff: { opensAt: "09:00", closesAt: "08:00", exitOpensAt: "16:00", exitClosesAt: "15:00" },
      students: { opensAt: "06:00", closesAt: "10:00", exitOpensAt: "13:00", exitClosesAt: "19:00" },
      qr: { enabled: true, rotationSeconds: 60, requireFace: false, presenceMode: "network" },
      devices: { enabled: true, heartbeatOfflineSeconds: 180 },
    });
    expect(parsed.success).toBe(false);
  });
});
