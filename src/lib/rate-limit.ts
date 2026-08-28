import { createHash } from "node:crypto";
import { rawDb } from "./db";
import { RateLimitError } from "./errors";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function bucketKey(scope: string, identity: string, ip: string): string {
  return createHash("sha256")
    .update(scope + "|" + identity.trim().toLowerCase() + "|" + ip)
    .digest("hex");
}

export async function recordLoginAttempt(
  scope: string,
  identity: string,
  ip: string
): Promise<string> {
  const identityHash = bucketKey(scope, identity, ip);
  const now = new Date();

  const retryAfterSeconds = await rawDb.$transaction(async (tx) => {
    const existing = await tx.loginRateLimit.findUnique({
      where: { identityHash }
    });

    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return Math.max(
        1,
        Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000)
      );
    }

    const windowExpired =
      !existing || now.getTime() - existing.windowStartedAt.getTime() >= WINDOW_MS;
    const nextCount = windowExpired ? 1 : existing.attemptCount + 1;
    const blockedUntil =
      nextCount > MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null;

    await tx.loginRateLimit.upsert({
      where: { identityHash },
      update: {
        attemptCount: nextCount,
        windowStartedAt: windowExpired ? now : existing!.windowStartedAt,
        blockedUntil
      },
      create: {
        identityHash,
        attemptCount: nextCount,
        windowStartedAt: now,
        blockedUntil
      }
    });

    return blockedUntil ? Math.ceil(BLOCK_MS / 1000) : 0;
  });

  if (retryAfterSeconds > 0) {
    throw new RateLimitError(retryAfterSeconds);
  }

  return identityHash;
}

export async function clearLoginAttempts(identityHash: string): Promise<void> {
  await rawDb.loginRateLimit.deleteMany({ where: { identityHash } });
}

export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
