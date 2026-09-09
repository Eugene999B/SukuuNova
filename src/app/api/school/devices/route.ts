import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-auth";
import { ATTENDANCE_DEVICE_PROFILES, attendanceDeviceProfile } from "@/lib/attendance-device-catalog";
import { readAttendancePolicy } from "@/lib/attendance-policy";

const profileIds = ATTENDANCE_DEVICE_PROFILES.map((profile) => profile.id) as [string, ...string[]];
const createSchema = z.object({
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  label: z.string().trim().min(1).max(120),
  profileId: z.enum(profileIds).default("sukuunova-direct"),
  modelName: z.string().trim().max(120).optional(),
});
const patchSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().min(1).max(100), action: z.literal("revoke") }),
  z.object({ id: z.string().min(1).max(100), action: z.literal("rotate_secret") }),
  z.object({ id: z.string().min(1).max(100), action: z.literal("reactivate_with_new_secret") }),
]);

function metadataFromAudit(after: unknown) {
  if (!after || typeof after !== "object") return {};
  const row = after as Record<string, unknown>;
  return {
    profileId: typeof row.profileId === "string" ? row.profileId : undefined,
    modelName: typeof row.modelName === "string" ? row.modelName : undefined,
  };
}

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [devices, policy] = await Promise.all([
        tx.device.findMany({
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
        }),
        readAttendancePolicy(tx, session.schoolId),
      ]);
      const audits = devices.length ? await tx.auditLogSchool.findMany({
        where: { schoolId: session.schoolId, action: "device.registered", entityType: "Device", entityId: { in: devices.map((device) => device.id) } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { entityId: true, after: true },
      }) : [];
      const metadata = new Map<string, ReturnType<typeof metadataFromAudit>>();
      for (const row of audits) if (!metadata.has(row.entityId)) metadata.set(row.entityId, metadataFromAudit(row.after));
      const now = Date.now();
      const offlineMs = policy.devices.heartbeatOfflineSeconds * 1000;
      return {
        policy,
        devices: devices.map((device) => ({
          ...device,
          ...metadata.get(device.id),
          connectivity: device.status !== "active" ? "revoked" : !device.lastSeenAt ? "never_connected" : now - device.lastSeenAt.getTime() <= offlineMs ? "online" : "offline",
        })),
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSchoolSession();
    const input = createSchema.parse(await request.json());
    const profile = attendanceDeviceProfile(input.profileId);
    if (!profile.kinds.includes(input.kind)) throw new AppError(`${profile.name} is not configured for ${input.kind} attendance.`, 400, "DEVICE_PROFILE_KIND_MISMATCH");
    const deviceSecret = generateDeviceSecret();
    const apiKeyHash = hashDeviceSecret(deviceSecret);

    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { uniqueCode: true } });
      if (!school) throw new AppError("School not found.", 404, "NOT_FOUND");
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
          label: created.label,
          profileId: profile.id,
          modelName: input.modelName || null,
          connectionMode: profile.connectionMode,
        }
      });
      return { device: created, schoolCode: school.uniqueCode };
    });

    const origin = new URL(request.url).origin;
    return NextResponse.json(
      {
        ok: true,
        device: { ...result.device, profileId: profile.id, modelName: input.modelName || null, connectivity: "never_connected" },
        deviceSecret,
        connection: {
          schoolCode: result.schoolCode,
          deviceSerial: result.device.deviceSerial,
          kind: result.device.kind,
          profileId: profile.id,
          connectionMode: profile.connectionMode,
          heartbeatUrl: `${origin}/api/devices/heartbeat`,
          attendanceUrl: `${origin}/api/devices/attendance`,
        },
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
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const before = await tx.device.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
      });
      if (!before) throw new AppError("Device not found in this school.", 404, "NOT_FOUND");

      if (input.action === "revoke") {
        const updated = await tx.device.update({ where: { id: before.id }, data: { status: "revoked" }, select: { id: true, status: true, deviceSerial: true, kind: true, label: true } });
        await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "device.revoked", entityType: "Device", entityId: updated.id, before, after: updated });
        return { device: updated, deviceSecret: undefined as string | undefined };
      }

      const deviceSecret = generateDeviceSecret();
      const apiKeyHash = hashDeviceSecret(deviceSecret);
      const updated = await tx.device.update({
        where: { id: before.id },
        data: { apiKeyHash, ...(input.action === "reactivate_with_new_secret" ? { status: "active" } : {}) },
        select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: input.action === "reactivate_with_new_secret" ? "device.reactivated" : "device.secret_rotated",
        entityType: "Device",
        entityId: updated.id,
        before: { ...before, secret: "redacted" },
        after: { ...updated, secret: "rotated" },
      });
      return { device: updated, deviceSecret };
    });

    return NextResponse.json({ ok: true, ...result, ...(result.deviceSecret ? { warning: "Copy this new device secret now. It will not be shown again." } : {}) });
  } catch (error) {
    return routeError(error);
  }
}
