import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [staff, students, faceEnrollments] = await Promise.all([
        tx.user.findMany({
          where: { schoolId: session.schoolId, status: { in: ["active", "pending"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, status: true }
        }),
        tx.student.findMany({
          where: { schoolId: session.schoolId, status: "active" },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            admissionNo: true,
            class: { select: { name: true, level: true } },
            guardians: {
              select: {
                isPrimary: true,
                guardian: { select: { id: true, name: true, phone: true } }
              },
              orderBy: { isPrimary: "desc" }
            }
          }
        }),
        tx.faceEnrollment.findMany({
          where: { schoolId: session.schoolId },
          select: { id: true, studentId: true, staffId: true, enrolledAt: true, consentByGuardianId: true }
        })
      ]);
      return { staff, students, faceEnrollments };
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return routeError(error);
  }
}
