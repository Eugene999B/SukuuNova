import { timingSafeEqual } from "node:crypto";
import type { IdentityCardView } from "./identity-card-service";
import { identityCardSignature } from "./identity-card-service";

type SignableIdentityCard = Pick<
  IdentityCardView,
  "schoolId" | "serial" | "personType" | "issuedAt" | "expiresAt" | "version"
>;

const TOKEN_BYTES = 16;

/**
 * A compact 128-bit verifier derived from the existing HMAC signature.
 * The legacy 64-character signature remains valid on the old verification URL;
 * this token exists to keep printed QR codes smaller, cleaner and easier to scan.
 */
export function identityCardCompactToken(card: SignableIdentityCard) {
  const signature = identityCardSignature(card);
  return Buffer.from(signature, "hex").subarray(0, TOKEN_BYTES).toString("base64url");
}

export function verifyIdentityCardCompactToken(card: SignableIdentityCard, supplied: string) {
  const normalized = supplied.trim();
  if (!/^[A-Za-z0-9_-]{22}$/.test(normalized)) return false;
  const expected = identityCardCompactToken(card);
  const actualBytes = Buffer.from(normalized, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function identityCardCompactVerificationPath(
  schoolCode: string,
  card: SignableIdentityCard,
) {
  return `/v/${encodeURIComponent(schoolCode)}/${encodeURIComponent(card.serial)}/${identityCardCompactToken(card)}`;
}

export function identityCardCompactVerificationUrl(
  origin: string,
  schoolCode: string,
  card: SignableIdentityCard,
) {
  return `${origin.replace(/\/+$/g, "")}${identityCardCompactVerificationPath(schoolCode, card)}`;
}
