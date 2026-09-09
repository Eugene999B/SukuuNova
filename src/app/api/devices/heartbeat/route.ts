import { NextResponse } from "next/server";
import { z } from "zod";
import { db, withTenant } from "@/lib/db";
import { AppError, UnauthorizedError, routeError } from "@/lib/errors";
import { verifyDeviceSignature } from "@/lib/device-auth";
import { enforceDeviceAttendanceRateLimit } from "@/lib/device-rate-limit";
import { requestIp } from "@/lib/rate-limit";

const schema = z.object({
  schoolCode: z.string().trim().min(2).max(80),
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  firmwareVersion: z.string().trim().max(120).optional(),
  bridgeVersion: z.string().trim().max(120).optional(),
  statusMessage: z.string().trim().max(240).optional()
});

export async function POST(request: Request) {
  try {
    await enforceDeviceAttendanceRateLimit(requestIp(request.headers));
    const rawBody = await request.text();
    if (rawBody.length > 32 * 1024) throw new AppError("Heartbeat payload is too large.", 413, "PAYLOAD_TOO_LARGE");
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(JSON.parse(rawBody));
    } catch {
      throw new AppError("Invalid heartbeat payload.", 400, "INVALID_INPUT");
    }

    await enforceDeviceAttendanceRateLimit(requestIp(request.headers), input.deviceSerial, { skipIp: true });
    const timestamp = request.headers.get("x-device-timestamp") ?? "";
    const nonce = request.headers.get("x-device-nonce") ?? "";
    const signature = request.headers.get("x-device-signature") ?? "";
    const deviceSecret = request.headers.get("x-device-secret") ?? "";
    if (!timestamp || !nonce || !signature || !deviceSecret) throw new UnauthorizedError("Missing device authentication headers.");

    const directory = await db.schoolLoginDirectory.findUnique({
      where: { uniqueCode: input.schoolCode.toLowerCase() },
      select: { schoolId: true, status: true }
    });
    if (!directory || directory.status !== "active") throw new UnauthorizedError("Device authentication failed.");

    const result = await withTenant(directory.schoolId, async (tx) => {
      const device = await tx.device.findUnique({
        where: { schoolId_deviceSerial: { schoolId: directory.schoolId, deviceSerial: input.deviceSerial } },
        select: { id: true, apiKeyHash: true, kind: true, status: true }
      });
      if (!device || device.status !== "active" || device.kind !== input.kind) throw new UnauthorizedError("Device authentication failed.");

      verifyDeviceSignature({ apiKeyHash: device.apiKeyHash, deviceSecret, timestamp, nonce, rawBody, signature });
      const now = new Date();
      await tx.$executeRaw`
        INSERT INTO "AttendanceDeviceProfile"
          ("deviceId", "schoolId", "vendor", "model", "connectionMode", "capabilities", "config", "lastHeartbeatAt", "firmwareVersion", "bridgeVersion", "statusMessage", "updatedAt")
        VALUES
          (${device.id}, ${directory.schoolId}, 'Generic', 'Existing device', 'https_push', ${JSON.stringify([device.kind])}::jsonb, '{}'::jsonb, ${now}, ${input.firmwareVersion ?? null}, ${input.bridgeVersion ?? null}, ${input.statusMessage ?? "Online"}, CURRENT_TIMESTAMP)
        ON CONFLICT ("deviceId") DO UPDATE SET
          "lastHeartbeatAt" = EXCLUDED."lastHeartbeatAt",
          "firmwareVersion" = COALESCE(EXCLUDED."firmwareVersion", "AttendanceDeviceProfile"."firmwareVersion"),
          "bridgeVersion" = COALESCE(EXCLUDED."bridgeVersion", "AttendanceDeviceProfile"."bridgeVersion"),
          "statusMessage" = EXCLUDED."statusMessage",
          "updatedAt" = CURRENT_TIMESTAMP
      `;
      return { deviceId: device.id, receivedAt: now.toISOString() };
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return routeError(error);
  }
}
