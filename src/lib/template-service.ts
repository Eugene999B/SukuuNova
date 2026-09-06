import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";

export async function templateGallery(tx: TenantDb) {
  return tx.reportCardTemplate.findMany({
    orderBy: [{ schoolId: "asc" }, { name: "asc" }]
  });
}

export async function selectReportTemplate(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    templateId: string;
    primaryColor?: string;
    accentColor?: string;
    watermark?: string;
    logoDataUrl?: string;
  }
) {
  await requirePermission(tx, input.actorId, "templates:manage");
  const template = await tx.reportCardTemplate.findUnique({
    where: { id: input.templateId }
  });
  if (!template) throw new AppError("Report-card template not found.", 404, "NOT_FOUND");
  if (
    input.logoDataUrl &&
    (!/^data:image\/(png|jpeg|webp);base64,/.test(input.logoDataUrl) ||
      input.logoDataUrl.length > 1_500_000)
  ) {
    throw new AppError("Logo must be PNG, JPEG, or WebP and under 1 MB.", 400, "INVALID_LOGO");
  }
  const colors: Prisma.InputJsonValue = {
    primary: input.primaryColor ?? "#1d4ed8",
    accent: input.accentColor ?? "#dbeafe"
  };
  await tx.school.update({
    where: { id: input.schoolId },
    data: {
      logoUrl: input.logoDataUrl,
      brandColors: colors
    }
  });
  const settings = await tx.schoolSettings.update({
    where: { schoolId: input.schoolId },
    data: {
      reportCardTemplateId: template.id,
      reportCardWatermark: input.watermark?.trim()
    }
  });
  await appendSchoolAudit(tx, {
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "report_template.selected",
    entityType: "ReportCardTemplate",
    entityId: template.id,
    after: {
      templateId: template.id,
      branded: Boolean(input.logoDataUrl || input.primaryColor || input.accentColor),
      watermark: settings.reportCardWatermark
    }
  });
  return { template, settings };
}
