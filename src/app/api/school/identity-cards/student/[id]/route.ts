import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { listIdentityCards } from "@/lib/identity-card-service";
import { identityCardThemeKeyFromBrandColors } from "@/lib/identity-card-themes";
import { identityCardPublicOrigin } from "@/lib/identity-card-public-origin";
import {
  buildIdentityCardSinglePdfV4,
  buildIdentityCardSvgV4,
  type IdentityCardArtworkSide,
} from "@/lib/identity-card-print-v4";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSchoolSession();
    const { id: studentId } = await context.params;
    const requestUrl = new URL(request.url);
    const requestedFormat = requestUrl.searchParams.get("format") ?? "pdf";
    const requestedSide = requestUrl.searchParams.get("side") ?? "front";
    if (requestedFormat !== "pdf" && requestedFormat !== "svg") throw new AppError("Identity cards can be downloaded as PDF or SVG.", 400, "INVALID_CARD_FORMAT");
    if (requestedSide !== "front" && requestedSide !== "back") throw new AppError("Identity card side must be front or back.", 400, "INVALID_CARD_SIDE");
    const side = requestedSide as IdentityCardArtworkSide;

    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const student = await tx.student.findFirst({
        where: { id: studentId, schoolId: session.schoolId },
        select: { id: true, name: true },
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
      return { school, card, studentName: student.name };
    });

    const safe = data.studentName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "student";
    const themeKey = identityCardThemeKeyFromBrandColors(data.school.brandColors);
    const publicOrigin = identityCardPublicOrigin(requestUrl);
    if (requestedFormat === "svg") {
      const svg = buildIdentityCardSvgV4(data.card, data.school, publicOrigin, side);
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition": `attachment; filename="${safe}-identity-card-${side}.svg"`,
          "cache-control": "private, no-store",
          "x-sukuunova-card-theme": themeKey,
        },
      });
    }

    const pdf = await buildIdentityCardSinglePdfV4(data.card, data.school, publicOrigin);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safe}-identity-card-front-back.pdf"`,
        "cache-control": "private, no-store",
        "x-sukuunova-id-card-sides": "front,back",
        "x-sukuunova-print-size": "CR80-85.60x53.98mm",
        "x-sukuunova-card-theme": themeKey,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
