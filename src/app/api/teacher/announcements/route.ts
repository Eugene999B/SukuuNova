import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSchoolAudit } from "@/lib/audit";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant, type TenantDb } from "@/lib/db";
import { ForbiddenError, routeError } from "@/lib/errors";

const sendSchema = z.object({
  classId: z.string().trim().min(1),
  audience: z.enum(["class", "selected"]),
  studentIds: z.array(z.string().trim().min(1)).max(250).default([]),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(8000),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function teacherClasses(tx: TenantDb, schoolId: string, teacherId: string) {
  return tx.class.findMany({
    where: { schoolId, OR: [{ classTeacherId: teacherId }, { subjectAssignments: { some: { teacherId } } }] },
    select: { id: true, name: true, level: true },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    return await withTenant(session.schoolId, async (tx) => {
      const access = await getSchoolAuthorization(tx, session.userId);
      if (access.workspace !== "teacher" || !access.isTeacher) throw new ForbiddenError("Teacher announcements are not available for this account.");
      const classes = await teacherClasses(tx, session.schoolId, session.userId);
      const classIds = classes.map((item) => item.id);
      const [students, sent] = await Promise.all([
        tx.student.findMany({
          where: { schoolId: session.schoolId, status: "active", classId: { in: classIds } },
          select: { id: true, name: true, admissionNo: true, classId: true, photoUrl: true },
          orderBy: [{ classId: "asc" }, { name: "asc" }],
        }),
        tx.message.findMany({
          where: { schoolId: session.schoolId, channel: "in_app", templateKey: "teacher_class_announcement" },
          select: { id: true, body: true, createdAt: true, templateVariables: true },
          orderBy: { createdAt: "desc" },
          take: 250,
        }),
      ]);
      const seenBatches = new Set<string>();
      const announcements = sent.flatMap((row) => {
        const metadata = object(row.templateVariables);
        if (metadata.senderId !== session.userId) return [];
        const batchId = typeof metadata.batchId === "string" ? metadata.batchId : row.id;
        if (seenBatches.has(batchId)) return [];
        seenBatches.add(batchId);
        return [{
          id: batchId,
          title: typeof metadata.title === "string" ? metadata.title : row.body.split("\n")[0],
          body: typeof metadata.body === "string" ? metadata.body : row.body.replace(/^.*?\n\n/, ""),
          audienceLabel: typeof metadata.audienceLabel === "string" ? metadata.audienceLabel : "Class announcement",
          priority: typeof metadata.priority === "string" ? metadata.priority : "normal",
          recipientCount: Number(metadata.recipientCount ?? 1),
          createdAt: row.createdAt,
        }];
      });
      return NextResponse.json({ classes, students, announcements });
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = sendSchema.parse(await request.json());
    return await withTenant(session.schoolId, async (tx) => {
      const access = await getSchoolAuthorization(tx, session.userId);
      if (access.workspace !== "teacher" || !access.isTeacher) throw new ForbiddenError("Teacher announcements are not available for this account.");
      const classes = await teacherClasses(tx, session.schoolId, session.userId);
      const targetClass = classes.find((item) => item.id === input.classId);
      if (!targetClass) throw new ForbiddenError("You can announce only to a class inside your teaching scope.");

      const selectedIds = new Set(input.studentIds);
      const students = await tx.student.findMany({
        where: {
          schoolId: session.schoolId,
          classId: input.classId,
          status: "active",
          ...(input.audience === "selected" ? { id: { in: [...selectedIds] } } : {}),
        },
        select: {
          id: true,
          name: true,
          guardians: { select: { guardian: { select: { id: true, userId: true, phone: true } } } },
        },
        orderBy: { name: "asc" },
      });
      if (!students.length) return NextResponse.json({ error: "NO_RECIPIENTS", message: "No learners match this announcement." }, { status: 400 });
      if (input.audience === "selected" && students.length !== selectedIds.size) throw new ForbiddenError("One or more selected learners are outside this class.");

      const recipients = new Map<string, { userId: string; phone: string }>();
      for (const student of students) {
        for (const link of student.guardians) {
          if (!link.guardian.userId) continue;
          recipients.set(link.guardian.userId, { userId: link.guardian.userId, phone: link.guardian.phone || "" });
        }
      }
      if (!recipients.size) return NextResponse.json({ error: "NO_GUARDIAN_ACCOUNTS", message: "The selected learners do not have active guardian portal accounts." }, { status: 409 });

      const audienceLabel = input.audience === "class"
        ? `${targetClass.level ? `${targetClass.level} · ` : ""}${targetClass.name} · entire class`
        : `${students.length} selected learner${students.length === 1 ? "" : "s"}`;
      const batchId = `teacher-announcement-${Date.now()}-${randomBytes(5).toString("hex")}`;
      const metadata = {
        title: input.title,
        body: input.body,
        senderType: "school_user",
        senderId: session.userId,
        senderName: session.name,
        announcement: true,
        audience: input.audience,
        audienceLabel,
        classId: input.classId,
        studentIds: students.map((student) => student.id),
        studentNames: students.map((student) => student.name),
        priority: input.priority,
        recipientCount: recipients.size,
        batchId,
        attachments: [],
      };
      for (const recipient of recipients.values()) {
        await tx.message.create({
          data: {
            schoolId: session.schoolId,
            channel: "in_app",
            recipientType: "user",
            recipientId: recipient.userId,
            recipientPhone: recipient.phone,
            body: `${input.title}\n\n${input.body}`,
            templateKey: "teacher_class_announcement",
            templateVariables: metadata,
            status: "delivered",
            attempts: 1,
            sentAt: new Date(),
            nextAttemptAt: new Date(),
            idempotencyKey: `${batchId}:${recipient.userId}`,
          },
        });
      }
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "teacher.announcement.sent",
        entityType: "MessageBatch",
        entityId: batchId,
        before: null,
        after: { classId: input.classId, audience: input.audience, studentIds: students.map((student) => student.id), guardianAccounts: recipients.size, priority: input.priority, title: input.title },
      });
      return NextResponse.json({ ok: true, message: `Announcement delivered to ${recipients.size} guardian account${recipients.size === 1 ? "" : "s"}.`, batchId });
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "Choose a class, audience, title and announcement." }, { status: 400 });
    return routeError(error);
  }
}
