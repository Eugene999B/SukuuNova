import { db, withTenant } from "./db";

export type AccountLoginUniverse = "school" | "guardian";

function normalizeIdentifier(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
}

export function accountLoginRateIdentityForUserId(userId: string): string {
  return `user:${userId}`;
}

/**
 * Resolve a phone/email login to the canonical user account before touching the
 * failed-login limiter. That means the same person cannot bypass a temporary
 * lock by switching from phone to email. Unknown identifiers still receive an
 * isolated abuse bucket without revealing whether an account exists.
 */
export async function resolveAccountLoginRateIdentity(input: {
  schoolCode: string;
  identifier: string;
  universe: AccountLoginUniverse;
}): Promise<string> {
  const normalized = normalizeIdentifier(input.identifier);
  const uniqueCode = input.schoolCode.trim().toLowerCase();
  const directory = await db.schoolLoginDirectory.findUnique({
    where: { uniqueCode },
    select: { schoolId: true, status: true },
  });
  if (!directory || directory.status !== "active") return `identifier:${normalized}`;

  return withTenant(directory.schoolId, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT u."id"
      FROM "User" u
      WHERE u."schoolId" = ${directory.schoolId}
        AND (u."email" = ${normalized} OR u."phone" = ${normalized})
        AND (
          (${input.universe} = 'guardian' AND EXISTS (
            SELECT 1 FROM "Guardian" g WHERE g."userId" = u."id" AND g."schoolId" = u."schoolId"
          ))
          OR
          (${input.universe} = 'school' AND NOT EXISTS (
            SELECT 1 FROM "Guardian" g WHERE g."userId" = u."id" AND g."schoolId" = u."schoolId"
          ))
        )
      ORDER BY u."id"
      LIMIT 2
    `;
    return rows.length === 1 ? accountLoginRateIdentityForUserId(rows[0].id) : `identifier:${normalized}`;
  });
}
