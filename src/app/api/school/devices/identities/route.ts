import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const createSchema = z.object({
  deviceKind: z.enum(["fingerprint", "card"]),
  externalId: z.string().trim().min(1).max(200),
  targetType: z.enum(["student", "staff"]),
  targetId: z.string().min(1).max(100)
});

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [identities, students, staff] = await Promise.all([
        tx.deviceIdentity.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            deviceKind: true,
            externalId: true,
            studentId: true,
            staffId: true,
            createdAt: true
          }
        }),
        tx.student.findMany({
          where: { status: "active" },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            admissionNo: true,
            photoUrl: true,
            faceEnrollments: { select: { id: true, enrolledAt: true }, take: 1, orderBy: { enrolledAt: "desc" } },
            guardians: {
              where: { isPrimary: true },
              take: 1,
              select: { guardian: { select: { id: true, name: true } } },
            },
          }
        }),
        tx.user.findMany({
          where: { status: { in: ["active", "pending"] } },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            faceEnrollments: { select: { id: true, enrolledAt: true }, take: 1, orderBy: { enrolledAt: "desc" } },
          }
        })
      ]);
      return {
        identities,
        students: students.map((student) => ({
          id: student.id,
          name: student.name,
          admissionNo: student.admissionNo,
          photoUrl: student.photoUrl,
          faceEnrolledAt: student.faceEnrollments[0]?.enrolledAt ?? null,
          primaryGuardian: student.guardians[0]?.guardian ?? null,
        })),
        staff: staff.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          faceEnrolledAt: user.faceEnrollments[0]?.enrolledAt ?? null,
        })),
      };
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = createSchema.parse(await request.json());
    const identity = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");

      const person = input.targetType === "student"
        ? await tx.student.findUnique({ where: { id: input.targetId }, select: { id: true } })
        : await tx.user.findUnique({ where: { id: input.targetId }, select: { id: true } });
      if (!person) throw new AppError("Target person was not found in this school.", 404, "NOT_FOUND");

      const created = await tx.deviceIdentity.create({
        data: {
          schoolId: session.schoolId,
          deviceKind: input.deviceKind,
          externalId: input.externalId,
          studentId: input.targetType === "student" ? input.targetId : undefined,
          staffId: input.targetType === "staff" ? input.targetId : undefined
        },
        select: {
          id: true,
          deviceKind: true,
          externalId: true,
          studentId: true,
          staffId: true,
          createdAt: true
        }
      });

      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.identity_registered",
        entityType: "DeviceIdentity",
        entityId: created.id,
        after: created
      });
      return created;
    });

    return NextResponse.json({ ok: true, identity }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = z.object({ id: z.string().min(1).max(100) }).parse(await request.json());
    const identity = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.deviceIdentity.findUnique({ where: { id: input.id } });
      if (!before) throw new AppError("Device identity was not found in this school.", 404, "NOT_FOUND");
      const deleted = await tx.deviceIdentity.delete({ where: { id: before.id } });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.identity_removed",
        entityType: "DeviceIdentity",
        entityId: deleted.id,
        before
      });
      return deleted;
    });
    return NextResponse.json({ ok: true, identity });
  } catch (error) {
    return routeError(error);
  }
}
