import type { PlatformSession } from "./auth";
import { withTenant } from "./db";
import { requirePlatformPermission } from "./platform-permissions";

export async function listSupportTicketsForPlatform(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "support.view");
  return withTenant(schoolId, (tx) =>
    tx.$queryRawUnsafe<unknown[]>(
      `SELECT t.*,COALESCE(json_agg(m ORDER BY m."sentAt") FILTER (WHERE m."id" IS NOT NULL),'[]') messages
       FROM "SupportTicket" t
       LEFT JOIN "SupportTicketMessage" m ON m."ticketId"=t."id" AND m."schoolId"=t."schoolId"
       WHERE t."schoolId"=$1
       GROUP BY t."id"
       ORDER BY t."createdAt" DESC`,
      schoolId,
    ),
  );
}
