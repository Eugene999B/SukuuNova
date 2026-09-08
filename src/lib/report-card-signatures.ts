import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";

type SignatureSnapshot = {
  userId: string;
  role: string;
  name: string;
  signatureDataUrl?: string;
  signatureUpdatedAt?: string;
};

function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

export function readSignatureSnapshot(value: Prisma.JsonValue | null | undefined): SignatureSnapshot[] {
  const snapshot = object(value);
  if (!Array.isArray(snapshot.signatureSnapshot)) return [];
  return snapshot.signatureSnapshot.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, Prisma.JsonValue>;
    const userId = typeof row.userId === "string" ? row.userId : "";
    const role = typeof row.role === "string" ? row.role : "";
    const name = typeof row.name === "string" ? row.name : "";
    if (!userId || !role || !name) return [];
    return [{
      userId,
      role,
      name,
      signatureDataUrl: typeof row.signatureDataUrl === "string" ? row.signatureDataUrl : undefined,
      signatureUpdatedAt: typeof row.signatureUpdatedAt === "string" ? row.signatureUpdatedAt : undefined,
    }];
  });
}

export async function resolveCurrentReportSignatures(tx: TenantDb, schoolId: string): Promise<SignatureSnapshot[]> {
  const settings = await tx.schoolSettings.findUnique({
    where: { schoolId },
    select: { reportCardConfig: true, reportCardTemplateId: true },
  });
  if (!settings) return [];
  const config = readReportWorkflowConfig(settings.reportCardConfig, settings.reportCardTemplateId);
  if (!config.signatureSlots.length) return [];
  const userIds = [...new Set(config.signatureSlots.map((slot) => slot.userId))];
  const users = await tx.user.findMany({
    where: { schoolId, id: { in: userIds }, status: "active" },
    select: { id: true, name: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  return config.signatureSlots.flatMap((slot) => {
    const user = byId.get(slot.userId);
    if (!user) return [];
    const profile = config.signatureProfiles[slot.userId];
    return [{
      userId: user.id,
      role: slot.role,
      name: user.name,
      signatureDataUrl: profile?.dataUrl,
      signatureUpdatedAt: profile?.updatedAt,
    }];
  });
}

export async function signaturesForReport(tx: TenantDb, input: { schoolId: string; reportId: string }): Promise<SignatureSnapshot[]> {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportId, schoolId: input.schoolId },
    select: { status: true, calculationSnapshot: true },
  });
  if (!report) return [];
  const frozen = readSignatureSnapshot(report.calculationSnapshot);
  if (frozen.length || report.status !== "draft") return frozen;
  return resolveCurrentReportSignatures(tx, input.schoolId);
}

export type { SignatureSnapshot };
