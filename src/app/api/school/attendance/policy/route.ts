import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { attendancePolicySchema, readAttendancePolicy } from "@/lib/attendance-policy";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const patchSchema = z.object({
  expectedResumptionTime: time,
  attendanceGraceMinutes: z.number().int().min(0).max(180),
  policy: attendancePolicySchema,
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      return readAttendancePolicy(tx, session.schoolId);
    });
    return NextResponse.json({ policy: result });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, patchSchema);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await readAttendancePolicy(tx, session.schoolId);

      await tx.schoolSettings.update({
        where: { schoolId: session.schoolId },
        data: {
          expectedResumptionTime: input.expectedResumptionTime,
          attendanceGraceMinutes: input.attendanceGraceMinutes,
        },
      });

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "attendance.policy.updated",
        entityType: "AttendancePolicy",
        entityId: session.schoolId,
        before,
        after: {
          policy: input.policy,
          expectedResumptionTime: input.expectedResumptionTime,
          attendanceGraceMinutes: input.attendanceGraceMinutes,
        },
      });

      return readAttendancePolicy(tx, session.schoolId);
    });

    return NextResponse.json({ ok: true, policy: result });
  } catch (error) {
    return routeError(error);
  }
}
