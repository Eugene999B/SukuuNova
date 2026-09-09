import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { parseJson } from "@/lib/http";
import { requirePermission } from "@/lib/rbac";
import { requireSchoolFeatureInTransaction } from "@/lib/feature-flags";
import { enrollFace } from "@/lib/face-service";

const schema = z.object({
  action: z.literal("enrollFaceFromProfile"),
  guardianId: z.string().min(1).max(100),
  consentConfirmed: z.literal(true),
});

function supportedProfilePortrait(value: string | null | undefined) {
  return Boolean(value && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolSession();
    const { id: studentId } = await params;
    const input = await parseJson(request, schema);
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "attendance:record");
      await requireSchoolFeatureInTransaction(tx, session.schoolId, "face_recognition");

      const student = await tx.student.findFirst({
        where: { id: studentId, schoolId: session.schoolId, status: "active" },
        select: {
          id: true,
          name: true,
          photoUrl: true,
          guardians: {
            where: { guardianId: input.guardianId },
            take: 1,
            select: { guardianId: true, relationship: true },
          },
        },
      });
      if (!student) throw new AppError("Active learner not found in this school.", 404, "NOT_FOUND");
      if (!student.guardians.length) throw new AppError("The selected guardian is not linked to this learner.", 400, "FACE_CONSENT_REQUIRED");
      if (!supportedProfilePortrait(student.photoUrl)) {
        throw new AppError("Capture a new professional learner portrait before face enrollment. Imported or missing profile images cannot be used as the biometric source.", 409, "PROFILE_PORTRAIT_REQUIRED");
      }

      const enrollment = await enrollFace(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        target: { studentId: student.id, consentByGuardianId: input.guardianId },
        image: student.photoUrl!,
      });
      return { enrollment, source: "student_profile_portrait", studentName: student.name };
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
