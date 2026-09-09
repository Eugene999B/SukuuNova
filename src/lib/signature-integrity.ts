import { createHash, timingSafeEqual } from "node:crypto";

const PNG_PREFIX = "data:image/png;base64,";

export function signatureImageSha256(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Signature must be a PNG data URL.");
  const payload = dataUrl.slice(PNG_PREFIX.length);
  const bytes = Buffer.from(payload, "base64");
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifySignatureImageSha256(dataUrl: string, expectedSha256: string) {
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) return false;
  try {
    const actual = Buffer.from(signatureImageSha256(dataUrl), "hex");
    const expected = Buffer.from(expectedSha256, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
