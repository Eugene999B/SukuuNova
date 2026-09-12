import { describe, expect, it } from "vitest";
import { assessLocalFaceDetections, faceBoxesAreStable } from "@/lib/browser-face-gate";

describe("local portrait face gate", () => {
  it("rejects frames with no face or multiple faces", () => {
    expect(assessLocalFaceDetections({ detections: [] }, 1000, 800).acceptable).toBe(false);
    expect(assessLocalFaceDetections({ detections: [{}, {}] }, 1000, 800).acceptable).toBe(false);
  });

  it("accepts one confident, centered face with useful portrait scale", () => {
    const result = assessLocalFaceDetections({
      detections: [{
        categories: [{ score: 0.94 }],
        boundingBox: { originX: 350, originY: 170, width: 300, height: 300 },
      }],
    }, 1000, 800);
    expect(result.acceptable).toBe(true);
    expect(result.faceCount).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("rejects a face that is too small or outside the central portrait area", () => {
    const tooSmall = assessLocalFaceDetections({
      detections: [{ categories: [{ score: 0.96 }], boundingBox: { originX: 450, originY: 280, width: 100, height: 100 } }],
    }, 1000, 800);
    const offCenter = assessLocalFaceDetections({
      detections: [{ categories: [{ score: 0.96 }], boundingBox: { originX: 20, originY: 170, width: 300, height: 300 } }],
    }, 1000, 800);
    expect(tooSmall.acceptable).toBe(false);
    expect(offCenter.acceptable).toBe(false);
  });

  it("requires nearby face boxes before a frame can count as stable", () => {
    const first = { centerX: 0.5, centerY: 0.42, widthRatio: 0.3, heightRatio: 0.36 };
    expect(faceBoxesAreStable(first, { centerX: 0.52, centerY: 0.4, widthRatio: 0.31, heightRatio: 0.35 })).toBe(true);
    expect(faceBoxesAreStable(first, { centerX: 0.68, centerY: 0.4, widthRatio: 0.31, heightRatio: 0.35 })).toBe(false);
  });
});
