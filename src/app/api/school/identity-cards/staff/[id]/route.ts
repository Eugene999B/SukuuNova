import { NextResponse } from "next/server";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { listIdentityCards } from "@/lib/identity-card-service";
import {
  buildIdentityCardSinglePdfV2,
  buildIdentityCardSvgV2,
  type IdentityCardArtworkSide,
} from "@/lib/identity-card-print-v2";

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

    // Database work remains inside the tenant transaction, while rendering runs
    // afterward. This prevents slow PDF generation from exhausting Prisma's
    // interactive transaction timeout on Railway.
    const data = await withTenant(session.schoolId, async (tx) => {
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
      const card = (await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId))
        .find((item) => item.personType === "staff" && item.staffId === staff.id && item.status === "active" && !item.isExpired);
      if (!card) throw new AppError("No current identity card exists for this staff member.", 404, "NO_CURRENT_CARD");
      return { school, card, staffName: staff.name };
    });

    const safe = data.staffName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "staff";
    if (requestedFormat === "svg") {
      const svg = buildIdentityCardSvgV2(data.card, data.school, requestUrl.origin, side);
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition": `attachment; filename="${safe}-identity-card-${side}.svg"`,
          "cache-control": "private, no-store",
        },
      });
    }

    const pdf = await buildIdentityCardSinglePdfV2(data.card, data.school, requestUrl.origin);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safe}-identity-card-front-back.pdf"`,
        "cache-control": "private, no-store",
        "x-sukuunova-id-card-sides": "front,back",
        "x-sukuunova-print-size": "CR80-85.60x53.98mm",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
