import { AppError } from "./errors";
import type { TenantDb } from "./db";
import { awsFaceProvider, type FaceProvider } from "./face-provider";

function imageBytes(dataUrlOrBase64: string) {
  const dataUrlMatch = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrlOrBase64.trim());
  const raw = dataUrlMatch ? dataUrlMatch[2] : dataUrlOrBase64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new AppError("Face capture must be a valid JPEG, PNG, or WebP image.", 400, "INVALID_FACE_CAPTURE");
  }
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 100 || bytes.length > 5 * 1024 * 1024) {
    throw new AppError("Face capture must be a valid image under 5 MB.", 400, "INVALID_FACE_CAPTURE");
  }
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new AppError("Unsupported face image format.", 400, "INVALID_FACE_CAPTURE");
  return bytes;
}

function collectionId(schoolId: string) {
  return "sukuunova-" + schoolId.replace(/[^a-zA-Z0-9_.-]/g, "");
}

export async function verifyStaffFace(
  tx: TenantDb,
  input: { schoolId: string; staffId: string; image: string },
  provider: FaceProvider = awsFaceProvider
) {
  const [enrollment, settings] = await Promise.all([
    tx.faceEnrollment.findFirst({
      where: { schoolId: input.schoolId, staffId: input.staffId },
      select: { id: true, staffId: true }
    }),
    tx.schoolSettings.findUnique({
      where: { schoolId: input.schoolId },
      select: { faceMatchThreshold: true }
    })
  ]);
  if (!enrollment) {
    throw new AppError("Your face has not been enrolled for staff attendance. Ask an authorised administrator to enroll it first.", 409, "STAFF_FACE_ENROLLMENT_REQUIRED");
  }
  if (!settings) throw new AppError("School settings were not found.", 404, "NOT_FOUND");

  const match = await provider.searchFace({
    collectionId: collectionId(input.schoolId),
    imageBytes: imageBytes(input.image)
  });
  const confidence = match.confidence ?? null;
  const expectedExternalId = `staff:${input.staffId}`;
  if (match.externalId !== expectedExternalId || confidence === null || confidence < Number(settings.faceMatchThreshold)) {
    throw new AppError("Face verification failed. Make sure your face is clearly visible and try the live QR code again.", 403, "STAFF_FACE_VERIFICATION_FAILED");
  }
  return { verified: true as const, confidence };
}
