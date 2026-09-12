import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { ForbiddenError, routeError } from "@/lib/errors";
import { lockNovaMillionaireAnswer } from "@/lib/nova-millionaire-round-service";

const schema = z.object({
  roundId: z.string().min(1).max(100),
  questionIndex: z.number().int().min(0).max(49),
  answer: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  try {
    const session = await requireGuardianSession();
    if (session.needsPasswordChange) throw new ForbiddenError("Change your temporary password before opening Learning Arcade.");
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) => lockNovaMillionaireAnswer(tx, session, input));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
