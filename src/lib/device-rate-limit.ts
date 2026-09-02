import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { rawDb } from "./db";
import { RateLimitError } from "./errors";

const WINDOW_MS = 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 120;

function hash(scope: string, value: string): string {
  return createHash("sha256").update(scope + "|" + value.trim().toLowerCase()).digest("hex");
}

async function consume(tx: Prisma.TransactionClient, identityHash: string, now: Date): Promise<number> {
  const existing = await tx.loginRateLimit.findUnique({ where: { identityHash } });
  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return Math.max(1, Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000));
  }
  const expired = !existing || now.getTime() - existing.windowStartedAt.getTime() >= WINDOW_MS;
  const count = expired ? 1 : existing.attemptCount + 1;
  const blockedUntil = count > MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null;
  await tx.loginRateLimit.upsert({
    where: { identityHash },
    update: { attemptCount: count, windowStartedAt: expired ? now : existing!.windowStartedAt, blockedUntil },
    create: { identityHash, attemptCount: count, windowStartedAt: now, blockedUntil }
  });
  return blockedUntil ? Math.ceil(BLOCK_MS / 1000) : 0;
}

export async function enforceDeviceAttendanceRateLimit(
  ip: string,
  deviceSerial?: string,
  options?: { skipIp?: boolean }
): Promise<void> {
  const now = new Date();
  const ipHash = hash("device-attendance:ip", ip || "unknown");
  const deviceHash = deviceSerial ? hash("device-attendance:device", deviceSerial) : undefined;
  const retryAfter = await rawDb.$transaction(async (tx) => {
    if (!options?.skipIp) {
      const ipRetry = await consume(tx, ipHash, now);
      if (ipRetry > 0) return ipRetry;
    }
    if (!deviceHash) return 0;
    return consume(tx, deviceHash, now);
  });
  if (retryAfter > 0) throw new RateLimitError(retryAfter);
}
