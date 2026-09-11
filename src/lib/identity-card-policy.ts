import type { TenantDb } from "./db";

/**
 * Keep current credential dates synchronized with the school's configured
 * validity period. The update is tenant-scoped and only touches cards whose
 * calculated expiry actually differs, so opening the workspace repeatedly is
 * idempotent and does not keep invalidating QR signatures.
 */
export async function alignActiveIdentityCardValidity(
  tx: TenantDb,
  schoolId: string,
  validityMonths: number,
) {
  const months = Number(validityMonths);
  if (!Number.isInteger(months) || months < 1 || months > 120) return 0;

  return tx.$executeRawUnsafe(
    `UPDATE "IdentityCard"
     SET "expiresAt"="issuedAt" + make_interval(months => $2::int),
         "version"="version"+1,
         "updatedAt"=CURRENT_TIMESTAMP
     WHERE "schoolId"=$1
       AND "status"='active'
       AND ABS(EXTRACT(EPOCH FROM ("expiresAt" - ("issuedAt" + make_interval(months => $2::int))))) > 1`,
    schoolId,
    months,
  );
}
