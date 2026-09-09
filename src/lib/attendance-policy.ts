import { z } from "zod";
import type { TenantDb } from "./db";
import { AppError } from "./errors";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const attendancePolicySchema = z.object({
  version: z.literal(1).default(1),
  staff: z.object({
    opensAt: hhmm,
    closesAt: hhmm,
  }),
  students: z.object({
    opensAt: hhmm,
    closesAt: hhmm,
  }),
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
  if (minutes(value.staff.closesAt) <= minutes(value.staff.opensAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["staff", "closesAt"], message: "Staff closing time must be after opening time." });
  }
  if (minutes(value.students.closesAt) <= minutes(value.students.opensAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["students", "closesAt"], message: "Student closing time must be after opening time." });
  }
});

export type AttendancePolicy = z.infer<typeof attendancePolicySchema>;

export type AttendancePolicyState = AttendancePolicy & {
  timezone: string;
  expectedResumptionTime: string;
  attendanceGraceMinutes: number;
};

const DEFAULT_POLICY: AttendancePolicy = {
  version: 1,
  staff: { opensAt: "05:00", closesAt: "10:00" },
  students: { opensAt: "05:00", closesAt: "11:00" },
  qr: {
    enabled: true,
    rotationSeconds: 60,
    requireFace: false,
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

  const configured = policyFromAudit(revision?.after) ?? DEFAULT_POLICY;
  return {
    ...configured,
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
) {
  const window = target === "staff" ? policy.staff : policy.students;
  const current = localMinutes(timestamp, policy.timezone);
  const opens = hhmmMinutes(window.opensAt);
  const closes = hhmmMinutes(window.closesAt);
  return {
    open: current >= opens && current <= closes,
    beforeOpen: current < opens,
    afterClose: current > closes,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  };
}

export function assertAutomatedAttendanceWindow(
  policy: AttendancePolicyState,
  target: "staff" | "student",
  timestamp: Date,
) {
  const state = automatedAttendanceWindow(policy, target, timestamp);
  if (state.open) return state;
  if (state.beforeOpen) {
    throw new AppError(
      `Attendance verification opens at ${state.opensAt}.`,
      409,
      "ATTENDANCE_WINDOW_NOT_OPEN",
    );
  }
  throw new AppError(
    `Attendance verification closed at ${state.closesAt}. Use the authorised manual correction workflow if attendance must be corrected.`,
    409,
    "ATTENDANCE_WINDOW_CLOSED",
  );
}

export function attendanceLateCutoffMinutes(policy: AttendancePolicyState) {
  return hhmmMinutes(policy.expectedResumptionTime) + policy.attendanceGraceMinutes;
}

export function attendanceLocalMinutes(timestamp: Date, timezone: string) {
  return localMinutes(timestamp, timezone);
}
