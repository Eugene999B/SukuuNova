import type { PlatformSession } from "./auth";
import { db, withTenant } from "./db";
import { getPlatformSchoolScope } from "./platform-permissions";
import { ForbiddenError } from "./errors";

export type PlatformSchoolListItem = {
  id: string;
  name: string;
  uniqueCode: string;
  status: string;
  createdAt: Date;
  subscriptionPlan: {
    id: string;
    name: string;
    price: unknown;
    featureFlags: string[];
  } | null;
};

function flags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function listScopedPlatformSchools(session: PlatformSession): Promise<PlatformSchoolListItem[]> {
  const scope = await getPlatformSchoolScope(session);
  if (scope === null) throw new ForbiddenError("Use the global school listing for Super Admin access.");
  if (!scope.length) return [];

  const directories = await db.schoolLoginDirectory.findMany({
    where: { schoolId: { in: scope } },
    select: { schoolId: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = await Promise.all(
    directories.map(({ schoolId }) =>
      withTenant(schoolId, (tx) =>
        tx.school.findUnique({
          where: { id: schoolId },
          select: {
            id: true,
            name: true,
            uniqueCode: true,
            status: true,
            createdAt: true,
            subscriptionPlan: { select: { id: true, name: true, price: true, featureFlags: true } },
          },
        }),
      ).catch(() => null),
    ),
  );

  return rows.filter((row): row is NonNullable<typeof row> => Boolean(row)).map((row) => ({
    ...row,
    subscriptionPlan: row.subscriptionPlan
      ? { ...row.subscriptionPlan, featureFlags: flags(row.subscriptionPlan.featureFlags) }
      : null,
  }));
}
