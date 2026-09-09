import { NextResponse } from "next/server";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { assertSchoolActive } from "@/lib/auth";
import { parseJson } from "@/lib/http";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";
import { applyToPublicPosting, publicPosting, publicApplicationSchema, requirePublicPostingOpen } from "@/lib/recruitment-service";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";

type Context={params:Promise<{schoolId:string;token:string}>};
export async function GET(_request:Request,context:Context) {
 try {
  const {schoolId,token}=await context.params;await assertSchoolActive(schoolId);
  const posting=await withTenant(schoolId,async tx=>{
   await requireSchoolFeatureInTransaction(tx,schoolId,"recruitment");
   return requirePublicPostingOpen(await publicPosting(tx,schoolId,token));
  });
  return NextResponse.json({ok:true,posting},{headers:{"Cache-Control":"no-store"}});
 } catch(error){return routeError(error);}
}
export async function POST(request:Request,context:Context) {
 try {
  const {schoolId,token}=await context.params;await assertSchoolActive(schoolId);
  await recordLoginAttempt("public-job:"+schoolId+":"+token,requestIp(request.headers),requestIp(request.headers));
  const body=await parseJson(request,publicApplicationSchema);
  const result=await withTenant(schoolId,async tx=>{
   await requireSchoolFeatureInTransaction(tx,schoolId,"recruitment");
   return applyToPublicPosting(tx,schoolId,token,body);
  });
  return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
 } catch(error){return routeError(error);}
}
