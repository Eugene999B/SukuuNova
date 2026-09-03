import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { rawDb } from "./db";
import { RateLimitError } from "./errors";

export async function enforceCronRateLimit(scope: string, identity: string, maxAttempts: number, windowMs: number) {
  const identityHash = createHash("sha256").update(`${scope}|${identity.trim()}`).digest("hex");
  const now = new Date();
  const retryAfter = await rawDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.loginRateLimit.findUnique({ where: { identityHash } });
    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return Math.max(1, Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000));
    }
    const expired = !existing || now.getTime() - existing.windowStartedAt.getTime() >= windowMs;
    const attemptCount = expired ? 1 : existing.attemptCount + 1;
    const blockedUntil = attemptCount > maxAttempts ? new Date(now.getTime() + windowMs) : null;
    await tx.loginRateLimit.upsert({
      where: { identityHash },
      update: {
        attemptCount,
        windowStartedAt: expired ? now : existing!.windowStartedAt,
        blockedUntil
      },
      create: {
        identityHash,
        attemptCount,
        windowStartedAt: now,
        blockedUntil
      }
    });
    return blockedUntil ? Math.ceil(windowMs / 1000) : 0;
  });

  if (retryAfter > 0) throw new RateLimitError(retryAfter);
}
