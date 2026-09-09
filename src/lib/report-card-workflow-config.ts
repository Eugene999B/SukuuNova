import type { Prisma } from "@prisma/client";
import { reportCardThemeById } from "@/lib/report-card-themes";

export type SignatureProfile = {
  dataUrl: string;
  updatedAt: string;
  sha256?: string;
};

export type SignatureSlot = {
  userId: string;
  role: string;
};

export type ReportWorkflowConfig = {
  themeId: string;
  showStudentPhoto: boolean;
  showOverallPosition: boolean;
  showSubjectPosition: boolean;
  showAttendance: boolean;
  showPromotion: boolean;
  showClassTeacherRemark: boolean;
  showHeadteacherRemark: boolean;
  signatureSlots: SignatureSlot[];
  signatureProfiles: Record<string, SignatureProfile>;
  finalTermNumber: number;
  autoApplyPromotion: boolean;
  classProgression: Record<string, string>;
};

export function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function bool(value: Prisma.JsonValue | undefined, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringRecord(value: Prisma.JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => typeof item === "string" && item.trim() ? [[key, item.trim()]] : [])
  );
}

function readSignatureProfiles(value: Prisma.JsonValue | undefined): Record<string, SignatureProfile> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, SignatureProfile> = {};
  for (const [userId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, Prisma.JsonValue>;
    const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl : "";
    const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : "";
    const sha256 = typeof row.sha256 === "string" && /^[a-f0-9]{64}$/i.test(row.sha256) ? row.sha256.toLowerCase() : undefined;
    if (dataUrl.startsWith("data:image/png;base64,") && updatedAt) output[userId] = { dataUrl, updatedAt, ...(sha256 ? { sha256 } : {}) };
  }
  return output;
}

function readSignatureSlots(value: Prisma.JsonValue | undefined): SignatureSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, Prisma.JsonValue>;
    const userId = typeof row.userId === "string" ? row.userId.trim() : "";
    const role = typeof row.role === "string" ? row.role.trim() : "";
    return userId && role ? [{ userId, role }] : [];
  }).slice(0, 4);
}

export function readReportWorkflowConfig(value: Prisma.JsonValue | null | undefined, templateId?: string | null): ReportWorkflowConfig {
  const raw = jsonObject(value);
  const finalTermNumber = Number(raw.finalTermNumber);
  return {
    themeId: typeof raw.themeId === "string" ? reportCardThemeById(raw.themeId).id : reportCardThemeById(templateId).id,
    showStudentPhoto: bool(raw.showStudentPhoto, true),
    showOverallPosition: bool(raw.showOverallPosition, true),
    showSubjectPosition: bool(raw.showSubjectPosition, true),
    showAttendance: bool(raw.showAttendance, true),
    showPromotion: bool(raw.showPromotion, true),
    showClassTeacherRemark: bool(raw.showClassTeacherRemark, true),
    showHeadteacherRemark: bool(raw.showHeadteacherRemark, true),
    signatureSlots: readSignatureSlots(raw.signatureSlots),
    signatureProfiles: readSignatureProfiles(raw.signatureProfiles),
    finalTermNumber: Number.isInteger(finalTermNumber) && finalTermNumber >= 1 && finalTermNumber <= 6 ? finalTermNumber : 3,
    autoApplyPromotion: bool(raw.autoApplyPromotion, true),
    classProgression: stringRecord(raw.classProgression),
  };
}

export function mergeReportWorkflowConfig(
  current: Prisma.JsonValue | null | undefined,
  config: ReportWorkflowConfig,
): Prisma.InputJsonObject {
  const raw = jsonObject(current);
  return {
    ...raw,
    themeId: config.themeId,
    showStudentPhoto: config.showStudentPhoto,
    showOverallPosition: config.showOverallPosition,
    showSubjectPosition: config.showSubjectPosition,
    showAttendance: config.showAttendance,
    showPromotion: config.showPromotion,
    showClassTeacherRemark: config.showClassTeacherRemark,
    showHeadteacherRemark: config.showHeadteacherRemark,
    signatureSlots: config.signatureSlots,
    signatureProfiles: config.signatureProfiles,
    finalTermNumber: config.finalTermNumber,
    autoApplyPromotion: config.autoApplyPromotion,
    classProgression: config.classProgression,
    // Keep the legacy academic-engine switches aligned while the old setup UI remains available.
    includePosition: config.showOverallPosition,
    includeSubjectPosition: config.showSubjectPosition,
    includeAttendance: config.showAttendance,
    includeTeacherRemark: config.showClassTeacherRemark,
    includeHeadRemark: config.showHeadteacherRemark,
    includeSignatures: config.signatureSlots.length > 0,
  } as Prisma.InputJsonObject;
}

export function isPngSignatureDataUrl(value: string) {
  if (!value.startsWith("data:image/png;base64,")) return false;
  const payload = value.slice("data:image/png;base64,".length);
  if (!/^[A-Za-z0-9+/=]+$/.test(payload)) return false;
  // Roughly <= 350 KiB decoded; signatures should be tiny and transparent.
  return payload.length <= 480_000;
}
