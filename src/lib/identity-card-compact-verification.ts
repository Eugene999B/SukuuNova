import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IdentityCardView } from "./identity-card-service";
import { AppError } from "./errors";

type SignableIdentityCard = Pick<
  IdentityCardView,
  "schoolId" | "serial" | "personType" | "issuedAt"
>;

const TOKEN_BYTES = 16;

function compactSecret() {
  const value = process.env.SCHOOL_AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SCHOOL_AUTH_SECRET is not configured securely.", 500, "CONFIGURATION_ERROR");
  return createHash("sha256").update(`${value}:identity-card:compact-qr:v1`).digest();
}

function canonical(card: SignableIdentityCard) {
  // Only immutable issuance identity belongs in the printed QR signature. Status,
  // expiry-policy realignment and version changes stay live in the database so an
  // already printed card can later scan as REVOKED / EXPIRED instead of 404.
  return [
    "sukuunova-id-card-compact-v1",
    card.schoolId,
    card.serial,
    card.personType,
    card.issuedAt.toISOString(),
  ].join("|");
}

/**
 * Compact 128-bit HMAC verifier for printed QR codes. The legacy long-signature
 * verification route remains supported for old cards; new cards use this stable
 * token so the same printed QR can report future live status changes safely.
 */
export function identityCardCompactToken(card: SignableIdentityCard) {
  const signature = createHmac("sha256", compactSecret()).update(canonical(card)).digest();
  return signature.subarray(0, TOKEN_BYTES).toString("base64url");
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
