import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { alignActiveIdentityCardValidity } from "@/lib/identity-card-policy";
import { buildSingleIdentityCardPdf, getIdentityCardSettings, listIdentityCards } from "@/lib/identity-card-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSchoolSession();
    const { id: staffId } = await context.params;
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const staff = await tx.user.findFirst({
        where: { id: staffId, schoolId: session.schoolId, status: "active" },
        select: { id: true, name: true },
      });
      if (!staff) throw new AppError("Staff member not found.", 404, "STAFF_NOT_FOUND");
      const school = await tx.school.findUnique({
        where: { id: session.schoolId },
        select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
      });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      const settings = await getIdentityCardSettings(tx, session.schoolId);
      await alignActiveIdentityCardValidity(tx, session.schoolId, settings.validityMonths);
      const card = (await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId))
        .find((item) => item.personType === "staff" && item.staffId === staff.id && item.status === "active" && !item.isExpired);
      if (!card) throw new AppError("No current identity card exists for this staff member.", 404, "NO_CURRENT_CARD");
      const pdf = await buildSingleIdentityCardPdf(card, school, new URL(request.url).origin);
      return { pdf, staffName: staff.name };
    });
    const safe = result.staffName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "staff";
    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safe}-identity-card-front-back.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
