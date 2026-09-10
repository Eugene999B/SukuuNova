import { describe, expect, it } from "vitest";
import {
  canonicalSignatureVector,
  createSignatureVectorEvidence,
  parseSignatureVectorEvidence,
  restoreSignatureStrokes,
  SIGNATURE_VECTOR_VERSION,
} from "../src/lib/signature-vector";
import {
  signatureVectorSha256,
  verifySignatureVectorSha256,
} from "../src/lib/signature-integrity";

const strokes = [
  {
    width: 2.8,
    points: [
      { x: 96, y: 28, time: 1000, pressure: 0.25, pointerType: "pen" as const },
      { x: 192, y: 56, time: 1016, pressure: 0.5, pointerType: "pen" as const },
      { x: 288, y: 70, time: 1032, pressure: 0.75, pointerType: "pen" as const },
    ],
  },
  {
    width: 3.2,
    points: [
      { x: 480, y: 140, time: 1100, pressure: 0.5, pointerType: "touch" as const },
      { x: 576, y: 168, time: 1120, pressure: 0.5, pointerType: "touch" as const },
    ],
  },
];

describe("signature vector evidence", () => {
  it("normalizes canvas coordinates and preserves pointer dynamics", () => {
    const evidence = createSignatureVectorEvidence(strokes, 960, 280);
    expect(evidence).not.toBeNull();
    expect(evidence!.version).toBe(SIGNATURE_VECTOR_VERSION);
    expect(evidence!.strokeCount).toBe(2);
    expect(evidence!.pointCount).toBe(5);
    expect(evidence!.strokes[0].points[0]).toMatchObject({ x: 0.1, y: 0.1, t: 0, pressure: 0.25, pointerType: "pen" });
    expect(evidence!.strokes[0].points[2]).toMatchObject({ x: 0.3, y: 0.25, t: 32, pressure: 0.75, pointerType: "pen" });
  });

  it("restores normalized strokes at a different render size", () => {
    const evidence = createSignatureVectorEvidence(strokes, 960, 280)!;
    const restored = restoreSignatureStrokes(evidence, 480, 140);
    expect(restored[0].points[0].x).toBeCloseTo(48, 6);
    expect(restored[0].points[0].y).toBeCloseTo(14, 6);
    expect(restored[0].width).toBeCloseTo(1.4, 6);
    expect(restored[0].points[2].pressure).toBe(0.75);
  });

  it("canonicalizes and hashes identical evidence deterministically", () => {
    const evidence = createSignatureVectorEvidence(strokes, 960, 280)!;
    const clone = JSON.parse(JSON.stringify(evidence));
    expect(canonicalSignatureVector(clone)).toBe(canonicalSignatureVector(evidence));
    const hash = signatureVectorSha256(evidence);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(signatureVectorSha256(clone)).toBe(hash);
    expect(verifySignatureVectorSha256(clone, hash)).toBe(true);
  });

  it("detects a changed stroke point through the vector hash", () => {
    const evidence = createSignatureVectorEvidence(strokes, 960, 280)!;
    const hash = signatureVectorSha256(evidence);
    const changed = JSON.parse(JSON.stringify(evidence));
    changed.strokes[0].points[1].x = 0.25;
    expect(signatureVectorSha256(changed)).not.toBe(hash);
    expect(verifySignatureVectorSha256(changed, hash)).toBe(false);
  });

  it("rejects malformed or out-of-range vector evidence", () => {
    const evidence = createSignatureVectorEvidence(strokes, 960, 280)!;
    expect(parseSignatureVectorEvidence(evidence)).not.toBeNull();
    expect(parseSignatureVectorEvidence({ ...evidence, version: "wrong" })).toBeNull();
    const badCoordinate = JSON.parse(JSON.stringify(evidence));
    badCoordinate.strokes[0].points[0].x = 1.2;
    expect(parseSignatureVectorEvidence(badCoordinate)).toBeNull();
    const badPressure = JSON.parse(JSON.stringify(evidence));
    badPressure.strokes[0].points[0].pressure = -0.1;
    expect(parseSignatureVectorEvidence(badPressure)).toBeNull();
  });
});
