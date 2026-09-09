import { z } from "zod";
import type { TenantDb } from "./db";
import { AppError } from "./errors";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const attendanceWindowSchema = z.object({
  opensAt: hhmm,
  closesAt: hhmm,
  exitOpensAt: hhmm.default("09:00"),
  exitClosesAt: hhmm.default("23:00"),
});

export const attendancePolicySchema = z.object({
  version: z.literal(1).default(1),
  staff: attendanceWindowSchema,
  students: attendanceWindowSchema,
  qr: z.object({
    enabled: z.boolean(),
    rotationSeconds: z.number().int().min(30).max(120),
    requireFace: z.boolean(),
    presenceMode: z.enum(["network_or_location", "location", "network"]),
  }),
  devices: z.object({
    enabled: z.boolean(),
    heartbeatOfflineSeconds: z.number().int().min(60).max(900),
  }),
}).superRefine((value, context) => {
  const minutes = (input: string) => {
    const [hour, minute] = input.split(":").map(Number);
    return hour * 60 + minute;
  };
  for (const target of ["staff", "students"] as const) {
    const window = value[target];
    if (minutes(window.closesAt) <= minutes(window.opensAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [target, "closesAt"], message: "Arrival closing time must be after opening time." });
    }
    if (minutes(window.exitClosesAt) <= minutes(window.exitOpensAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [target, "exitClosesAt"], message: "Departure closing time must be after departure opening time." });
    }
  }
});

export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;
export type AttendanceDirection = "in" | "out";

export type AttendancePolicyState = AttendancePolicy & {
  configured: boolean;
  timezone: string;
  expectedResumptionTime: string;
  attendanceGraceMinutes: number;
};

const DEFAULT_POLICY: AttendancePolicy = {
  version: 1,
  staff: { opensAt: "05:00", closesAt: "10:00", exitOpensAt: "09:00", exitClosesAt: "23:00" },
  students: { opensAt: "05:00", closesAt: "11:00", exitOpensAt: "09:00", exitClosesAt: "23:00" },
  qr: {
    enabled: true,
    rotationSeconds: 60,
    requireFace: true,
    presenceMode: "network_or_location",
  },
  devices: {
    enabled: true,
    heartbeatOfflineSeconds: 180,
  },
};

function policyFromAudit(after: unknown): AttendancePolicy | null {
  if (!after || typeof after !== "object") return null;
  const record = after as Record<string, unknown>;
  const candidate = record.policy ?? after;
  const parsed = attendancePolicySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export async function readAttendancePolicy(tx: TenantDb, schoolId: string): Promise<AttendancePolicyState> {
  const [settings, revision] = await Promise.all([
    tx.schoolSettings.findUnique({
      where: { schoolId },
      select: { timezone: true, expectedResumptionTime: true, attendanceGraceMinutes: true },
    }),
    tx.auditLogSchool.findFirst({
      where: {
        schoolId,
        action: "attendance.policy.updated",
        entityType: "AttendancePolicy",
        entityId: schoolId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { after: true },
    }),
  ]);

  const storedPolicy = policyFromAudit(revision?.after);
  return {
    ...(storedPolicy ?? DEFAULT_POLICY),
    configured: Boolean(storedPolicy),
    timezone: settings?.timezone || "Africa/Accra",
    expectedResumptionTime: settings?.expectedResumptionTime || "08:00",
    attendanceGraceMinutes: settings?.attendanceGraceMinutes ?? 0,
  };
}

function localMinutes(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function hhmmMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function automatedAttendanceWindow(
  policy: AttendancePolicyState,
  target: "staff" | "student",
  timestamp: Date,
  direction: AttendanceDirection = "in",
) {
  const window = target === "staff" ? policy.staff : policy.students;
  const current = localMinutes(timestamp, policy.timezone);
  const opensAt = direction === "out" ? window.exitOpensAt : window.opensAt;
  const closesAt = direction === "out" ? window.exitClosesAt : window.closesAt;
  const opens = hhmmMinutes(opensAt);
  const closes = hhmmMinutes(closesAt);
  return {
    open: current >= opens && current <= closes,
    beforeOpen: current < opens,
    afterClose: current > closes,
    opensAt,
    closesAt,
    direction,
  };
}

export function assertAutomatedAttendanceWindow(
  policy: AttendancePolicyState,
  target: "staff" | "student",
  timestamp: Date,
  direction: AttendanceDirection = "in",
) {
  // Existing schools keep their historical behaviour until leadership explicitly
  // saves the policy. Once configured, entry and departure windows are authoritative.
  if (!policy.configured) return automatedAttendanceWindow(policy, target, timestamp, direction);
  const state = automatedAttendanceWindow(policy, target, timestamp, direction);
  if (state.open) return state;
  const label = direction === "out" ? "Departure verification" : "Attendance verification";
  if (state.beforeOpen) {
    throw new AppError(
      `${label} opens at ${state.opensAt}.`,
      409,
      direction === "out" ? "ATTENDANCE_EXIT_WINDOW_NOT_OPEN" : "ATTENDANCE_WINDOW_NOT_OPEN",
    );
  }
  throw new AppError(
    `${label} closed at ${state.closesAt}. Use the authorised manual correction workflow if attendance must be corrected.`,
    409,
    direction === "out" ? "ATTENDANCE_EXIT_WINDOW_CLOSED" : "ATTENDANCE_WINDOW_CLOSED",
  );
}

export function attendanceLateCutoffMinutes(policy: AttendancePolicyState) {
  return hhmmMinutes(policy.expectedResumptionTime) + policy.attendanceGraceMinutes;
}

export function attendanceLocalMinutes(timestamp: Date, timezone: string) {
  return localMinutes(timestamp, timezone);
}
