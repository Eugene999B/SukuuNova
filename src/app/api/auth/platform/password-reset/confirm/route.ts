import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { confirmPlatformPasswordReset } from "@/lib/password-reset";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(256)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    await recordLoginAttempt(
      "platform-password-reset-confirm",
      input.token.slice(0, 16),
      requestIp(request.headers)
    );
    await confirmPlatformPasswordReset(input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
