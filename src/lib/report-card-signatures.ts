import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import { verifySignatureImageSha256 } from "@/lib/signature-integrity";

type SignatureSnapshot = {
  userId: string;
  role: string;
  name: string;
  signatureDataUrl?: string;
  signatureUpdatedAt?: string;
  signatureSha256?: string;
  signatureIntegrity?: "verified" | "legacy" | "failed";
};

function object(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function safeSignature(dataUrl?: string, sha256?: string) {
  if (!dataUrl) return { dataUrl: undefined, sha256: undefined, integrity: undefined as SignatureSnapshot["signatureIntegrity"] };
  if (!sha256) return { dataUrl, sha256: undefined, integrity: "legacy" as const };
  const verified = verifySignatureImageSha256(dataUrl, sha256);
  return {
    dataUrl: verified ? dataUrl : undefined,
    sha256: verified ? sha256.toLowerCase() : undefined,
    integrity: verified ? "verified" as const : "failed" as const,
  };
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
    const rawDataUrl = typeof row.signatureDataUrl === "string" ? row.signatureDataUrl : undefined;
    const rawSha = typeof row.signatureSha256 === "string" && /^[a-f0-9]{64}$/i.test(row.signatureSha256) ? row.signatureSha256 : undefined;
    const safe = safeSignature(rawDataUrl, rawSha);
    return [{
      userId,
      role,
      name,
      signatureDataUrl: safe.dataUrl,
      signatureUpdatedAt: typeof row.signatureUpdatedAt === "string" ? row.signatureUpdatedAt : undefined,
      signatureSha256: safe.sha256,
      signatureIntegrity: safe.integrity,
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
    const safe = safeSignature(profile?.dataUrl, profile?.sha256);
    return [{
      userId: user.id,
      role: slot.role,
      name: user.name,
      signatureDataUrl: safe.dataUrl,
      signatureUpdatedAt: profile?.updatedAt,
      signatureSha256: safe.sha256,
      signatureIntegrity: safe.integrity,
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
