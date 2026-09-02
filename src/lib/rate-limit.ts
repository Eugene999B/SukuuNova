import { createHash } from "node:crypto";
import { rawDb } from "./db";
import { RateLimitError } from "./errors";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_IDENTITY_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 30;

type Bucket = {
  identityHash: string;
  maxAttempts: number;
};

function bucketKey(scope: string, identity: string): string {
  return createHash("sha256")
    .update(scope + "|" + identity.trim().toLowerCase())
    .digest("hex");
}

function normalizeIp(ip: string | undefined): string | undefined {
  const value = ip?.trim();
  if (!value || value === "unknown") return undefined;
  return value;
}

async function consumeBucket(
  tx: Parameters<Parameters<typeof rawDb.$transaction>[0]>[0],
  bucket: Bucket,
  now: Date,
): Promise<number> {
  const existing = await tx.loginRateLimit.findUnique({
    where: { identityHash: bucket.identityHash }
  });

  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return Math.max(
      1,
      Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
    );
  }

  const windowExpired =
    !existing || now.getTime() - existing.windowStartedAt.getTime() >= WINDOW_MS;
  const nextCount = windowExpired ? 1 : existing.attemptCount + 1;
  const blockedUntil =
    nextCount > bucket.maxAttempts ? new Date(now.getTime() + BLOCK_MS) : null;

  await tx.loginRateLimit.upsert({
    where: { identityHash: bucket.identityHash },
    update: {
      attemptCount: nextCount,
      windowStartedAt: windowExpired ? now : existing!.windowStartedAt,
      blockedUntil
    },
    create: {
      identityHash: bucket.identityHash,
      attemptCount: nextCount,
      windowStartedAt: now,
      blockedUntil
    }
  });

  return blockedUntil ? Math.ceil(BLOCK_MS / 1000) : 0;
}

export async function recordLoginAttempt(
  scope: string,
  identity: string,
  ip?: string,
): Promise<string> {
  const identityHash = bucketKey("identity:" + scope, identity);
  const normalizedIp = normalizeIp(ip);
  const ipHash = normalizedIp
    ? bucketKey("ip:" + scope, normalizedIp)
    : undefined;
  const now = new Date();

  const retryAfterSeconds = await rawDb.$transaction(async (tx) => {
    const identityRetry = await consumeBucket(
      tx,
      { identityHash, maxAttempts: MAX_IDENTITY_ATTEMPTS },
      now,
    );
    if (identityRetry > 0) return identityRetry;

    if (!ipHash) return 0;

    return consumeBucket(
      tx,
      { identityHash: ipHash, maxAttempts: MAX_IP_ATTEMPTS },
      now,
    );
  });

  if (retryAfterSeconds > 0) {
    throw new RateLimitError(retryAfterSeconds);
  }

  return identityHash;
}

export async function clearLoginAttempts(identityHash: string): Promise<void> {
  await rawDb.loginRateLimit.deleteMany({ where: { identityHash } });
}

/**
 * Best-effort client IP used only for abuse-control bucketing and telemetry.
 * It is never used for authentication or authorization decisions.
 */
export function requestIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || "unknown";
}
