import type { TenantDb } from "./db";
import { requirePermission } from "./rbac";

export async function listOwnSupportTickets(tx: TenantDb, schoolId: string, actorId: string) {
  await requirePermission(tx, actorId, "support:view_own");
  return tx.$queryRawUnsafe<unknown[]>(
    `SELECT t.*,COALESCE(json_agg(m ORDER BY m."sentAt") FILTER (WHERE m."id" IS NOT NULL),'[]') messages
     FROM "SupportTicket" t
     LEFT JOIN "SupportTicketMessage" m ON m."ticketId"=t."id" AND m."schoolId"=t."schoolId"
     WHERE t."schoolId"=$1 AND t."raisedByUserId"=$2
     GROUP BY t."id"
     ORDER BY t."createdAt" DESC`,
    schoolId,
    actorId,
  );
}
