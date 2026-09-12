import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { issuePortraitVerificationToken, verifyPortraitImage } from "@/lib/portrait-verification";

const schema = z.object({
  target: z.enum(["student", "staff"]),
  image: z.string().min(2_000).max(800_000),
});

const DEFERRED_VERIFICATION_CODES = new Set([
  "PORTRAIT_VERIFICATION_NOT_CONFIGURED",
  "PORTRAIT_VERIFICATION_UNAVAILABLE",
]);

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, input.target === "student" ? "students:write" : "users:write");
    });

    try {
      const verification = await verifyPortraitImage(input.image);
      const verificationToken = verification.ok
        ? issuePortraitVerificationToken({ schoolId: session.schoolId, target: input.target, image: input.image })
        : null;

      return NextResponse.json(
        { ...verification, captureReady: verification.ok, verificationDeferred: false, verificationToken },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch (error) {
      if (!(error instanceof AppError) || !DEFERRED_VERIFICATION_CODES.has(error.code)) throw error;

      // Registration must not depend on an optional external biometric service.
      // The signed token still binds this exact captured image to the school and
      // target. Biometric enrollment can perform authoritative face checks later
      // when the school's provider is configured and reachable.
      const verificationToken = issuePortraitVerificationToken({
        schoolId: session.schoolId,
        target: input.target,
        image: input.image,
      });
      return NextResponse.json(
        {
          ok: false,
          captureReady: true,
          biometricReady: false,
          verificationDeferred: true,
          message: "Photo captured. Biometric verification is deferred until the school's face service is configured and available.",
          checks: [],
          verificationToken,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    }
  } catch (error) {
    return routeError(error);
  }
}
