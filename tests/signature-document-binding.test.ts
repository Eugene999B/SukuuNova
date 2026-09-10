import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  signatureDocumentBindingHmac,
  signatureImageSha256,
  verifySignatureDocumentBindingHmac,
} from "../src/lib/signature-integrity";
import { readSignatureSnapshot } from "../src/lib/report-card-signatures";

const previousBindingSecret = process.env.SIGNATURE_BINDING_SECRET;
const testBindingSecret = "sukuunova-signature-binding-test-secret-0123456789abcdef";

beforeAll(() => {
  process.env.SIGNATURE_BINDING_SECRET = testBindingSecret;
});

afterAll(() => {
  if (previousBindingSecret === undefined) delete process.env.SIGNATURE_BINDING_SECRET;
  else process.env.SIGNATURE_BINDING_SECRET = previousBindingSecret;
});

const dataUrl = `data:image/png;base64,${Buffer.from("sukuunova-signature-test").toString("base64")}`;
const imageSha256 = signatureImageSha256(dataUrl);
const context = { schoolId: "school-1", documentType: "report_card", documentId: "report-1" };
const bindingInput = {
  ...context,
  signerId: "user-1",
  role: "Headteacher",
  signatureUpdatedAt: "2026-09-09T22:00:00.000Z",
  imageSha256,
  vectorSha256: "a".repeat(64),
};

describe("signature document binding", () => {
  it("is stable for the exact signer, document, signature version and server secret", () => {
    const mac = signatureDocumentBindingHmac(bindingInput);
    expect(mac).toMatch(/^[a-f0-9]{64}$/);
    expect(signatureDocumentBindingHmac({ ...bindingInput })).toBe(mac);
    expect(verifySignatureDocumentBindingHmac(bindingInput, mac)).toBe(true);
  });

  it("changes when report, signer role, signature time or vector hash changes", () => {
    const mac = signatureDocumentBindingHmac(bindingInput);
    expect(signatureDocumentBindingHmac({ ...bindingInput, documentId: "report-2" })).not.toBe(mac);
    expect(signatureDocumentBindingHmac({ ...bindingInput, role: "Class Teacher" })).not.toBe(mac);
    expect(signatureDocumentBindingHmac({ ...bindingInput, signatureUpdatedAt: "2026-09-09T22:01:00.000Z" })).not.toBe(mac);
    expect(signatureDocumentBindingHmac({ ...bindingInput, vectorSha256: "b".repeat(64) })).not.toBe(mac);
  });

  it("cannot be reproduced with a different server secret", () => {
    const mac = signatureDocumentBindingHmac(bindingInput);
    process.env.SIGNATURE_BINDING_SECRET = "different-sukuunova-signature-secret-0123456789abcdef";
    try {
      expect(signatureDocumentBindingHmac(bindingInput)).not.toBe(mac);
      expect(verifySignatureDocumentBindingHmac(bindingInput, mac)).toBe(false);
    } finally {
      process.env.SIGNATURE_BINDING_SECRET = testBindingSecret;
    }
  });

  it("verifies a frozen report signature and suppresses ink if its document binding is tampered", () => {
    const mac = signatureDocumentBindingHmac(bindingInput);
    const calculationSnapshot = {
      signatureSnapshot: [{
        userId: "user-1",
        role: "Headteacher",
        name: "Signer",
        signatureDataUrl: dataUrl,
        signatureUpdatedAt: bindingInput.signatureUpdatedAt,
        signatureSha256: imageSha256,
        signatureIntegrity: "verified",
        signatureVectorSha256: bindingInput.vectorSha256,
        signatureVectorIntegrity: "verified",
        documentBindingHmac: mac,
        documentBindingIntegrity: "verified",
      }],
    } as never;

    const valid = readSignatureSnapshot(calculationSnapshot, context)[0];
    expect(valid.documentBindingIntegrity).toBe("verified");
    expect(valid.signatureDataUrl).toBe(dataUrl);

    const wrongContext = readSignatureSnapshot(calculationSnapshot, { ...context, documentId: "report-wrong" })[0];
    expect(wrongContext.documentBindingIntegrity).toBe("failed");
    expect(wrongContext.signatureDataUrl).toBeUndefined();
  });
});