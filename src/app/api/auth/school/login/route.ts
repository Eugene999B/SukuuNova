import { NextResponse } from "next/server";
import { z } from "zod";
import { PLATFORM_COOKIE, SCHOOL_COOKIE, createSchoolSessionTokenFromAuthorizationVersion, sessionCookieOptions } from "@/lib/auth";
import { GUARDIAN_COOKIE } from "@/lib/guardian-auth";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { authenticateSchoolUser } from "@/lib/login-service";
import { assertAccountLoginAllowed, clearAccountLoginAttempts, recordFailedAccountLogin } from "@/lib/rate-limit";

const schema = z.object({ uniqueCode: z.string().trim().min(2).max(80), identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const scope = "school-login:" + input.uniqueCode.toLowerCase();
    await assertAccountLoginAllowed(scope, input.identifier);

    let account;
    try {
      account = await authenticateSchoolUser(input);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        await recordFailedAccountLogin(scope, input.identifier);
      }
      throw error;
    }

    await clearAccountLoginAttempts(scope, [input.identifier]);
    const response = NextResponse.json({ ok: true, user: { name: account.name, schoolName: account.schoolName, portal: account.portal, roles: account.roles, needsPasswordChange: account.needsPasswordChange } });
    response.cookies.set(SCHOOL_COOKIE, await createSchoolSessionTokenFromAuthorizationVersion({ kind: "school", userId: account.userId, schoolId: account.schoolId, name: account.name }, account.authorizationVersion), sessionCookieOptions());
    response.cookies.delete(PLATFORM_COOKIE);
    response.cookies.delete(GUARDIAN_COOKIE);
    return response;
  } catch (error) {
    return routeError(error);
  }
}