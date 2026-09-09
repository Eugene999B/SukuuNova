import { describe, expect, it } from "vitest";
import {
  signatureDocumentBindingSha256,
  signatureImageSha256,
  verifySignatureDocumentBindingSha256,
} from "../src/lib/signature-integrity";
import { readSignatureSnapshot } from "../src/lib/report-card-signatures";

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
  it("is stable for the exact signer, document and signature version", () => {
    const digest = signatureDocumentBindingSha256(bindingInput);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(signatureDocumentBindingSha256({ ...bindingInput })).toBe(digest);
    expect(verifySignatureDocumentBindingSha256(bindingInput, digest)).toBe(true);
  });

  it("changes when report, signer role, signature time or vector hash changes", () => {
    const digest = signatureDocumentBindingSha256(bindingInput);
    expect(signatureDocumentBindingSha256({ ...bindingInput, documentId: "report-2" })).not.toBe(digest);
    expect(signatureDocumentBindingSha256({ ...bindingInput, role: "Class Teacher" })).not.toBe(digest);
    expect(signatureDocumentBindingSha256({ ...bindingInput, signatureUpdatedAt: "2026-09-09T22:01:00.000Z" })).not.toBe(digest);
    expect(signatureDocumentBindingSha256({ ...bindingInput, vectorSha256: "b".repeat(64) })).not.toBe(digest);
  });

  it("verifies a frozen report signature and suppresses ink if its document binding is tampered", () => {
    const digest = signatureDocumentBindingSha256(bindingInput);
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
        documentBindingSha256: digest,
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
