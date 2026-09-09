import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppError, routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import { generateDeviceSecret, hashDeviceSecret } from "@/lib/device-auth";
import { ATTENDANCE_DEVICE_CATALOG, attendanceDeviceCatalogItem } from "@/lib/attendance-device-catalog";
import { attendanceDeviceOnline, getAttendanceControlConfig } from "@/lib/attendance-control";

const createSchema = z.object({
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  label: z.string().trim().min(1).max(120),
  catalogId: z.string().trim().min(1).max(100),
  locationLabel: z.string().trim().max(160).optional()
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().min(1).max(100), action: z.literal("revoke") }),
  z.object({
    id: z.string().min(1).max(100),
    action: z.literal("updateProfile"),
    label: z.string().trim().min(1).max(120),
    catalogId: z.string().trim().min(1).max(100),
    kind: z.enum(["face", "fingerprint", "card"]),
    locationLabel: z.string().trim().max(160).optional()
  }),
  z.object({ id: z.string().min(1).max(100), action: z.literal("rotateSecret") })
]);

type ProfileRow = {
  deviceId: string;
  vendor: string;
  model: string;
  connectionMode: string;
  capabilities: unknown;
  locationLabel: string | null;
  lastHeartbeatAt: Date | null;
  firmwareVersion: string | null;
  bridgeVersion: string | null;
  statusMessage: string | null;
};

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const result = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [devices, profiles, control] = await Promise.all([
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
        tx.$queryRaw<ProfileRow[]>`
          SELECT "deviceId", "vendor", "model", "connectionMode", "capabilities", "locationLabel",
                 "lastHeartbeatAt", "firmwareVersion", "bridgeVersion", "statusMessage"
          FROM "AttendanceDeviceProfile"
          WHERE "schoolId" = ${session.schoolId}
        `,
        getAttendanceControlConfig(tx, session.schoolId)
      ]);
      const byDevice = new Map(profiles.map((profile) => [profile.deviceId, profile]));
      const now = new Date();
      return {
        catalog: ATTENDANCE_DEVICE_CATALOG,
        devices: devices.map((device) => {
          const profile = byDevice.get(device.id);
          return {
            ...device,
            profile: profile ?? null,
            online: device.status === "active" && attendanceDeviceOnline(
              device.lastSeenAt,
              profile?.lastHeartbeatAt,
              control.config.devices.onlineWindowSeconds,
              now
            )
          };
        }),
        onlineWindowSeconds: control.config.devices.onlineWindowSeconds
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
    const catalog = attendanceDeviceCatalogItem(input.catalogId);
    if (!catalog) throw new AppError("Choose a supported attendance device profile.", 400, "INVALID_DEVICE_PROFILE");
    if (!catalog.capabilities.includes(input.kind)) {
      throw new AppError("The selected hardware profile does not support that attendance method.", 400, "DEVICE_CAPABILITY_MISMATCH");
    }

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
      await tx.$executeRaw`
        INSERT INTO "AttendanceDeviceProfile"
          ("deviceId", "schoolId", "vendor", "model", "connectionMode", "capabilities", "locationLabel", "config", "updatedAt")
        VALUES
          (${created.id}, ${session.schoolId}, ${catalog.vendor}, ${catalog.model}, ${catalog.connectionMode}, ${JSON.stringify(catalog.capabilities)}::jsonb, ${input.locationLabel || input.label}, ${JSON.stringify({ catalogId: catalog.id, readiness: catalog.readiness })}::jsonb, CURRENT_TIMESTAMP)
      `;
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
          catalogId: catalog.id,
          vendor: catalog.vendor,
          model: catalog.model,
          connectionMode: catalog.connectionMode,
          locationLabel: input.locationLabel || input.label
        }
      });
      return { ...created, catalog };
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
    const result = await withTenant(session.schoolId, async (tx) => {
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
      if (!before) throw new AppError("Device not found in this school.", 404, "NOT_FOUND");

      if (input.action === "revoke") {
        const updated = await tx.device.update({
          where: { id: before.id },
          data: { status: "revoked" },
          select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
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
        return { device: updated };
      }

      if (input.action === "rotateSecret") {
        if (before.status !== "active") throw new AppError("Only active devices can receive a new secret.", 409, "DEVICE_NOT_ACTIVE");
        const deviceSecret = generateDeviceSecret();
        await tx.device.update({ where: { id: before.id }, data: { apiKeyHash: hashDeviceSecret(deviceSecret) } });
        await appendSchoolAudit(tx, {
          schoolId: session.schoolId,
          actorId: session.userId,
          action: "device.secret_rotated",
          entityType: "Device",
          entityId: before.id,
          before: { deviceSerial: before.deviceSerial },
          after: { rotated: true }
        });
        return { device: before, deviceSecret };
      }

      const catalog = attendanceDeviceCatalogItem(input.catalogId);
      if (!catalog) throw new AppError("Choose a supported attendance device profile.", 400, "INVALID_DEVICE_PROFILE");
      if (!catalog.capabilities.includes(input.kind)) throw new AppError("The selected hardware profile does not support that attendance method.", 400, "DEVICE_CAPABILITY_MISMATCH");
      const updated = await tx.device.update({
        where: { id: before.id },
        data: { label: input.label, kind: input.kind },
        select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
      });
      await tx.$executeRaw`
        INSERT INTO "AttendanceDeviceProfile"
          ("deviceId", "schoolId", "vendor", "model", "connectionMode", "capabilities", "locationLabel", "config", "updatedAt")
        VALUES
          (${before.id}, ${session.schoolId}, ${catalog.vendor}, ${catalog.model}, ${catalog.connectionMode}, ${JSON.stringify(catalog.capabilities)}::jsonb, ${input.locationLabel || input.label}, ${JSON.stringify({ catalogId: catalog.id, readiness: catalog.readiness })}::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT ("deviceId") DO UPDATE SET
          "vendor" = EXCLUDED."vendor",
          "model" = EXCLUDED."model",
          "connectionMode" = EXCLUDED."connectionMode",
          "capabilities" = EXCLUDED."capabilities",
          "locationLabel" = EXCLUDED."locationLabel",
          "config" = EXCLUDED."config",
          "updatedAt" = CURRENT_TIMESTAMP
      `;
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.profile_updated",
        entityType: "Device",
        entityId: before.id,
        before,
        after: { ...updated, catalogId: catalog.id, vendor: catalog.vendor, model: catalog.model, locationLabel: input.locationLabel || input.label }
      });
      return { device: updated };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return routeError(error);
  }
}
