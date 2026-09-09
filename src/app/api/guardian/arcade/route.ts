import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuardianSession } from "@/lib/guardian-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { ForbiddenError, routeError } from "@/lib/errors";
import { arcadeOverview, startArcadeRound, readArcadeRound, saveArcadeRound } from "@/lib/arcade-service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), studentId: z.string().min(1).max(100), game: z.enum(["math","word","logic"]), easier: z.boolean().optional() }),
  z.object({ action: z.literal("view"), roundId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("save"), roundId: z.string().min(1).max(100), answers: z.array(z.string().max(300)).length(5), finish: z.boolean() })
]);
const json = (data: unknown) => NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
async function session() {
  const current = await requireGuardianSession();
  if (current.needsPasswordChange) throw new ForbiddenError("Change your temporary password before opening Learning Arcade.");
  return current;
}
export async function GET(request: Request) {
  try {
    const current = await session();
    return json(await withTenant(current.schoolId, tx => arcadeOverview(tx, current, new URL(request.url).searchParams.get("studentId") || undefined)));
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  try {
    const current = await session(), input = await parseJson(request, schema);
    return json(await withTenant(current.schoolId, tx => input.action === "start" ? startArcadeRound(tx, current, input) : input.action === "view" ? readArcadeRound(tx, current, input.roundId) : saveArcadeRound(tx, current, input)));
  } catch (error) { return routeError(error); }
}
