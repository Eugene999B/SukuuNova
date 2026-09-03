import type { PlatformSession } from "./auth";
import { withTenant } from "./db";
import { requirePlatformPermission } from "./platform-permissions";

export async function listSupportTicketsForPlatform(session: PlatformSession, schoolId: string) {
  await requirePlatformPermission(session, "support.view");
  return withTenant(schoolId, (tx) =>
    tx.$queryRawUnsafe<unknown[]>(
      `SELECT t."id",t."schoolId",t."raisedByUserId",t."subject",t."status",t."createdAt",t."updatedAt"
       FROM "SupportTicket" t
       WHERE t."schoolId"=$1
       ORDER BY t."createdAt" DESC`,
      schoolId,
    ),
  );
}

export async function getSupportTicketForPlatform(session: PlatformSession, schoolId: string, ticketId: string) {
  await requirePlatformPermission(session, "support.view");
  return withTenant(schoolId, async (tx) => {
    const tickets = await tx.$queryRawUnsafe<Array<{
      id: string;
      schoolId: string;
      raisedByUserId: string;
      subject: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>>(
      `SELECT "id","schoolId","raisedByUserId","subject","status","createdAt","updatedAt"
       FROM "SupportTicket"
       WHERE "id"=$1 AND "schoolId"=$2
       LIMIT 1`,
      ticketId,
      schoolId,
    );
    const ticket = tickets[0];
    if (!ticket) return null;
    const messages = await tx.$queryRawUnsafe<Array<{
      id: string;
      senderId: string;
      body: string;
      sentAt: Date;
    }>>(
      `SELECT "id","senderId","body","sentAt"
       FROM "SupportTicketMessage"
       WHERE "ticketId"=$1 AND "schoolId"=$2
       ORDER BY "sentAt" ASC
       LIMIT 250`,
      ticketId,
      schoolId,
    );
    return { ...ticket, messages };
  });
}
