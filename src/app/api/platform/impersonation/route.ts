import { NextResponse } from "next/server";
import { requirePlatformSession, getSchoolSession, SCHOOL_COOKIE } from "@/lib/auth";
import { routeError, UnauthorizedError } from "@/lib/errors";
import { endImpersonation } from "@/lib/phase4-service";
export async function POST(){try{const platform=await requirePlatformSession();const school=await getSchoolSession();if(!school?.impersonationId||!school.impersonatedByAdminId)throw new UnauthorizedError();if(school.impersonatedByAdminId!==platform.adminId)throw new UnauthorizedError();await endImpersonation(school.schoolId,school.impersonationId,platform.adminId);const response=NextResponse.json({ok:true});response.cookies.delete(SCHOOL_COOKIE);return response;}catch(error){return routeError(error);}}