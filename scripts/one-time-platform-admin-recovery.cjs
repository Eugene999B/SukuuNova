#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const db = new PrismaClient();

async function main() {
  if (String(process.env.RUN_ONE_TIME_PLATFORM_ADMIN_RECOVERY || "").trim() !== "YES") {
    console.log("[platform-recovery] one-time admin recovery not requested.");
    return;
  }

  const email = String(process.env.ONE_TIME_PLATFORM_RESET_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ONE_TIME_PLATFORM_RESET_PASSWORD || "");
  if (!email || !password) {
    throw new Error("One-time platform recovery requires both email and password variables.");
  }

  const admins = await db.platformAdmin.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (admins.length !== 1) {
    throw new Error(`Expected exactly one matching PlatformAdmin, found ${admins.length}.`);
  }

  const adminId = admins[0].id;
  const passwordHash = await hash(password, 12);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.platformAdmin.update({
      where: { id: adminId },
      data: { passwordHash, status: "active" },
    });
    await tx.platformPasswordResetToken.updateMany({
      where: { adminId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLogPlatform.create({
      data: {
        actorId: adminId,
        action: "password_reset.admin_recovery",
        targetEntity: `PlatformAdmin:${adminId}`,
        meta: { source: "one_time_railway_recovery", completedAt: now.toISOString() },
      },
    });
  });

  console.log("[platform-recovery] reset completed for exactly one PlatformAdmin.");
}

main()
  .catch((error) => {
    console.error("[platform-recovery] failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
