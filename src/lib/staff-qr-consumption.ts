import type { Prisma } from "@prisma/client";
import type { TenantDb } from "./db";
import { AppError } from "./errors";
import { hashQrSecret } from "./qr-attendance";

export async function consumeStaffQrForActor(
  tx: TenantDb,
  input: {
    schoolId: string;
    actorId: string;
    challengeId: string;
    nonce: string;
    verification: string;
    meta?: Record<string, unknown>;
  }
) {
  const challenge = await tx.auditLogSchool.findFirst({
    where: {
      schoolId: input.schoolId,
      action: "attendance.qr.issued",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId
    },
    orderBy: { createdAt: "desc" },
    select: { after: true }
  });
  const after = challenge?.after;
  const nonceHash = after && typeof after === "object" && after !== null && "nonceHash" in after && typeof after.nonceHash === "string" ? after.nonceHash : null;
  const expiresAtRaw = after && typeof after === "object" && after !== null && "expiresAt" in after && typeof after.expiresAt === "string" ? after.expiresAt : null;
  const displayIpHash = after && typeof after === "object" && after !== null && "displayIpHash" in after && typeof after.displayIpHash === "string" ? after.displayIpHash : null;
  if (!nonceHash || hashQrSecret(input.nonce) !== nonceHash || !expiresAtRaw || new Date(expiresAtRaw).getTime() <= Date.now()) {
    throw new AppError("This attendance code is invalid or expired.", 409, "CHALLENGE_INVALID_OR_EXPIRED");
  }

  // One shared display challenge can be used by many staff members, but each
  // signed-in identity can consume that rotating challenge only once.
  const consumptionId = hashQrSecret(`staff-qr-consumption:${input.schoolId}:${input.challengeId}:${input.actorId}`);
  const result = await tx.auditLogSchool.createMany({
    data: [{
      id: consumptionId,
      schoolId: input.schoolId,
      actorId: input.actorId,
      action: "attendance.qr.consumed",
      entityType: "StaffAttendanceQrChallenge",
      entityId: input.challengeId,
      after: ({
        verification: input.verification,
        ...(displayIpHash ? { displayIpHash } : {}),
        ...(input.meta ? { meta: input.meta } : {})
      } as Prisma.InputJsonValue)
    }],
    skipDuplicates: true
  });
  if (result.count !== 1) {
    throw new AppError("You have already used this live attendance code. Wait for the next code if you need to try again.", 409, "QR_REPLAY");
  }
}
