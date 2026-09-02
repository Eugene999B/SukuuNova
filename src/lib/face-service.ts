import type { TenantDb } from "./db";
import { appendSchoolAudit } from "./audit";
import { AppError } from "./errors";
import { requirePermission } from "./rbac";
import { encryptEmbeddingRef } from "./face-crypto";
import {
  awsFaceProvider,
  type FaceProvider
} from "./face-provider";
import { recordAttendance } from "./attendance-service";

type FaceTarget =
  | { studentId: string; staffId?: never; consentByGuardianId: string }
  | { staffId: string; studentId?: never; consentByGuardianId?: never };

function imageBytes(dataUrlOrBase64: string) {
  const dataUrlMatch = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrlOrBase64.trim());
  const raw = dataUrlMatch ? dataUrlMatch[2] : dataUrlOrBase64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new AppError("Face capture must be a valid base64-encoded image under 5 MB.", 400, "INVALID_FACE_CAPTURE");
  }
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 100 || bytes.length > 5 * 1024 * 1024) {
    throw new AppError("Face capture must be a valid image under 5 MB.", 400, "INVALID_FACE_CAPTURE");
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    throw new AppError("Face capture must be a supported JPEG, PNG, or WebP image.", 400, "INVALID_FACE_CAPTURE");
  }
  return bytes;
}

function collectionId(schoolId: string) {
  return "sukuunova-" + schoolId.replace(/[^a-zA-Z0-9_.-]/g, "");
}

export async function enrollFace(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; target: FaceTarget; image: string },
  provider: FaceProvider = awsFaceProvider
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  if (input.target.studentId) {
    const consent = await tx.studentGuardian.findFirst({
      where: { schoolId: input.schoolId, studentId: input.target.studentId, guardianId: input.target.consentByGuardianId },
      select: { guardianId: true }
    });
    if (!consent) throw new AppError("Student face enrollment requires consent from a guardian linked to that student.", 400, "FACE_CONSENT_REQUIRED");
  } else {
    const staff = await tx.user.findFirst({ where: { id: input.target.staffId, schoolId: input.schoolId, status: "active" }, select: { id: true } });
    if (!staff) throw new AppError("Staff account not found in this school.", 404, "NOT_FOUND");
  }

  const externalId = input.target.studentId ? "student:" + input.target.studentId : "staff:" + input.target.staffId;
  const indexed = await provider.indexFace({ collectionId: collectionId(input.schoolId), externalId, imageBytes: imageBytes(input.image) });
  const embeddingRef = encryptEmbeddingRef(indexed.faceId);
  const existing = await tx.faceEnrollment.findFirst({
    where: input.target.studentId ? { schoolId: input.schoolId, studentId: input.target.studentId } : { schoolId: input.schoolId, staffId: input.target.staffId }
  });
  const enrollment = existing
    ? await tx.faceEnrollment.update({ where: { id: existing.id }, data: { embeddingRef, enrolledAt: new Date(), consentByGuardianId: input.target.studentId ? input.target.consentByGuardianId : null } })
    : await tx.faceEnrollment.create({ data: { schoolId: input.schoolId, studentId: input.target.studentId, staffId: input.target.staffId, embeddingRef, consentByGuardianId: input.target.studentId ? input.target.consentByGuardianId : undefined } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "face.enrolled", entityType: "FaceEnrollment", entityId: enrollment.id, after: { studentId: enrollment.studentId, staffId: enrollment.staffId, provider: "aws-rekognition", referenceEncrypted: true } });
  return { id: enrollment.id, studentId: enrollment.studentId, staffId: enrollment.staffId, enrolledAt: enrollment.enrolledAt };
}

export async function matchFaceAttendance(
  tx: TenantDb,
  input: { schoolId: string; actorId?: string; image: string; deviceId?: string; type: "in" | "out"; deviceAuthenticated?: boolean; periodId?: string; timestamp?: Date },
  provider: FaceProvider = awsFaceProvider
) {
  if (!input.deviceAuthenticated) {
    if (!input.actorId) throw new AppError("A staff actor is required for face attendance.", 401, "ACTOR_REQUIRED");
    await requirePermission(tx, input.actorId, "attendance:record");
  } else if (!input.deviceId) {
    throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");
  }
  const [settings, match] = await Promise.all([
    tx.schoolSettings.findUnique({ where: { schoolId: input.schoolId } }),
    provider.searchFace({ collectionId: collectionId(input.schoolId), imageBytes: imageBytes(input.image) })
  ]);
  if (!settings) throw new AppError("School settings not found.", 404, "NOT_FOUND");

  const [kind, candidateId] = match.externalId?.split(":") ?? [];
  const enrollment = candidateId
    ? await tx.faceEnrollment.findFirst({
        where: kind === "student" ? { schoolId: input.schoolId, studentId: candidateId } : kind === "staff" ? { schoolId: input.schoolId, staffId: candidateId } : { id: "__invalid__" },
        select: { id: true, studentId: true, staffId: true }
      })
    : null;
  const confidence = match.confidence ?? null;
  if (!enrollment || confidence === null || confidence < Number(settings.faceMatchThreshold)) {
    const review = await tx.faceMatchReview.create({
      data: { schoolId: input.schoolId, candidateStudentId: enrollment?.studentId, candidateStaffId: enrollment?.staffId, confidenceScore: confidence, deviceId: input.deviceId, periodId: input.periodId?.trim() || "DAILY", capturedAt: input.timestamp ?? new Date() }
    });
    return { status: "manual_review" as const, reviewId: review.id, confidence };
  }

  const event = await recordAttendance(tx, { schoolId: input.schoolId, actorId: input.actorId, target: enrollment.studentId ? { studentId: enrollment.studentId } : { staffId: enrollment.staffId! }, type: input.type, method: "face", confidenceScore: confidence, deviceId: input.deviceId, periodId: input.periodId, timestamp: input.timestamp });
  return { status: "recorded" as const, event };
}

export async function reviewFaceMatch(
  tx: TenantDb,
  input: { schoolId: string; actorId: string; reviewId: string; decision: "confirmed" | "rejected"; type?: "in" | "out" }
) {
  await requirePermission(tx, input.actorId, "attendance:record");
  const review = await tx.faceMatchReview.findFirst({ where: { id: input.reviewId, schoolId: input.schoolId } });
  if (!review) throw new AppError("Face review not found.", 404, "NOT_FOUND");
  if (review.status !== "pending") throw new AppError("Face review is already complete.", 409, "INVALID_STATE");
  if (input.decision === "rejected") {
    const rejected = await tx.faceMatchReview.update({ where: { id: review.id }, data: { status: "rejected", reviewedBy: input.actorId, reviewedAt: new Date() } });
    await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "face.match_rejected", entityType: "FaceMatchReview", entityId: review.id, before: { status: review.status }, after: { status: rejected.status, candidateStudentId: review.candidateStudentId, candidateStaffId: review.candidateStaffId } });
    return rejected;
  }
  if (!review.candidateStudentId && !review.candidateStaffId) throw new AppError("No candidate is available; record attendance manually.", 409, "NO_FACE_CANDIDATE");
  const event = await recordAttendance(tx, { schoolId: input.schoolId, actorId: input.actorId, target: review.candidateStudentId ? { studentId: review.candidateStudentId } : { staffId: review.candidateStaffId! }, type: input.type ?? "in", method: "face", confidenceScore: review.confidenceScore ? Number(review.confidenceScore) : undefined, deviceId: review.deviceId ?? undefined, periodId: review.periodId, timestamp: review.capturedAt ?? undefined });
  const confirmed = await tx.faceMatchReview.update({ where: { id: review.id }, data: { status: "confirmed", reviewedBy: input.actorId, reviewedAt: new Date() } });
  await appendSchoolAudit(tx, { schoolId: input.schoolId, actorId: input.actorId, action: "face.match_confirmed", entityType: "FaceMatchReview", entityId: review.id, before: { status: review.status }, after: { status: confirmed.status, eventId: event.id } });
  return { reviewId: review.id, event };
}
