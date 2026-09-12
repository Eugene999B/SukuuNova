import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FaceDetail } from "@aws-sdk/client-rekognition";
import {
  assessPortraitFaces,
  assertPortraitVerificationToken,
  issuePortraitVerificationToken,
} from "../src/lib/portrait-verification";

function goodFace(overrides: Partial<FaceDetail> = {}): FaceDetail {
  return {
    BoundingBox: { Left: 0.325, Top: 0.18, Width: 0.35, Height: 0.45 },
    Confidence: 99.9,
    Pose: { Yaw: 0, Pitch: 0, Roll: 0 },
    EyesOpen: { Value: true, Confidence: 99 },
    Sunglasses: { Value: false, Confidence: 99 },
    FaceOccluded: { Value: false, Confidence: 99 },
    Quality: { Brightness: 62, Sharpness: 72 },
    ...overrides,
  };
}

function testImage(seed: number) {
  const bytes = Buffer.alloc(2_400, seed);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

describe("portrait verification", () => {
  const originalSecret = process.env.SCHOOL_AUTH_SECRET;

  beforeEach(() => {
    process.env.SCHOOL_AUTH_SECRET = "portrait-verification-test-secret";
  });

  afterEach(() => {
    if (originalSecret == null) delete process.env.SCHOOL_AUTH_SECRET;
    else process.env.SCHOOL_AUTH_SECRET = originalSecret;
  });

  it("accepts one centred, frontal, visible, high-quality face", () => {
    const result = assessPortraitFaces([goodFace()]);
    expect(result.ok).toBe(true);
    expect(result.biometricReady).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("accepts practical head-and-shoulders framing without a narrow oval requirement", () => {
    expect(assessPortraitFaces([goodFace({ BoundingBox: { Left: 0.18, Top: 0.14, Width: 0.3, Height: 0.38 } })]).ok).toBe(true);
    expect(assessPortraitFaces([goodFace({ BoundingBox: { Left: 0.51, Top: 0.2, Width: 0.3, Height: 0.39 } })]).ok).toBe(true);
  });

  it("still rejects tiny faces and faces that are cut off by the frame", () => {
    expect(assessPortraitFaces([goodFace({ BoundingBox: { Left: 0.42, Top: 0.3, Width: 0.1, Height: 0.14 } })]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace({ BoundingBox: { Left: -0.02, Top: 0.08, Width: 0.34, Height: 0.44 } })]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace({ BoundingBox: { Left: 0.32, Top: 0.7, Width: 0.34, Height: 0.34 } })]).ok).toBe(false);
  });

  it("rejects frames with no face or more than one face", () => {
    expect(assessPortraitFaces([]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace(), goodFace()]).ok).toBe(false);
  });

  it("rejects poor face pose, obstruction, closed eyes, and weak quality", () => {
    expect(assessPortraitFaces([goodFace({ Pose: { Yaw: 35, Pitch: 0, Roll: 0 } })]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace({ FaceOccluded: { Value: true, Confidence: 99 } })]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace({ EyesOpen: { Value: false, Confidence: 99 } })]).ok).toBe(false);
    expect(assessPortraitFaces([goodFace({ Quality: { Brightness: 60, Sharpness: 20 } })]).ok).toBe(false);
  });

  it("binds verification tokens to school, target, exact image, and expiry", () => {
    const image = testImage(1);
    const token = issuePortraitVerificationToken({ schoolId: "school-1", target: "student", image, ttlSeconds: 120 });
    expect(() => assertPortraitVerificationToken({ token, schoolId: "school-1", target: "student", image })).not.toThrow();
    expect(() => assertPortraitVerificationToken({ token, schoolId: "school-2", target: "student", image })).toThrow();
    expect(() => assertPortraitVerificationToken({ token, schoolId: "school-1", target: "staff", image })).toThrow();
    expect(() => assertPortraitVerificationToken({ token, schoolId: "school-1", target: "student", image: testImage(2) })).toThrow();
  });
});
