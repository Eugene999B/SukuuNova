import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { libraryOverview, libraryAction } from "@/lib/library-service";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async tx => {
      await requireSchoolFeatureInTransaction(tx,session.schoolId,"library");
      return libraryOverview(tx,session.schoolId,session.userId);
    });
    return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return routeError(error);}
}
export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const body = await parseJson(request,z.record(z.string().min(1).max(100),z.unknown()));
    const result = await withTenant(session.schoolId,async tx=>{
      await requireSchoolFeatureInTransaction(tx,session.schoolId,"library");
      return libraryAction(tx,session.schoolId,session.userId,body);
    });
    return NextResponse.json({ok:true,result},{headers:{"Cache-Control":"no-store"}});
  } catch(error){return routeError(error);}
}
