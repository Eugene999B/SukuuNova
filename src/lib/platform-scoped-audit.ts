import { db } from "./db";
import { AppError, ForbiddenError } from "./errors";
import type { PlatformAuditPage } from "./platform-admin-service";

type AuditInput = {
  limit?: number;
  cursor?: string;
  query?: string;
  action?: string;
  sensitiveOnly?: boolean;
};

export async function listScopedPlatformAudit(schoolIds: string[], input: AuditInput = {}): Promise<PlatformAuditPage> {
  if (!schoolIds.length) return { events: [], nextCursor: null };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const query = input.query?.trim().toLowerCase() ?? "";
  const action = input.action?.trim() ?? "";
  const sensitiveOnly = Boolean(input.sensitiveOnly);
  let cursorDate: Date | null = null;
  let cursorId: string | null = null;

  if (input.cursor) {
    const separator = input.cursor.lastIndexOf("_");
    if (separator <= 0) throw new AppError("Invalid audit cursor.", 400, "INVALID_CURSOR");
    const parsedDate = new Date(input.cursor.slice(0, separator));
    const idText = input.cursor.slice(separator + 1);
    if (!idText || Number.isNaN(parsedDate.getTime())) throw new AppError("Invalid audit cursor.", 400, "INVALID_CURSOR");
    cursorDate = parsedDate;
    cursorId = idText;
  }

  const rows = await db.$queryRawUnsafe<PlatformAuditPage["events"]>(
    `SELECT l."id", l."actorId", a."name" AS "actorName", a."email" AS "actorEmail", l."action", l."targetSchoolId", l."targetEntity", l."createdAt", l."meta"
     FROM "AuditLogPlatform" l
     LEFT JOIN "PlatformAdmin" a ON a."id"=l."actorId"
     WHERE l."targetSchoolId" = ANY($1::text[])
       AND ($2='' OR LOWER(l."action") LIKE '%' || $2 || '%' OR LOWER(COALESCE(a."name",'')) LIKE '%' || $2 || '%' OR LOWER(COALESCE(a."email",'')) LIKE '%' || $2 || '%' OR LOWER(COALESCE(l."targetEntity",'')) LIKE '%' || $2 || '%' OR LOWER(COALESCE(l."targetSchoolId",'')) LIKE '%' || $2 || '%')
       AND ($3='' OR l."action"=$3)
       AND ($4=false OR LOWER(l."action") ~ '(imperson|delete|suspend|permission|password|role|setting|billing)')
       AND ($5::timestamptz IS NULL OR (l."createdAt",l."id") < ($5::timestamptz,$6))
     ORDER BY l."createdAt" DESC, l."id" DESC
     LIMIT $7`,
    schoolIds,
    query,
    action,
    sensitiveOnly,
    cursorDate,
    cursorId,
    limit + 1,
  );

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const last = events.at(-1);
  return {
    events,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
  };
}

export async function requireScopedAuditAccess(schoolIds: string[] | null): Promise<string[] | null> {
  if (schoolIds === null) return null;
  if (!schoolIds) throw new ForbiddenError("Audit school scope is required.");
  return schoolIds;
}
