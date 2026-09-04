import { withTenant } from "./db";
import { ForbiddenError } from "./errors";

export async function requireActorOwnsSchool(schoolId: string, actorId: string) {
  const owned = await withTenant(schoolId, async (tx) => {
    const row = await tx.userRole.findFirst({
      where: {
        userId: actorId,
        role: { key: "owner" },
      },
      select: { userId: true },
    });
    return Boolean(row);
  });
  if (!owned) throw new ForbiddenError("The branch must be owned by the same account before it can join the school group.");
}

export async function requireBranchesAreOwnedByActor(branchSchoolIds: string[], actorId: string) {
  for (const schoolId of [...new Set(branchSchoolIds.filter(Boolean))]) {
    await requireActorOwnsSchool(schoolId, actorId);
  }
}
