import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PLATFORM_COOKIE,
  SCHOOL_COOKIE,
  createSchoolSessionToken,
  sessionCookieOptions
} from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { authenticateSchoolUser } from "@/lib/login-service";
import {
  clearLoginAttempts,
  recordLoginAttempt,
  requestIp
} from "@/lib/rate-limit";

const schema = z.object({
  uniqueCode: z.string().trim().min(2).max(80),
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const rateKey = await recordLoginAttempt(
      "school-login:" + input.uniqueCode.toLowerCase(),
      input.identifier,
      requestIp(request.headers)
    );
    const account = await authenticateSchoolUser(input);
    await clearLoginAttempts(rateKey);

    const response = NextResponse.json({
      ok: true,
      user: {
        name: account.name,
        schoolName: account.schoolName,
        portal: account.portal,
        roles: account.roles
      }
    });
    response.cookies.set(
      SCHOOL_COOKIE,
      await createSchoolSessionToken({
        kind: "school",
        userId: account.userId,
        schoolId: account.schoolId,
        name: account.name
      }),
      sessionCookieOptions()
    );
    response.cookies.delete(PLATFORM_COOKIE);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
