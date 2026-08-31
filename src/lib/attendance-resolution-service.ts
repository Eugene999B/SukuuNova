import type { TenantDb } from "./db";
import { AppError, ForbiddenError } from "./errors";
import { hasPermission, requirePermission } from "./rbac";
import { appendSchoolAudit } from "./audit";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED", "LEFT_EARLY", "PENDING_REVIEW"] as const;
type AttendanceStatus = typeof STATUSES[number];

function status(value: string): AttendanceStatus {
  if ((STATUSES as readonly string[]).includes(value)) return value as AttendanceStatus;
  throw new AppError("Invalid attendance resolution status.", 400, "INVALID_STATUS");
}

function reason(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 500) throw new AppError("A review reason is required.", 400, "REASON_REQUIRED");
  return trimmed;
}

export async function listPendingAttendanceRecords(tx: TenantDb, input: { actorId: string; limit?: number }) {
  await requirePermission(tx, input.actorId, "attendance:review");
  return tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT r.*,
           s."name" AS "studentName",
           s."admissionNo",
           c."name" AS "className"
    FROM "AttendanceRecord" r
    INNER JOIN "Student" s ON s."id" = r."studentId" AND s."schoolId" = r."schoolId"
    LEFT JOIN "Class" c ON c."id" = r."classId" AND c."schoolId" = r."schoolId"
    WHERE r."schoolId" = current_setting('app.current_school_id', true)
      AND r."status" = 'PENDING_REVIEW'
    ORDER BY r."attendanceDate" DESC, r."updatedAt" DESC
    LIMIT ${Math.min(Math.max(input.limit ?? 100, 1), 250)}
  `;
}

export async function resolveAttendanceRecord(tx: TenantDb, input: {
  schoolId: string;
  actorId: string;
  recordId: string;
  status: string;
  reason: string;
}) {
  await requirePermission(tx, input.actorId, "attendance:review");
  const nextStatus = status(input.status);
  if (nextStatus === "PENDING_REVIEW") throw new ForbiddenError("A review must resolve to a final attendance status.");
  const reviewReason = reason(input.reason);

  const row = (await tx.$queryRaw<Array<{ id: string; status: string; studentId: string; attendanceDate: Date }>>`
    SELECT "id","status","studentId","attendanceDate"
    FROM "AttendanceRecord"
    WHERE "id"=${input.recordId}
      AND "schoolId"=${input.schoolId}
    FOR UPDATE
  `)[0];
  if (!row) throw new AppError("Attendance record not found.", 404, "NOT_FOUND");
  if (row.status !== "PENDING_REVIEW") throw new AppError("Attendance record is not awaiting review.", 409, "INVALID_STATE");

  const updated = (await tx.$queryRaw<Array<Record<string, unknown>>>`
    UPDATE "AttendanceRecord"
    SET "status"=${nextStatus},
        "resolvedBy"=${input.actorId},
        "resolvedAt"=NOW(),
        "resolutionReason"=${reviewReason},
        "reason"=${reviewReason},
        "updatedAt"=NOW()
    WHERE "id"=${input.recordId}
      AND "schoolId"=${input.schoolId}
    RETURNING *
  `)[0];

  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "attendance.review_resolved",
    entityType: "AttendanceRecord",
    entityId: input.recordId,
    before: { status: row.status, studentId: row.studentId, attendanceDate: row.attendanceDate },
    after: { status: nextStatus, reason: reviewReason }
  });

  return updated;
}
