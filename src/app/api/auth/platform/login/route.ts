import { NextResponse } from "next/server";
import { z } from "zod";
import {
  PLATFORM_COOKIE,
  PLATFORM_SESSION_SECONDS,
  SCHOOL_COOKIE,
  createPlatformSessionToken,
  sessionCookieOptions
} from "@/lib/auth";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { authenticatePlatformAdmin } from "@/lib/login-service";
import {
  clearLoginAttempts,
  recordLoginAttempt,
  requestIp
} from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const rateKey = await recordLoginAttempt(
      "platform-login",
      input.email,
      requestIp(request.headers)
    );
    const account = await authenticatePlatformAdmin(input);
    await clearLoginAttempts(rateKey);

    const response = NextResponse.json({
      ok: true,
      admin: { name: account.name, role: account.role }
    });
    response.cookies.set(
      PLATFORM_COOKIE,
      await createPlatformSessionToken({
        kind: "platform",
        adminId: account.adminId,
        name: account.name,
        role: account.role
      }),
      sessionCookieOptions(PLATFORM_SESSION_SECONDS)
    );
    response.cookies.delete(SCHOOL_COOKIE);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
