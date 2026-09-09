import { createHash } from "node:crypto";

const PNG_PREFIX = "data:image/png;base64,";

export function signatureImageSha256(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Signature must be a PNG data URL.");
  const payload = dataUrl.slice(PNG_PREFIX.length);
  const bytes = Buffer.from(payload, "base64");
  return createHash("sha256").update(bytes).digest("hex");
}
