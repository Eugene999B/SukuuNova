import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { parseJson } from "@/lib/http";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { issuePortraitVerificationToken, verifyPortraitImage } from "@/lib/portrait-verification";

const schema = z.object({
  target: z.enum(["student", "staff"]),
  image: z.string().min(2_000).max(800_000),
});

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = await parseJson(request, schema);
    await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, input.target === "student" ? "students:write" : "users:write");
    });

    const verification = await verifyPortraitImage(input.image);
    const verificationToken = verification.ok
      ? issuePortraitVerificationToken({ schoolId: session.schoolId, target: input.target, image: input.image })
      : null;

    return NextResponse.json(
      { ...verification, verificationToken },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
