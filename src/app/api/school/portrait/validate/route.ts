import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { AppError, routeError } from "@/lib/errors";
import { hasPermission, requirePermission } from "@/lib/rbac";
import { issuePortraitVerificationToken, verifyPortraitImage } from "@/lib/portrait-verification";

const schema = z.object({
  target: z.enum(["student", "staff"]),
  image: z.string().min(2_000).max(800_000),
  mode: z.enum(["auto", "local_auto", "manual", "fallback"]).default("manual"),
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
      if (input.target === "student") {
        await requirePermission(tx, session.userId, "students:write");
        return;
      }
      if (!(await hasPermission(tx, session.userId, "users:write"))) {
        await requirePermission(tx, session.userId, "clinic:nurses_manage");
      }
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

      // Plain auto mode still requires an authoritative face-verification provider.
      // It must never degrade into a timer that signs arbitrary scenery.
      if (input.mode === "auto") {
        return NextResponse.json(
          {
            ok: false,
            captureReady: false,
            biometricReady: false,
            verificationDeferred: true,
            message: "Automatic cloud face verification is unavailable. SukuuNova will use the on-device face gate when supported, otherwise keep the camera open for manual capture.",
            checks: [],
            verificationToken: null,
          },
          { headers: { "cache-control": "private, no-store" } },
        );
      }

      // local_auto is intentionally NOT biometric verification. The browser-side
      // detector only controls when the UI chooses a frame; a client claim is not
      // trusted as identity, liveness or anti-spoof evidence. This server treats it
      // with the same trust level as an operator-selected manual frame and signs
      // only the exact image so registration can proceed without storing scenery.
      const verificationToken = issuePortraitVerificationToken({
        schoolId: session.schoolId,
        target: input.target,
        image: input.image,
      });
      const locallyGated = input.mode === "local_auto";
      return NextResponse.json(
        {
          ok: false,
          captureReady: true,
          biometricReady: false,
          verificationDeferred: true,
          localFaceGate: locallyGated,
          message: locallyGated
            ? "Portrait captured automatically after the on-device face-presence gate. Biometric identity verification is deferred until the school's face service is available."
            : "Photo captured manually. Biometric verification is deferred until the school's face service is configured and available.",
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
