import { withTenant } from "./db";
import { ForbiddenError } from "./errors";
const allowed=new Set(["super_admin","platform_admin","support_admin"]);
export async function listSupportTicketsForPlatform(adminId:string,adminRole:string,schoolId:string){void adminId;if(!allowed.has(adminRole))throw new ForbiddenError("Missing platform permission: support:manage");return withTenant(schoolId,tx=>tx.$queryRawUnsafe<unknown[]>(`SELECT t.*,COALESCE(json_agg(m ORDER BY m."sentAt") FILTER (WHERE m."id" IS NOT NULL),'[]') messages FROM "SupportTicket" t LEFT JOIN "SupportTicketMessage" m ON m."ticketId"=t."id" AND m."schoolId"=t."schoolId" WHERE t."schoolId"=$1 GROUP BY t."id" ORDER BY t."createdAt" DESC`,schoolId));}
