import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAccountLoginRateIdentity } from "@/lib/account-login-identity";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { GUARDIAN_COOKIE, createGuardianSessionToken } from "@/lib/guardian-auth";
import { PLATFORM_COOKIE, SCHOOL_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { assertAccountLoginAllowed, clearAccountLoginAttempts, recordFailedAccountLogin } from "@/lib/rate-limit";
import { authenticateGuardianUser } from "@/lib/login-service";

const schema = z.object({ schoolCode: z.string().trim().min(2).max(80), identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const scope = "guardian-login:" + input.schoolCode.toLowerCase();
    const rateIdentity = await resolveAccountLoginRateIdentity({ schoolCode: input.schoolCode, identifier: input.identifier, universe: "guardian" });
    await assertAccountLoginAllowed(scope, rateIdentity);

    let guardian;
    try {
      guardian = await authenticateGuardianUser(input);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        await recordFailedAccountLogin(scope, rateIdentity);
      }
      throw error;
    }

    await clearAccountLoginAttempts(scope, [rateIdentity]);
    const response = NextResponse.json({ ok: true, guardian: { name: guardian.name, schoolName: guardian.schoolName, needsPasswordChange: guardian.needsPasswordChange } });
    response.cookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ kind: "guardian", userId: guardian.userId, guardianId: guardian.guardianId, schoolId: guardian.schoolId, name: guardian.name, schoolName: guardian.schoolName, needsPasswordChange: guardian.needsPasswordChange }), sessionCookieOptions());
    response.cookies.delete(SCHOOL_COOKIE);
    response.cookies.delete(PLATFORM_COOKIE);
    return response;
  } catch (error) { return routeError(error); }
}
