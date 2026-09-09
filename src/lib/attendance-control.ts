import { z } from "zod";
import type { TenantDb } from "./db";
import { AppError } from "./errors";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const attendanceControlSchema = z.object({
  operatingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  methods: z.object({
    manualStudent: z.boolean(),
    qrStaff: z.boolean(),
    faceDevice: z.boolean(),
    fingerprintDevice: z.boolean(),
    cardDevice: z.boolean()
  }),
  staff: z.object({
    verificationOpenTime: hhmm,
    verificationCloseTime: hhmm,
    checkoutCloseTime: hhmm,
    qrRequireFace: z.boolean(),
    qrRequirePresence: z.boolean()
  }),
  student: z.object({
    verificationOpenTime: hhmm,
    verificationCloseTime: hhmm,
    manualRegisterCloseTime: hhmm
  }),
  qr: z.object({
    rotationSeconds: z.number().int().min(30).max(120),
    challengeTtlSeconds: z.number().int().min(35).max(180),
    maxDistanceMeters: z.number().int().min(25).max(1000)
  }),
  devices: z.object({
    onlineWindowSeconds: z.number().int().min(30).max(1800),
    maxBufferedAgeMinutes: z.number().int().min(0).max(1440)
  })
});

export type AttendanceControlConfig = z.infer<typeof attendanceControlSchema>;

export const DEFAULT_ATTENDANCE_CONTROL_CONFIG: AttendanceControlConfig = {
  operatingDays: [1, 2, 3, 4, 5],
  methods: {
    manualStudent: true,
    qrStaff: true,
    faceDevice: true,
    fingerprintDevice: true,
    cardDevice: true
  },
  staff: {
    verificationOpenTime: "05:00",
    verificationCloseTime: "11:00",
    checkoutCloseTime: "20:00",
    qrRequireFace: true,
    qrRequirePresence: true
  },
  student: {
    verificationOpenTime: "05:00",
    verificationCloseTime: "11:00",
    manualRegisterCloseTime: "18:00"
  },
  qr: {
    rotationSeconds: 60,
    challengeTtlSeconds: 70,
    maxDistanceMeters: 150
  },
  devices: {
    onlineWindowSeconds: 180,
    maxBufferedAgeMinutes: 5
  }
};

function mergeRecord(base: Record<string, unknown>, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = { ...base };
  for (const [key, next] of Object.entries(input)) {
    const current = output[key];
    output[key] = current && typeof current === "object" && !Array.isArray(current) && next && typeof next === "object" && !Array.isArray(next)
      ? mergeRecord(current as Record<string, unknown>, next)
      : next;
  }
  return output;
}

export function normalizeAttendanceControlConfig(value: unknown): AttendanceControlConfig {
  const merged = mergeRecord(DEFAULT_ATTENDANCE_CONTROL_CONFIG as unknown as Record<string, unknown>, value);
  const parsed = attendanceControlSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_ATTENDANCE_CONTROL_CONFIG;
}

export async function getAttendanceControlConfig(tx: TenantDb, schoolId: string) {
  const rows = await tx.$queryRaw<Array<{ config: unknown; updatedAt: Date }>>`
    SELECT "config", "updatedAt"
    FROM "AttendanceControlConfig"
    WHERE "schoolId" = ${schoolId}
    LIMIT 1
  `;
  return {
    config: normalizeAttendanceControlConfig(rows[0]?.config),
    updatedAt: rows[0]?.updatedAt ?? null
  };
}

export async function saveAttendanceControlConfig(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; config: AttendanceControlConfig }
) {
  const config = attendanceControlSchema.parse(input.config);
  await tx.$executeRaw`
    INSERT INTO "AttendanceControlConfig" ("schoolId", "config", "updatedBy", "updatedAt")
    VALUES (${input.schoolId}, ${JSON.stringify(config)}::jsonb, ${input.actorId}, CURRENT_TIMESTAMP)
    ON CONFLICT ("schoolId") DO UPDATE
    SET "config" = EXCLUDED."config", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = CURRENT_TIMESTAMP
  `;
  return config;
}

function minutesOf(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function localAttendanceClock(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayText = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(value);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayText);
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday
  };
}

function methodEnabled(config: AttendanceControlConfig, method: string) {
  if (method === "qr") return config.methods.qrStaff;
  if (method === "face") return config.methods.faceDevice;
  if (method === "fingerprint") return config.methods.fingerprintDevice;
  if (method === "card") return config.methods.cardDevice;
  if (method === "manual" || method === "school_register") return config.methods.manualStudent;
  return true;
}

export async function assertAttendanceVerificationWindow(
  tx: TenantDb,
  input: {
    schoolId: string;
    target: "student" | "staff";
    method: string;
    type: "in" | "out";
    timestamp: Date;
    receivedAt?: Date;
    automated?: boolean;
  }
) {
  const [control, settings] = await Promise.all([
    getAttendanceControlConfig(tx, input.schoolId),
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId }, select: { timezone: true } })
  ]);
  const config = control.config;
  const timezone = settings?.timezone || "Africa/Accra";

  if (!methodEnabled(config, input.method)) {
    throw new AppError("This attendance method is disabled by the school.", 403, "ATTENDANCE_METHOD_DISABLED");
  }

  // Manual school registers remain available for authorised corrections and
  // class-teacher decisions; the hard verification window applies to scan-based methods.
  if (input.method === "manual" || input.method === "school_register") {
    return { config, timezone, clock: localAttendanceClock(input.timestamp, timezone) };
  }

  const clock = localAttendanceClock(input.timestamp, timezone);
  if (!config.operatingDays.includes(clock.weekday)) {
    throw new AppError("Attendance verification is closed for this non-school day.", 409, "ATTENDANCE_DAY_CLOSED");
  }

  const rules = input.target === "staff" ? config.staff : config.student;
  const open = minutesOf(rules.verificationOpenTime);
  const close = input.target === "staff" && input.type === "out"
    ? minutesOf(config.staff.checkoutCloseTime)
    : minutesOf(rules.verificationCloseTime);

  if (clock.minutes < open) {
    throw new AppError(`Attendance verification opens at ${rules.verificationOpenTime}.`, 409, "ATTENDANCE_WINDOW_NOT_OPEN");
  }
  if (clock.minutes > close) {
    throw new AppError("Attendance verification is closed for today. It will reopen on the next configured school day.", 409, "ATTENDANCE_WINDOW_CLOSED");
  }

  if (input.automated && input.receivedAt && config.devices.maxBufferedAgeMinutes >= 0) {
    const ageMs = input.receivedAt.getTime() - input.timestamp.getTime();
    const maxAgeMs = config.devices.maxBufferedAgeMinutes * 60_000;
    if (ageMs < -5 * 60_000) {
      throw new AppError("Device capture time is too far in the future.", 400, "ATTENDANCE_TIMESTAMP_IN_FUTURE");
    }
    if (ageMs > maxAgeMs) {
      throw new AppError("This biometric scan arrived too late to be accepted automatically.", 409, "ATTENDANCE_DEVICE_EVENT_STALE");
    }
  }

  return { config, timezone, clock };
}

export function attendanceDeviceOnline(lastSeenAt: Date | null | undefined, lastHeartbeatAt: Date | null | undefined, onlineWindowSeconds: number, now = new Date()) {
  const latest = [lastSeenAt, lastHeartbeatAt].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latest) return false;
  return now.getTime() - latest.getTime() <= onlineWindowSeconds * 1000;
}
