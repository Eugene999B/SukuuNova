import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { routeError, AppError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";
import { isPngSignatureDataUrl, mergeReportWorkflowConfig, readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

const schema = z.object({
  signatureDataUrl: z.string().max(480_000),
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
      if (trimmed) signatureProfiles[session.userId] = { dataUrl: trimmed, updatedAt: new Date().toISOString() };
      else delete signatureProfiles[session.userId];
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
        before: { hasSignature: Boolean(before), updatedAt: before?.updatedAt ?? null },
        after: { hasSignature: Boolean(after), updatedAt: after?.updatedAt ?? null },
      });
      return NextResponse.json({ ok: true, user, signature: after });
    });
  } catch (error) { return routeError(error); }
}
