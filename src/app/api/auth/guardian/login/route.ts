import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { GUARDIAN_COOKIE, createGuardianSessionToken } from "@/lib/guardian-auth";
import { sessionCookieOptions } from "@/lib/auth";
import { requestIp, recordLoginAttempt, clearLoginAttempts } from "@/lib/rate-limit";
import { authenticateGuardianUser } from "@/lib/login-service";

const schema = z.object({ schoolCode: z.string().trim().min(2).max(80), identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const key = await recordLoginAttempt("guardian-login:" + input.schoolCode.toLowerCase(), input.identifier, requestIp(request.headers));
    try {
      const guardian = await authenticateGuardianUser(input);
      await clearLoginAttempts(key);
      const response = NextResponse.json({ ok: true, guardian: { name: guardian.name, schoolName: guardian.schoolName, needsPasswordChange: guardian.needsPasswordChange } });
      response.cookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ kind: "guardian", userId: guardian.userId, guardianId: guardian.guardianId, schoolId: guardian.schoolId, name: guardian.name, schoolName: guardian.schoolName, needsPasswordChange: guardian.needsPasswordChange }), sessionCookieOptions());
      response.cookies.delete("sukuunova_school_session");
      return response;
    } catch (error) {
      throw error;
    }
  } catch (error) { return routeError(error); }
}
