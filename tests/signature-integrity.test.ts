import { describe, expect, it } from "vitest";
import { signatureImageSha256, verifySignatureImageSha256 } from "../src/lib/signature-integrity";

describe("signature integrity", () => {
  it("hashes decoded PNG bytes deterministically", () => {
    const dataUrl = "data:image/png;base64,QUJD";
    expect(signatureImageSha256(dataUrl)).toBe("b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78");
    expect(signatureImageSha256(dataUrl)).toBe(signatureImageSha256(dataUrl));
  });

  it("verifies the saved bytes and rejects later tampering", () => {
    const original = "data:image/png;base64,QUJD";
    const hash = signatureImageSha256(original);
    expect(verifySignatureImageSha256(original, hash)).toBe(true);
    expect(verifySignatureImageSha256("data:image/png;base64,QUJE", hash)).toBe(false);
  });

  it("rejects non-PNG signature inputs", () => {
    expect(() => signatureImageSha256("data:image/jpeg;base64,QUJD")).toThrow(/PNG/);
    expect(verifySignatureImageSha256("data:image/jpeg;base64,QUJD", "0".repeat(64))).toBe(false);
  });
});
