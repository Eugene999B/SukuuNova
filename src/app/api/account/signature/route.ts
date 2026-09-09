import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { isPngSignatureDataUrl, mergeReportWorkflowConfig, readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { signatureImageSha256, signatureVectorSha256 } from "@/lib/signature-integrity";
import { parseSignatureVectorEvidence } from "@/lib/signature-vector";

const schema = z.object({
  signatureDataUrl: z.string().max(480_000),
  vectorEvidence: z.unknown().optional().nullable(),
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      const [settings, user] = await Promise.all([
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true, reportCardTemplateId: true } }),
        tx.user.findFirst({ where: { id: session.userId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true } }),
      ]);
      if (!settings || !user) throw new AppError("Your school signature profile could not be loaded.", 404, "SIGNATURE_PROFILE_NOT_FOUND");
      const config = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
      return NextResponse.json({
        user,
        signature: config.signatureProfiles[session.userId] ?? null,
      }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = schema.parse(await request.json());
    const trimmed = input.signatureDataUrl.trim();
    if (trimmed && !isPngSignatureDataUrl(trimmed)) throw new AppError("Save a valid PNG signature created by the signing pad.", 400, "INVALID_SIGNATURE");
    const parsedVector = input.vectorEvidence == null ? null : parseSignatureVectorEvidence(input.vectorEvidence);
    if (input.vectorEvidence != null && !parsedVector) throw new AppError("The signature stroke evidence is invalid.", 400, "INVALID_SIGNATURE_VECTOR");
    if (!trimmed && parsedVector) throw new AppError("Stroke evidence cannot be saved without its signature image.", 400, "SIGNATURE_VECTOR_WITHOUT_IMAGE");
    const sha256 = trimmed ? signatureImageSha256(trimmed) : null;

    return await withTenant(session.schoolId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report-signature-profile:${session.schoolId}`}))`;
      const [settings, user] = await Promise.all([
        tx.schoolSettings.findUnique({ where: { schoolId: session.schoolId }, select: { reportCardConfig: true, reportCardTemplateId: true } }),
        tx.user.findFirst({ where: { id: session.userId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true } }),
      ]);
      if (!settings || !user) throw new AppError("Your school signature profile could not be loaded.", 404, "SIGNATURE_PROFILE_NOT_FOUND");
      const current = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
      const before = current.signatureProfiles[session.userId] ?? null;
      const signatureProfiles = { ...current.signatureProfiles };
      if (trimmed) {
        const vectorEvidence = input.vectorEvidence === undefined && before?.dataUrl === trimmed
          ? before.vectorEvidence
          : parsedVector ?? undefined;
        const vectorSha256 = vectorEvidence ? signatureVectorSha256(vectorEvidence) : undefined;
        signatureProfiles[session.userId] = {
          dataUrl: trimmed,
          updatedAt: new Date().toISOString(),
          sha256: sha256!,
          ...(vectorEvidence ? { vectorEvidence, vectorSha256 } : {}),
        };
      } else {
        delete signatureProfiles[session.userId];
      }
      const next = { ...current, signatureProfiles };
      await tx.schoolSettings.update({
        where: { schoolId: session.schoolId },
        data: { reportCardConfig: mergeReportWorkflowConfig(settings.reportCardConfig, next) },
      });
      const after = signatureProfiles[session.userId] ?? null;
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: trimmed ? "report_signature.updated" : "report_signature.cleared",
        entityType: "User",
        entityId: session.userId,
        before: {
          hasSignature: Boolean(before),
          updatedAt: before?.updatedAt ?? null,
          sha256: before?.sha256 ?? null,
          vectorSha256: before?.vectorSha256 ?? null,
          vectorPointCount: before?.vectorEvidence?.pointCount ?? null,
        },
        after: {
          hasSignature: Boolean(after),
          updatedAt: after?.updatedAt ?? null,
          sha256: after?.sha256 ?? null,
          vectorSha256: after?.vectorSha256 ?? null,
          vectorPointCount: after?.vectorEvidence?.pointCount ?? null,
        },
      });
      return NextResponse.json({ ok: true, user, signature: after });
    });
  } catch (error) { return routeError(error); }
}