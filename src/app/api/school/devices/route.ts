import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-auth";

const createSchema = z.object({
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  label: z.string().trim().min(1).max(120)
});
const patchSchema = z.object({ id: z.string().min(1), action: z.literal("revoke") });

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const devices = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      return tx.device.findMany({
        select: {
          id: true,
          deviceSerial: true,
          kind: true,
          label: true,
          status: true,
          lastSeenAt: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      });
    });
    return NextResponse.json({ devices });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = createSchema.parse(await request.json());
    const deviceSecret = generateDeviceSecret();
    const apiKeyHash = hashDeviceSecret(deviceSecret);

    const device = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const created = await tx.device.create({
        data: {
          schoolId: session.schoolId,
          deviceSerial: input.deviceSerial,
          kind: input.kind,
          label: input.label,
          apiKeyHash,
          status: "active"
        },
        select: {
          id: true,
          deviceSerial: true,
          kind: true,
          label: true,
          status: true,
          createdAt: true
        }
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.registered",
        entityType: "Device",
        entityId: created.id,
        after: {
          deviceSerial: created.deviceSerial,
          kind: created.kind,
          label: created.label
        }
      });
      return created;
    });

    return NextResponse.json(
      {
        ok: true,
        device,
        deviceSecret,
        warning: "Copy this device secret now. It will never be shown again."
      },
      { status: 201 }
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = patchSchema.parse(await request.json());
    const device = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.device.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          status: true,
          deviceSerial: true,
          kind: true,
          label: true
        }
      });
      if (!before) throw new Error("Device not found.");

      const updated = await tx.device.update({
        where: { id: before.id },
        data: { status: "revoked" },
        select: {
          id: true,
          status: true,
          deviceSerial: true,
          kind: true,
          label: true
        }
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.revoked",
        entityType: "Device",
        entityId: updated.id,
        before,
        after: updated
      });
      return updated;
    });

    return NextResponse.json({ ok: true, device });
  } catch (error) {
    return routeError(error);
  }
}
