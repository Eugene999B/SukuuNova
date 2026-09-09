import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { assertAttendanceVerificationWindow, getAttendanceControlConfig } from "@/lib/attendance-control";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:staff_scan");
      const [{ config }] = await Promise.all([
        getAttendanceControlConfig(tx, session.schoolId),
        assertAttendanceVerificationWindow(tx, {
          schoolId: session.schoolId,
          target: "staff",
          method: "qr",
          type: "in",
          timestamp: new Date()
        })
      ]);
      const enrolled = await tx.faceEnrollment.findFirst({
        where: { schoolId: session.schoolId, staffId: session.userId },
        select: { id: true }
      });
      return {
        requireFace: config.staff.qrRequireFace,
        requirePresence: config.staff.qrRequirePresence,
        faceEnrolled: Boolean(enrolled),
        rotationSeconds: config.qr.rotationSeconds,
        closesAt: config.staff.verificationCloseTime
      };
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return routeError(error);
  }
}
