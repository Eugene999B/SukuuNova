import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/db";
import { requireSchoolSession } from "@/lib/school-auth";
import { ForbiddenError } from "@/lib/errors";
import { appendSchoolAudit } from "@/lib/audit";

const schema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(5000),
  audience: z.enum(["all_staff", "teaching_staff", "guardians", "role", "individual"]),
  roleId: z.string().trim().optional(),
  userId: z.string().trim().optional()
});

const allowedRoles = new Set([
  "owner",
  "principal / headteacher",
  "vice principal / deputy head",
  "assistant headteacher",
  "administrator",
  "communications officer",
  "community / parent liaison officer"
]);

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = schema.parse(await request.json());

    return withTenant(session.schoolId, async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: session.userId },
        select: { userRoles: { select: { role: { select: { name: true } } } } }
      });
      const isAllowed = actor?.userRoles.some((entry) => allowedRoles.has(entry.role.name.toLowerCase()));
      if (!isAllowed) throw new ForbiddenError("Your account is not authorised to publish announcements.");

      let recipients: Array<{ id: string; name: string; phone: string | null }> = [];
      if (input.audience === "all_staff") {
        recipients = await tx.user.findMany({ where: { status: "active", schoolId: session.schoolId }, select: { id: true, name: true, phone: true } });
      } else if (input.audience === "teaching_staff") {
        recipients = await tx.user.findMany({ where: { status: "active", schoolId: session.schoolId, userRoles: { some: { role: { name: { contains: "teacher", mode: "insensitive" } } } } }, select: { id: true, name: true, phone: true } });
      } else if (input.audience === "guardians") {
        recipients = await tx.user.findMany({ where: { status: "active", schoolId: session.schoolId, guardianProfiles: { some: { schoolId: session.schoolId } } }, select: { id: true, name: true, phone: true } });
      } else if (input.audience === "role") {
        if (!input.roleId) throw new ForbiddenError("Choose a role audience.");
        recipients = await tx.user.findMany({ where: { status: "active", schoolId: session.schoolId, userRoles: { some: { roleId: input.roleId } } }, select: { id: true, name: true, phone: true } });
      } else {
        if (!input.userId) throw new ForbiddenError("Choose a recipient.");
        const user = await tx.user.findFirst({ where: { id: input.userId, schoolId: session.schoolId, status: "active" }, select: { id: true, name: true, phone: true } });
        if (user) recipients = [user];
      }

      const now = new Date();
      const announcementId = `announcement-${now.getTime()}-${session.userId.slice(0, 8)}`;
      if (recipients.length) {
        await tx.message.createMany({
          data: recipients.map((recipient) => ({
            schoolId: session.schoolId,
            channel: "in_app",
            recipientType: "announcement",
            recipientId: recipient.id,
            recipientPhone: recipient.phone ?? "",
            body: `${input.title}\n\n${input.body}`,
            templateKey: "school_announcement",
            templateVariables: { title: input.title, audience: input.audience },
            status: "delivered",
            attempts: 1,
            nextAttemptAt: now,
            sentAt: now,
            idempotencyKey: `announcement:${session.schoolId}:${announcementId}:${recipient.id}:in_app`
          }))
        });
      }

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "announcement.published",
        entityType: "Announcement",
        entityId: announcementId,
        after: { title: input.title, audience: input.audience, recipientCount: recipients.length }
      });

      return NextResponse.json({ ok: true, recipientCount: recipients.length });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Please complete the announcement details." }, { status: 400 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    console.error("Announcement route error", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Unable to publish the announcement." }, { status: 500 });
  }
}
