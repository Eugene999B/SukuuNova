import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { getClassTeacherDesk, submitClassTeacherPromotionDraft } from "@/lib/class-teacher-service";

const schema = z.object({
  action: z.literal("promotionRecommendation"),
  classId: z.string().min(1),
  termId: z.string().min(1),
  studentId: z.string().min(1),
  outcome: z.enum(["promoted","retained","graduated","transferred","withdrawn","deferred"]),
  targetPathwayId: z.string().min(1).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSchoolSession();
    const url = new URL(request.url);
    const result = await withTenant(session.schoolId, (tx) => getClassTeacherDesk(tx, {
      schoolId: session.schoolId,
      actorId: session.userId,
      classId: url.searchParams.get("classId"),
      termId: url.searchParams.get("termId"),
    }));
    return NextResponse.json(result);
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, (tx) => submitClassTeacherPromotionDraft(tx, { schoolId: session.schoolId, actorId: session.userId, ...input }));
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
