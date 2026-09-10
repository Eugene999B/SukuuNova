import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalSignatureVector, type SignatureVectorEvidence } from "@/lib/signature-vector";

const PNG_PREFIX = "data:image/png;base64,";
const DOCUMENT_BINDING_VERSION = "sukuunova-signature-binding-v2-hmac-sha256";

export type SignatureDocumentBindingInput = {
  schoolId: string;
  documentType: string;
  documentId: string;
  signerId: string;
  role: string;
  signatureUpdatedAt: string;
  imageSha256: string;
  vectorSha256?: string;
};

export function signatureImageSha256(dataUrl: string) {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Signature must be a PNG data URL.");
  const payload = dataUrl.slice(PNG_PREFIX.length);
  const bytes = Buffer.from(payload, "base64");
  return createHash("sha256").update(bytes).digest("hex");
}

export function signatureVectorSha256(evidence: SignatureVectorEvidence) {
  return createHash("sha256").update(canonicalSignatureVector(evidence), "utf8").digest("hex");
}

function normalizedBinding(input: SignatureDocumentBindingInput) {
  const strings = [input.schoolId, input.documentType, input.documentId, input.signerId, input.role, input.signatureUpdatedAt];
  if (strings.some((value) => !value.trim())) throw new Error("Signature document binding fields are required.");
  if (!/^[a-f0-9]{64}$/i.test(input.imageSha256)) throw new Error("Signature image hash is invalid.");
  if (input.vectorSha256 && !/^[a-f0-9]{64}$/i.test(input.vectorSha256)) throw new Error("Signature vector hash is invalid.");
  return {
    version: DOCUMENT_BINDING_VERSION,
    schoolId: input.schoolId,
    documentType: input.documentType,
    documentId: input.documentId,
    signerId: input.signerId,
    role: input.role,
    signatureUpdatedAt: input.signatureUpdatedAt,
    imageSha256: input.imageSha256.toLowerCase(),
    vectorSha256: input.vectorSha256?.toLowerCase() ?? null,
  };
}

function bindingSecret() {
  const source = process.env.SIGNATURE_BINDING_SECRET?.trim() || process.env.SCHOOL_AUTH_SECRET?.trim();
  if (!source || source.length < 32) throw new Error("Signature document binding secret is not configured securely.");
  return createHmac("sha256", Buffer.from(source, "utf8"))
    .update("SukuuNova:signature-document-binding:key:v2", "utf8")
    .digest();
}

export function signatureDocumentBindingHmac(input: SignatureDocumentBindingInput) {
  return createHmac("sha256", bindingSecret())
    .update(JSON.stringify(normalizedBinding(input)), "utf8")
    .digest("hex");
}

function verifyHex(actualHex: string, expectedHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifySignatureImageSha256(dataUrl: string, expectedSha256: string) {
  try {
    return verifyHex(signatureImageSha256(dataUrl), expectedSha256);
  } catch {
    return false;
  }
}

export function verifySignatureVectorSha256(evidence: SignatureVectorEvidence, expectedSha256: string) {
  try {
    return verifyHex(signatureVectorSha256(evidence), expectedSha256);
  } catch {
    return false;
  }
}

export function verifySignatureDocumentBindingHmac(input: SignatureDocumentBindingInput, expectedHmac: string) {
  try {
    return verifyHex(signatureDocumentBindingHmac(input), expectedHmac);
  } catch {
    return false;
  }
}