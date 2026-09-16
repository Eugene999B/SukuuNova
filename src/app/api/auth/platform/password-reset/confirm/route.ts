import { NextResponse } from "next/server";
import { z } from "zod";
import { routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { confirmPlatformPasswordReset } from "@/lib/password-reset";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email(),
  token: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(12).max(256)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    await recordLoginAttempt(
      "platform-password-reset-confirm",
      input.email.toLowerCase(),
      requestIp(request.headers)
    );
    await confirmPlatformPasswordReset(input);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
