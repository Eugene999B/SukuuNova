import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { buildIdentityCardPdf, listIdentityCards } from "@/lib/identity-card-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSchoolSession();
    const { id: studentId } = await context.params;
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const student = await tx.student.findFirst({
        where: { id: studentId, schoolId: session.schoolId },
        select: { id: true, name: true, admissionNo: true },
      });
      if (!student) throw new AppError("Student not found.", 404, "STUDENT_NOT_FOUND");

      const school = await tx.school.findUnique({
        where: { id: session.schoolId },
        select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
      });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");

      const card = (await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId))
        .find((item) => item.personType === "student" && item.studentId === student.id && item.status === "active" && !item.isExpired);
      if (!card) throw new AppError("No current identity card exists for this student.", 404, "NO_CURRENT_CARD");

      const pdf = await buildIdentityCardPdf([card], school, new URL(request.url).origin);
      return { pdf, studentName: student.name, admissionNo: student.admissionNo };
    });

    const safe = result.studentName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "student";
    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safe}-identity-card.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
