import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DetectFacesCommand, RekognitionClient, type FaceDetail } from "@aws-sdk/client-rekognition";
import { AppError } from "./errors";

export type PortraitTarget = "student" | "staff";

export type PortraitVerificationCheck = {
  key: "face" | "position" | "pose" | "eyes" | "occlusion" | "quality";
  label: string;
  passed: boolean;
  detail: string;
};

export type PortraitVerificationResult = {
  ok: boolean;
  biometricReady: boolean;
  message: string;
  checks: PortraitVerificationCheck[];
};

type PortraitVerificationPayload = {
  v: 1;
  schoolId: string;
  target: PortraitTarget;
  digest: string;
  exp: number;
};

function decodeImage(image: string) {
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image.trim());
  if (!match || match[1].length % 4 !== 0) {
    throw new AppError("Portrait must be a JPEG, PNG, or WebP image captured by SukuuNova.", 400, "PORTRAIT_IMAGE_INVALID");
  }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 2_000 || bytes.length > 750_000) {
    throw new AppError("Portrait image must be between 2 KB and 750 KB.", 400, "PORTRAIT_IMAGE_SIZE_INVALID");
  }
  return bytes;
}

function imageDigest(image: string) {
  return createHash("sha256").update(decodeImage(image)).digest("base64url");
}

function signingSecret() {
  const secret = process.env.SCHOOL_AUTH_SECRET;
  if (!secret) throw new AppError("Portrait verification is not configured.", 503, "PORTRAIT_VERIFICATION_NOT_CONFIGURED");
  return secret;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", signingSecret()).update(`sukuunova-portrait-v1.${encodedPayload}`).digest("base64url");
}

function boolWithConfidence(detail: { Value?: boolean; Confidence?: number } | undefined, expected: boolean) {
  if (!detail || detail.Value == null) return false;
  if ((detail.Confidence ?? 0) < 70) return false;
  return detail.Value === expected;
}

export function assessPortraitFaces(faces: FaceDetail[]): PortraitVerificationResult {
  if (faces.length !== 1) {
    const none = faces.length === 0;
    return {
      ok: false,
      biometricReady: false,
      message: none ? "No face was detected yet. Keep one face clearly visible and SukuuNova will retry automatically." : "More than one face was detected. Keep only one person in view.",
      checks: [
        { key: "face", label: "One face", passed: false, detail: none ? "No usable face detected." : `${faces.length} faces detected.` },
        { key: "position", label: "Face position", passed: false, detail: "Waiting for one face." },
        { key: "pose", label: "Face angle", passed: false, detail: "Waiting for one face." },
        { key: "eyes", label: "Eyes visible", passed: false, detail: "Waiting for one face." },
        { key: "occlusion", label: "Face unobstructed", passed: false, detail: "Waiting for one face." },
        { key: "quality", label: "Biometric quality", passed: false, detail: "Waiting for one face." },
      ],
    };
  }

  const face = faces[0];
  const box = face.BoundingBox;
  const confidence = face.Confidence ?? 0;
  const left = box?.Left ?? 0;
  const top = box?.Top ?? 0;
  const width = box?.Width ?? 0;
  const height = box?.Height ?? 0;
  const right = left + width;
  const bottom = top + height;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const sizePassed = width >= 0.18 && width <= 0.7 && height >= 0.22 && height <= 0.8;
  const comfortablyVisible = left >= 0.015 && top >= 0.015 && right <= 0.985 && bottom <= 0.95;
  const naturallyFramed = centerX >= 0.24 && centerX <= 0.76 && centerY >= 0.22 && centerY <= 0.69;
  const positionPassed = sizePassed && comfortablyVisible && naturallyFramed;

  const yaw = Math.abs(face.Pose?.Yaw ?? 99);
  const pitch = Math.abs(face.Pose?.Pitch ?? 99);
  const roll = Math.abs(face.Pose?.Roll ?? 99);
  const posePassed = yaw <= 22 && pitch <= 20 && roll <= 18;

  const eyesPassed = boolWithConfidence(face.EyesOpen, true);
  const sunglassesPassed = !face.Sunglasses || boolWithConfidence(face.Sunglasses, false);
  const occlusionPassed = (!face.FaceOccluded || boolWithConfidence(face.FaceOccluded, false)) && sunglassesPassed;

  const brightness = face.Quality?.Brightness ?? 0;
  const sharpness = face.Quality?.Sharpness ?? 0;
  const qualityPassed = confidence >= 98 && brightness >= 30 && brightness <= 96 && sharpness >= 40;

  const checks: PortraitVerificationCheck[] = [
    { key: "face", label: "One face", passed: confidence >= 98, detail: confidence >= 98 ? `Face detected at ${confidence.toFixed(1)}% confidence.` : "Face detection confidence is too low." },
    { key: "position", label: "Face position", passed: positionPassed, detail: positionPassed ? "Head-and-shoulders framing is suitable." : "Keep the full face visible and move slightly closer, farther away, or toward the middle." },
    { key: "pose", label: "Face angle", passed: posePassed, detail: posePassed ? "Face is looking sufficiently straight ahead." : "Look toward the camera and keep the head reasonably level." },
    { key: "eyes", label: "Eyes visible", passed: eyesPassed, detail: eyesPassed ? "Eyes are open and visible." : "Open both eyes and look toward the camera." },
    { key: "occlusion", label: "Face unobstructed", passed: occlusionPassed, detail: occlusionPassed ? "No blocking sunglasses or face obstruction detected." : "Remove sunglasses or anything covering the face." },
    { key: "quality", label: "Biometric quality", passed: qualityPassed, detail: qualityPassed ? `Lighting ${brightness.toFixed(0)}/100 · sharpness ${sharpness.toFixed(0)}/100.` : "Use even light and hold the camera steady until the face is sharp." },
  ];
  const ok = checks.every((check) => check.passed);
  return {
    ok,
    biometricReady: ok,
    message: ok ? "Face verified as biometric-ready for controlled enrollment and verification." : checks.find((check) => !check.passed)?.detail ?? "Improve the portrait and try again.",
    checks,
  };
}

export async function verifyPortraitImage(image: string): Promise<PortraitVerificationResult> {
  const region = process.env.AWS_REGION;
  if (!region) throw new AppError("Portrait verification is not configured.", 503, "PORTRAIT_VERIFICATION_NOT_CONFIGURED");
  try {
    const result = await new RekognitionClient({ region }).send(new DetectFacesCommand({
      Image: { Bytes: decodeImage(image) },
      Attributes: ["DEFAULT", "EYES_OPEN", "FACE_OCCLUDED", "SUNGLASSES"],
    }));
    return assessPortraitFaces(result.FaceDetails ?? []);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Portrait verification failed", error);
    throw new AppError("Face verification is temporarily unavailable. The portrait was not accepted.", 503, "PORTRAIT_VERIFICATION_UNAVAILABLE");
  }
}

export function issuePortraitVerificationToken(input: { schoolId: string; target: PortraitTarget; image: string; ttlSeconds?: number }) {
  const payload: PortraitVerificationPayload = {
    v: 1,
    schoolId: input.schoolId,
    target: input.target,
    digest: imageDigest(input.image),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 30 * 60),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function assertPortraitVerificationToken(input: { token: string; schoolId: string; target: PortraitTarget; image: string }) {
  const parts = input.token.split(".");
  if (parts.length !== 2) throw new AppError("Portrait verification has expired or is invalid. Verify the face again.", 400, "PORTRAIT_VERIFICATION_INVALID");
  const [encoded, signature] = parts;
  const expected = signPayload(encoded);
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new AppError("Portrait verification is invalid. Verify the face again.", 400, "PORTRAIT_VERIFICATION_INVALID");
  }

  let payload: PortraitVerificationPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PortraitVerificationPayload;
  } catch {
    throw new AppError("Portrait verification is invalid. Verify the face again.", 400, "PORTRAIT_VERIFICATION_INVALID");
  }
  if (payload.v !== 1 || payload.schoolId !== input.schoolId || payload.target !== input.target || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError("Portrait verification has expired or does not match this record. Verify the face again.", 400, "PORTRAIT_VERIFICATION_INVALID");
  }
  if (payload.digest !== imageDigest(input.image)) {
    throw new AppError("The portrait changed after verification. Verify the face again.", 400, "PORTRAIT_VERIFICATION_IMAGE_CHANGED");
  }
  return payload;
}
