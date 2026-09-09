import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { readReportWorkflowConfig } from "@/lib/report-card-workflow-config";
import type { SignatureVectorEvidence } from "@/lib/signature-vector";
import {
  signatureDocumentBindingSha256,
  verifySignatureDocumentBindingSha256,
  verifySignatureImageSha256,
  verifySignatureVectorSha256,
} from "@/lib/signature-integrity";

type SignatureSnapshot = {
  userId: string;
  role: string;
  name: string;
  signatureDataUrl?: string;
  signatureUpdatedAt?: string;
  signatureSha256?: string;
  signatureIntegrity?: "verified" | "legacy" | "failed";
  signatureVectorSha256?: string;
  signatureVectorIntegrity?: "verified" | "legacy" | "failed";
  documentBindingSha256?: string;
  documentBindingIntegrity?: "verified" | "legacy" | "failed" | "not_checked";
};

type SignatureDocumentContext = {
  schoolId: string;
  documentType: string;
  documentId: string;
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

function safeVector(evidence?: SignatureVectorEvidence, sha256?: string) {
  if (!evidence) return { sha256: undefined, integrity: undefined as SignatureSnapshot["signatureVectorIntegrity"] };
  if (!sha256) return { sha256: undefined, integrity: "legacy" as const };
  const verified = verifySignatureVectorSha256(evidence, sha256);
  return {
    sha256: verified ? sha256.toLowerCase() : undefined,
    integrity: verified ? "verified" as const : "failed" as const,
  };
}

function bindingFor(snapshot: SignatureSnapshot, context: SignatureDocumentContext) {
  if (!snapshot.signatureSha256 || !snapshot.signatureUpdatedAt) return undefined;
  return signatureDocumentBindingSha256({
    schoolId: context.schoolId,
    documentType: context.documentType,
    documentId: context.documentId,
    signerId: snapshot.userId,
    role: snapshot.role,
    signatureUpdatedAt: snapshot.signatureUpdatedAt,
    imageSha256: snapshot.signatureSha256,
    vectorSha256: snapshot.signatureVectorSha256,
  });
}

export function readSignatureSnapshot(value: Prisma.JsonValue | null | undefined, context?: SignatureDocumentContext): SignatureSnapshot[] {
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
    const rawVectorSha = typeof row.signatureVectorSha256 === "string" && /^[a-f0-9]{64}$/i.test(row.signatureVectorSha256)
      ? row.signatureVectorSha256.toLowerCase()
      : undefined;
    const vectorIntegrity = row.signatureVectorIntegrity === "verified" || row.signatureVectorIntegrity === "legacy" || row.signatureVectorIntegrity === "failed"
      ? row.signatureVectorIntegrity
      : undefined;
    const signatureUpdatedAt = typeof row.signatureUpdatedAt === "string" ? row.signatureUpdatedAt : undefined;
    const rawBinding = typeof row.documentBindingSha256 === "string" && /^[a-f0-9]{64}$/i.test(row.documentBindingSha256)
      ? row.documentBindingSha256.toLowerCase()
      : undefined;
    let documentBindingIntegrity: SignatureSnapshot["documentBindingIntegrity"] = rawBinding ? "not_checked" : "legacy";
    if (rawBinding && context && safe.sha256 && signatureUpdatedAt) {
      const verified = verifySignatureDocumentBindingSha256({
        schoolId: context.schoolId,
        documentType: context.documentType,
        documentId: context.documentId,
        signerId: userId,
        role,
        signatureUpdatedAt,
        imageSha256: safe.sha256,
        vectorSha256: rawVectorSha,
      }, rawBinding);
      documentBindingIntegrity = verified ? "verified" : "failed";
    }
    return [{
      userId,
      role,
      name,
      signatureDataUrl: documentBindingIntegrity === "failed" ? undefined : safe.dataUrl,
      signatureUpdatedAt,
      signatureSha256: safe.sha256,
      signatureIntegrity: safe.integrity,
      signatureVectorSha256: rawVectorSha,
      signatureVectorIntegrity: vectorIntegrity,
      documentBindingSha256: rawBinding,
      documentBindingIntegrity,
    }];
  });
}

export async function resolveCurrentReportSignatures(
  tx: TenantDb,
  schoolId: string,
  documentContext?: Omit<SignatureDocumentContext, "schoolId">,
): Promise<SignatureSnapshot[]> {
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
    const vector = safeVector(profile?.vectorEvidence, profile?.vectorSha256);
    const signatureUpdatedAt = profile?.updatedAt;
    const base: SignatureSnapshot = {
      userId: user.id,
      role: slot.role,
      name: user.name,
      signatureDataUrl: safe.dataUrl,
      signatureUpdatedAt,
      signatureSha256: safe.sha256,
      signatureIntegrity: safe.integrity,
      signatureVectorSha256: vector.sha256,
      signatureVectorIntegrity: vector.integrity,
    };
    if (documentContext) {
      const context = { schoolId, ...documentContext };
      const documentBindingSha256 = bindingFor(base, context);
      if (documentBindingSha256) {
        base.documentBindingSha256 = documentBindingSha256;
        base.documentBindingIntegrity = "verified";
      }
    }
    return [base];
  });
}

export async function signaturesForReport(tx: TenantDb, input: { schoolId: string; reportId: string }): Promise<SignatureSnapshot[]> {
  const report = await tx.reportCard.findFirst({
    where: { id: input.reportId, schoolId: input.schoolId },
    select: { status: true, calculationSnapshot: true },
  });
  if (!report) return [];
  const frozen = readSignatureSnapshot(report.calculationSnapshot, {
    schoolId: input.schoolId,
    documentType: "report_card",
    documentId: input.reportId,
  });
  if (frozen.length || report.status !== "draft") return frozen;
  return resolveCurrentReportSignatures(tx, input.schoolId);
}

export type { SignatureSnapshot };