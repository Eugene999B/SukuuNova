import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalSignatureVector, type SignatureVectorEvidence } from "@/lib/signature-vector";

const PNG_PREFIX = "data:image/png;base64,";

export function signatureImageSha256(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Signature must be a PNG data URL.");
  const payload = dataUrl.slice(PNG_PREFIX.length);
  const bytes = Buffer.from(payload, "base64");
  return createHash("sha256").update(bytes).digest("hex");
}

export function signatureVectorSha256(evidence: SignatureVectorEvidence) {
  return createHash("sha256").update(canonicalSignatureVector(evidence), "utf8").digest("hex");
}

function verifySha256(actualHex: string, expectedSha256: string) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) return false;
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifySignatureImageSha256(dataUrl: string, expectedSha256: string) {
  try {
    return verifySha256(signatureImageSha256(dataUrl), expectedSha256);
  } catch {
    return false;
  }
}

export function verifySignatureVectorSha256(evidence: SignatureVectorEvidence, expectedSha256: string) {
  try {
    return verifySha256(signatureVectorSha256(evidence), expectedSha256);
  } catch {
    return false;
  }
}
