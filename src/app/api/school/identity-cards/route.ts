import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { alignActiveIdentityCardValidity } from "@/lib/identity-card-policy";
import {
  getIdentityCardSettings,
  getIdentityCardsByScope,
  listIdentityCards,
  reissueIdentityCard,
  revokeIdentityCard,
  updateIdentityCardSettings,
  type IdentityCardScope,
} from "@/lib/identity-card-service";
import { buildIdentityCardBulkPdfV3, ID_CARD_PACK_LIMIT } from "@/lib/identity-card-print-v3";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("download"),
    scope: z.enum(["all", "students", "staff", "class", "selected"]),
    ids: z.array(z.string().min(1).max(100)).max(2000).optional(),
    classId: z.string().min(1).max(100).optional(),
    part: z.number().int().min(1).max(999).optional(),
    totalParts: z.number().int().min(1).max(999).optional(),
  }),
  z.object({ action: z.literal("configure"), validityMonths: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal("reissue"), cardId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("revoke"), cardId: z.string().min(1).max(100) }),
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const [school, classes, settings] = await Promise.all([
        tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } }),
        tx.class.findMany({ where: { schoolId: session.schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        getIdentityCardSettings(tx, session.schoolId),
      ]);
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      await alignActiveIdentityCardValidity(tx, session.schoolId, settings.validityMonths);
      return { school, classes, settings, cards: await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId) };
    });
    return NextResponse.json({ ok: true, printPackLimit: ID_CARD_PACK_LIMIT, ...result });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    if (input.action === "download" && input.scope === "selected" && !input.ids?.length) throw new AppError("Select at least one card to download.", 400, "NO_SELECTION");
    if (input.action === "download" && input.scope === "class" && !input.classId) throw new AppError("Choose a class to download.", 400, "CLASS_REQUIRED");

    // Keep tenant database work short. PDF generation is deliberately outside
    // this transaction so large Railway print jobs cannot hit Prisma P2028.
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      if (input.action === "configure") {
        return { kind: "json" as const, value: await updateIdentityCardSettings(tx, { schoolId: session.schoolId, actorId: session.userId, validityMonths: input.validityMonths }) };
      }
      const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      if (input.action === "reissue") return { kind: "json" as const, value: await reissueIdentityCard(tx, { schoolId: session.schoolId, actorId: session.userId, cardId: input.cardId }) };
      if (input.action === "revoke") return { kind: "json" as const, value: await revokeIdentityCard(tx, { schoolId: session.schoolId, actorId: session.userId, cardId: input.cardId }) };

      const scope: IdentityCardScope = input.scope === "students" ? "student" : input.scope;
      const cards = (await getIdentityCardsByScope(tx, session.schoolId, school.uniqueCode, scope, input.ids ?? [], session.userId, input.classId))
        .filter((card) => card.status === "active" && !card.isExpired);
      if (!cards.length) throw new AppError("No current identity cards matched this selection.", 404, "NO_CARDS");
      if (cards.length > ID_CARD_PACK_LIMIT) {
        throw new AppError(`This print request contains ${cards.length} cards. Download in packs of ${ID_CARD_PACK_LIMIT} or fewer; the ID-card workspace does this automatically.`, 413, "PRINT_PACK_TOO_LARGE");
      }
      return { kind: "print" as const, school, cards, scope: input.scope, part: input.part ?? 1, totalParts: input.totalParts ?? 1 };
    });

    if (result.kind === "json") return NextResponse.json({ ok: true, result: result.value });

    const pdf = await buildIdentityCardBulkPdfV3(result.cards, result.school, new URL(request.url).origin);
    const suffix = result.totalParts > 1 ? `-part-${result.part}-of-${result.totalParts}` : "";
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${schoolSafeFilename(result.school.name)}-${result.scope}-identity-cards${suffix}-a4-duplex.pdf"`,
        "cache-control": "private, no-store",
        "x-sukuunova-print-layout": "A4-duplex-long-edge-CR80-85.60x53.98mm",
        "x-sukuunova-card-count": String(result.cards.length),
        "x-sukuunova-print-part": `${result.part}/${result.totalParts}`,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

function schoolSafeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "school";
}
