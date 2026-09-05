import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { AppShell } from "@/components/AppShell";
import ReportPolicySettings from "./ReportPolicySettings";

export default async function ReportPolicyPage() {
 const session = await requireSchoolSession();
 const data = await withTenant(session.schoolId, async (tx) => {
  await requirePermission(tx, session.userId, "settings:manage_school");
  const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name:true, uniqueCode:true } });
  const rows = await tx.$queryRawUnsafe<Array<{ showOverallPosition:boolean; showSubjectPosition:boolean|null; positionScope:string; remarkSource:string; positionBandLabels:unknown; behaviorRatingFields:unknown; promotionRule:string; positionPromotionCutoffPercent:number|null }>>(`SELECT "showOverallPosition",
   CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='showSubjectPosition') THEN "showSubjectPosition" ELSE true END AS "showSubjectPosition",
   "positionScope","remarkSource","positionBandLabels","behaviorRatingFields","promotionRule",
   CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SchoolSettings' AND column_name='positionPromotionCutoffPercent') THEN "positionPromotionCutoffPercent" ELSE 50 END AS "positionPromotionCutoffPercent"
   FROM "SchoolSettings" WHERE "schoolId"=$1`, session.schoolId);
  return { school, settings: rows[0] };
 });
 if (!data.school) return null;
 return <AppShell universe="school" title="Report Card Policy" subtitle="Choose how positions, remarks, conduct and promotion appear on official report cards." active="School Settings" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}><ReportPolicySettings initial={{ showOverallPosition:data.settings?.showOverallPosition??true, showSubjectPosition:data.settings?.showSubjectPosition??true, positionScope:data.settings?.positionScope==="year_group"?"year_group":"class", remarkSource:data.settings?.remarkSource==="position_band"?"position_band":"grade_band", positionBandLabels:Array.isArray(data.settings?.positionBandLabels)?data.settings?.positionBandLabels:[], behaviorRatingFields:Array.isArray(data.settings?.behaviorRatingFields)?data.settings?.behaviorRatingFields:[], promotionRule:data.settings?.promotionRule==="pass_mark"||data.settings?.promotionRule==="overall_position"?data.settings.promotionRule:"manual", positionPromotionCutoffPercent:data.settings?.positionPromotionCutoffPercent??50 }} /></AppShell>;
}
