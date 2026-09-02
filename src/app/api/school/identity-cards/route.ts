import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { buildIdentityCardPdf, getIdentityCardsByScope, listIdentityCards, reissueIdentityCard, revokeIdentityCard, type IdentityCardScope } from "@/lib/identity-card-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("download"), scope: z.enum(["all", "students", "staff", "selected"]), ids: z.array(z.string().min(1).max(100)).max(2000).optional() }),
  z.object({ action: z.literal("reissue"), cardId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("revoke"), cardId: z.string().min(1).max(100) })
]);

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      return { school, cards: await listIdentityCards(tx, session.schoolId, school.uniqueCode, session.userId) };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    if (input.action === "download" && input.scope === "selected" && !(input.ids?.length)) throw new AppError("Select at least one card to download.", 400, "NO_SELECTION");
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "identity_cards:manage");
      const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true } });
      if (!school) throw new AppError("School not found.", 404, "SCHOOL_NOT_FOUND");
      if (input.action === "reissue") return { kind: "json" as const, value: await reissueIdentityCard(tx, { schoolId: session.schoolId, actorId: session.userId, cardId: input.cardId }) };
      if (input.action === "revoke") return { kind: "json" as const, value: await revokeIdentityCard(tx, { schoolId: session.schoolId, actorId: session.userId, cardId: input.cardId }) };
      const cards = await getIdentityCardsByScope(tx, session.schoolId, school.uniqueCode, input.scope as IdentityCardScope, input.ids ?? [], session.userId);
      if (!cards.length) throw new AppError("No identity cards matched this selection.", 404, "NO_CARDS");
      return { kind: "pdf" as const, pdf: await buildIdentityCardPdf(cards, school, new URL(request.url).origin) };
    });
    if (result.kind === "json") return NextResponse.json({ ok: true, result: result.value });
    return new NextResponse(result.pdf, { status: 200, headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${schoolSafeFilename(session.schoolId)}-identity-cards.pdf"`, "cache-control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}

function schoolSafeFilename(value: string) { return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "school"; }
