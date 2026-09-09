import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import {
  attendanceControlSchema,
  getAttendanceControlConfig,
  saveAttendanceControlConfig
} from "@/lib/attendance-control";

const patchSchema = z.object({
  config: attendanceControlSchema,
  expectedResumptionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  attendanceGraceMinutes: z.number().int().min(0).max(180),
  faceMatchThreshold: z.number().min(50).max(100)
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [control, settings, devices, identities, faceEnrollments] = await Promise.all([
        getAttendanceControlConfig(tx, session.schoolId),
        tx.schoolSettings.findUnique({
          where: { schoolId: session.schoolId },
          select: {
            expectedResumptionTime: true,
            attendanceGraceMinutes: true,
            faceMatchThreshold: true,
            timezone: true
          }
        }),
        tx.device.count({ where: { schoolId: session.schoolId, status: "active" } }),
        tx.deviceIdentity.count({ where: { schoolId: session.schoolId } }),
        tx.faceEnrollment.count({ where: { schoolId: session.schoolId } })
      ]);
      return {
        ...control,
        settings: {
          expectedResumptionTime: settings?.expectedResumptionTime || "07:30",
          attendanceGraceMinutes: settings?.attendanceGraceMinutes ?? 15,
          faceMatchThreshold: Number(settings?.faceMatchThreshold ?? 95),
          timezone: settings?.timezone || "Africa/Accra"
        },
        readiness: {
          activeDevices: devices,
          mappedHardwareIdentities: identities,
          faceEnrollments
        }
      };
    });
    return NextResponse.json(result);
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
      const beforeControl = await getAttendanceControlConfig(tx, session.schoolId);
      const beforeSettings = await tx.schoolSettings.findUnique({
        where: { schoolId: session.schoolId },
        select: {
          expectedResumptionTime: true,
          attendanceGraceMinutes: true,
          faceMatchThreshold: true
        }
      });

      const [config, settings] = await Promise.all([
        saveAttendanceControlConfig(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          config: input.config
        }),
        tx.schoolSettings.update({
          where: { schoolId: session.schoolId },
          data: {
            expectedResumptionTime: input.expectedResumptionTime,
            attendanceGraceMinutes: input.attendanceGraceMinutes,
            faceMatchThreshold: input.faceMatchThreshold
          },
          select: {
            expectedResumptionTime: true,
            attendanceGraceMinutes: true,
            faceMatchThreshold: true,
            timezone: true
          }
        })
      ]);

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "attendance.control.updated",
        entityType: "AttendanceControlConfig",
        entityId: session.schoolId,
        before: { config: beforeControl.config, settings: beforeSettings },
        after: { config, settings }
      });
      return { config, settings };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeError(error);
  }
}
