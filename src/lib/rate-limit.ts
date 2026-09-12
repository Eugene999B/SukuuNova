import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

function identityBucketKey(scope: string, identity: string): string {
  return bucketKey("identity:" + scope, identity);
}

function normalizeIp(ip: string | undefined): string | undefined {
  const value = ip?.trim();
  if (!value || value === "unknown") return undefined;
  return value;
}

async function consumeBucket(
  tx: Prisma.TransactionClient,
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

/**
 * Generic abuse limiter retained for low-volume endpoints such as reset-token
 * confirmation and platform authentication. It can use both identity and IP
 * buckets. Do not use this helper for high-concurrency school/guardian login:
 * many legitimate users can share the same school network/NAT address.
 */
export async function recordLoginAttempt(
  scope: string,
  identity: string,
  ip?: string,
): Promise<string> {
  const identityHash = identityBucketKey(scope, identity);
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

/** Read-only guard for an individual account identity. It never consumes a try. */
export async function assertAccountLoginAllowed(scope: string, identity: string): Promise<void> {
  const now = new Date();
  const row = await rawDb.loginRateLimit.findUnique({
    where: { identityHash: identityBucketKey(scope, identity) },
    select: { blockedUntil: true }
  });
  if (row?.blockedUntil && row.blockedUntil > now) {
    throw new RateLimitError(Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)));
  }
}

/**
 * Record only a failed credential attempt for one account identity. There is
 * deliberately no school-code or IP bucket here, so users sharing the same
 * school, Wi-Fi or mobile carrier cannot lock one another out.
 */
export async function recordFailedAccountLogin(scope: string, identity: string): Promise<void> {
  const retryAfterSeconds = await rawDb.$transaction((tx) =>
    consumeBucket(
      tx,
      { identityHash: identityBucketKey(scope, identity), maxAttempts: MAX_IDENTITY_ATTEMPTS },
      new Date(),
    )
  );
  if (retryAfterSeconds > 0) throw new RateLimitError(retryAfterSeconds);
}

export async function clearAccountLoginAttempts(scope: string, identities: Array<string | null | undefined>): Promise<void> {
  const hashes = [...new Set(identities
    .map((identity) => identity?.trim())
    .filter((identity): identity is string => Boolean(identity))
    .map((identity) => identityBucketKey(scope, identity))
  )];
  if (!hashes.length) return;
  await rawDb.loginRateLimit.deleteMany({ where: { identityHash: { in: hashes } } });
}

export async function accountLoginLockState(scope: string, identities: Array<string | null | undefined>) {
  const hashes = [...new Set(identities
    .map((identity) => identity?.trim())
    .filter((identity): identity is string => Boolean(identity))
    .map((identity) => identityBucketKey(scope, identity))
  )];
  if (!hashes.length) return { locked: false, blockedUntil: null as Date | null, attemptCount: 0 };
  const rows = await rawDb.loginRateLimit.findMany({
    where: { identityHash: { in: hashes } },
    select: { blockedUntil: true, attemptCount: true },
  });
  const now = Date.now();
  const activeBlocks = rows.flatMap((row) => row.blockedUntil && row.blockedUntil.getTime() > now ? [row.blockedUntil] : []);
  return {
    locked: activeBlocks.length > 0,
    blockedUntil: activeBlocks.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    attemptCount: rows.reduce((max, row) => Math.max(max, row.attemptCount), 0),
  };
}

export async function clearLoginAttempts(identityHash: string): Promise<void> {
  await rawDb.loginRateLimit.deleteMany({ where: { identityHash } });
}

/**
 * Best-effort client IP used only for abuse-control bucketing and telemetry.
 * It is never used for authentication or authorization decisions.
 *
 * Neither X-Forwarded-For nor X-Real-Ip is trustworthy without a trusted-proxy
 * configuration, so callers must treat the per-identity bucket (not the IP
 * bucket) as the real protection. We prefer the leftmost X-Forwarded-For entry
 * (standard proxy semantics) and fall back to X-Real-Ip.
 */
export function requestIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
