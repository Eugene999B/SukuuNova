import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";

const bandSchema = z.object({ label: z.string().min(1).max(80), remark: z.string().max(240), min: z.number().int().min(1).max(500).optional(), max: z.number().int().min(1).max(500).optional() });
const schema = z.object({
  showOverallPosition: z.boolean(),
  showSubjectPosition: z.boolean().default(true),
  positionScope: z.enum(["class", "year_group"]),
  remarkSource: z.enum(["grade_band", "position_band"]),
  positionBandLabels: z.array(bandSchema).max(10),
  behaviorRatingFields: z.array(z.string().min(1).max(80)).max(10),
  promotionRule: z.enum(["manual", "pass_mark", "overall_position"]),
  positionPromotionCutoffPercent: z.number().int().min(1).max(100).default(50),
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const rows = await tx.$queryRawUnsafe<Array<{
        showOverallPosition:boolean; showSubjectPosition:boolean|null; positionScope:string; remarkSource:string; positionBandLabels:unknown; behaviorRatingFields:unknown; promotionRule:string; positionPromotionCutoffPercent:number|null;
      }>>(`SELECT "showOverallPosition",
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='showSubjectPosition') THEN "showSubjectPosition" ELSE true END AS "showSubjectPosition",
        "positionScope", "remarkSource", "positionBandLabels", "behaviorRatingFields", "promotionRule",
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='positionPromotionCutoffPercent') THEN "positionPromotionCutoffPercent" ELSE 50 END AS "positionPromotionCutoffPercent"
        FROM "SchoolSettings" WHERE "schoolId"=$1`, session.schoolId);
      const row = rows[0];
      return NextResponse.json({
        showOverallPosition: row?.showOverallPosition ?? true,
        showSubjectPosition: row?.showSubjectPosition ?? true,
        positionScope: row?.positionScope === "year_group" ? "year_group" : "class",
        remarkSource: row?.remarkSource === "position_band" ? "position_band" : "grade_band",
        positionBandLabels: Array.isArray(row?.positionBandLabels) ? row.positionBandLabels : [],
        behaviorRatingFields: Array.isArray(row?.behaviorRatingFields) ? row.behaviorRatingFields : [],
        promotionRule: row?.promotionRule === "pass_mark" || row?.promotionRule === "overall_position" ? row.promotionRule : "manual",
        positionPromotionCutoffPercent: row?.positionPromotionCutoffPercent ?? 50,
      });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    return await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      await tx.$executeRawUnsafe(`UPDATE "SchoolSettings" SET "showOverallPosition"=$1,"positionScope"=$2,"remarkSource"=$3,"positionBandLabels"=$4::jsonb,"behaviorRatingFields"=$5::jsonb,"promotionRule"=$6 WHERE "schoolId"=$7`, input.showOverallPosition, input.positionScope, input.remarkSource, JSON.stringify(input.positionBandLabels), JSON.stringify(input.behaviorRatingFields), input.promotionRule, session.schoolId);
      const hasExtended = await tx.$queryRawUnsafe<Array<{ count: string }>>(`SELECT COUNT(*)::text AS "count" FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name IN ('showSubjectPosition','positionPromotionCutoffPercent')`);
      if (Number(hasExtended[0]?.count ?? 0) >= 2) {
        await tx.$executeRawUnsafe(`UPDATE "SchoolSettings" SET "showSubjectPosition"=$1,"positionPromotionCutoffPercent"=$2 WHERE "schoolId"=$3`, input.showSubjectPosition, input.positionPromotionCutoffPercent, session.schoolId);
      }
      return NextResponse.json({ ok: true });
    });
  } catch (error) { return routeError(error); }
}
