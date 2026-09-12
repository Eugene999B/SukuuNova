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
  mode: z.enum(["auto", "manual", "fallback"]).default("manual"),
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

      // Never let automatic capture become a timer that accepts arbitrary scenery.
      // Auto mode pauses until a real face-verification provider is available.
      if (input.mode === "auto") {
        return NextResponse.json(
          {
            ok: false,
            captureReady: false,
            biometricReady: false,
            verificationDeferred: true,
            message: "Automatic capture paused because face verification is unavailable. Keep the face clearly framed and use Capture now.",
            checks: [],
            verificationToken: null,
          },
          { headers: { "cache-control": "private, no-store" } },
        );
      }

      // Manual/device-camera capture remains available so ordinary registration is
      // never blocked by an optional biometric provider. A human intentionally
      // chooses the frame, and the signed token still binds the exact image to the
      // school and target. Biometric enrollment can validate it later.
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
          message: "Photo captured manually. Biometric verification is deferred until the school's face service is configured and available.",
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
