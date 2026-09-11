import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { alignActiveIdentityCardValidity } from "@/lib/identity-card-policy";
import { buildIdentityCardSvg, type IdentityCardArtworkSide } from "@/lib/identity-card-output";
import { buildSingleIdentityCardPdf, getIdentityCardSettings, identityCardVerificationUrl, listIdentityCards } from "@/lib/identity-card-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSchoolSession();
    const { id: staffId } = await context.params;
    const requestUrl = new URL(request.url);
    const requestedFormat = requestUrl.searchParams.get("format") ?? "pdf";
    const requestedSide = requestUrl.searchParams.get("side") ?? "front";
    if (requestedFormat !== "pdf" && requestedFormat !== "svg") throw new AppError("Identity cards can be downloaded as PDF or SVG.", 400, "INVALID_CARD_FORMAT");
    if (requestedSide !== "front" && requestedSide !== "back") throw new AppError("Identity card side must be front or back.", 400, "INVALID_CARD_SIDE");
    const side = requestedSide as IdentityCardArtworkSide;

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

      if (requestedFormat === "svg") {
        const verifyUrl = identityCardVerificationUrl(requestUrl.origin, school.uniqueCode, card);
        return { kind: "svg" as const, svg: buildIdentityCardSvg(card, school, verifyUrl, side), staffName: staff.name, side };
      }

      const pdf = await buildSingleIdentityCardPdf(card, school, requestUrl.origin);
      return { kind: "pdf" as const, pdf, staffName: staff.name };
    });

    const safe = result.staffName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "staff";
    if (result.kind === "svg") {
      return new NextResponse(result.svg, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition": `attachment; filename="${safe}-identity-card-${result.side}.svg"`,
          "cache-control": "private, no-store",
        },
      });
    }

    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safe}-identity-card-front-back.pdf"`,
        "cache-control": "private, no-store",
        "x-sukuunova-id-card-sides": "front,back",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
