import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function staffAttendanceDashboard(
  tx: TenantDb,
  input: {
    actorId: string;
    startDate: Date;
    endDate: Date;
    staffId?: string;
  }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const days = Math.floor((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366) {
    throw new AppError("Attendance dashboard range must be 1-366 days.", 400, "INVALID_DATE_RANGE");
  }
  const staff = await tx.user.findMany({
    where: {
      status: "active",
      ...(input.staffId ? { id: input.staffId } : {}),
      userRoles: {
        some: { role: { name: { notIn: ["Parent", "Student"] } } }
      }
    },
    select: { id: true, name: true }
  });
  const staffIds = staff.map((row) => row.id);
  const events = await tx.attendanceEvent.findMany({
    where: {
      staffId: { in: staffIds },
      type: "in",
      attendanceDate: { gte: input.startDate, lte: input.endDate }
    },
    orderBy: { attendanceDate: "asc" }
  });
  const trends = [];
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(input.startDate);
    day.setUTCDate(day.getUTCDate() + offset);
    const rows = events.filter((event) => dayKey(event.attendanceDate) === dayKey(day));
    const present = new Set(rows.flatMap((event) => event.staffId ? [event.staffId] : [])).size;
    trends.push({
      date: dayKey(day),
      present,
      late: rows.filter((event) => event.isLate).length,
      absent: Math.max(0, staff.length - present)
    });
  }
  return {
    staff,
    totals: trends.reduce(
      (sum, row) => ({
        present: sum.present + row.present,
        late: sum.late + row.late,
        absent: sum.absent + row.absent
      }),
      { present: 0, late: 0, absent: 0 }
    ),
    trends
  };
}
