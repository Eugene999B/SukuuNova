import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { getClassTeacherDesk, saveClassTeacherReportPreparation, submitClassTeacherPromotionDraft } from "@/lib/class-teacher-service";

const promotionSchema = z.object({
  action: z.literal("promotionRecommendation"),
  classId: z.string().min(1),
  termId: z.string().min(1),
  studentId: z.string().min(1),
  outcome: z.enum(["promoted","retained","graduated","transferred","withdrawn","deferred"]),
  targetPathwayId: z.string().min(1).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});
const preparationSchema = z.object({
  action: z.literal("reportPreparation"),
  classId: z.string().min(1),
  termId: z.string().min(1),
  studentId: z.string().min(1),
  remarks: z.string().max(800),
  traits: z.array(z.object({
    fieldKey: z.string().max(100),
    label: z.string().trim().min(1).max(100),
    value: z.string().trim().max(120),
    displayOrder: z.number().int().min(0).max(100).default(0),
  })).max(30),
});
const schema = z.discriminatedUnion("action", [promotionSchema, preparationSchema]);

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
    const result = await withTenant(session.schoolId, (tx) => input.action === "reportPreparation"
      ? saveClassTeacherReportPreparation(tx, { schoolId: session.schoolId, actorId: session.userId, ...input })
      : submitClassTeacherPromotionDraft(tx, { schoolId: session.schoolId, actorId: session.userId, ...input }));
    return NextResponse.json({ ok: true, result });
  } catch (error) { return routeError(error); }
}
