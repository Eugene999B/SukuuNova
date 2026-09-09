import { NextResponse } from "next/server";
import { z } from "zod";
import { db, withTenant } from "@/lib/db";
import { AppError, UnauthorizedError, routeError } from "@/lib/errors";
import { verifyDeviceSignature } from "@/lib/device-auth";
import { enforceDeviceAttendanceRateLimit } from "@/lib/device-rate-limit";
import { requestIp } from "@/lib/rate-limit";
import { readAttendancePolicy } from "@/lib/attendance-policy";

const MAX_BODY_BYTES = 16 * 1024;
const schema = z.object({
  schoolCode: z.string().trim().min(2).max(80),
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
});

async function readBodyWithLimit(request: Request) {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new AppError("Heartbeat payload is too large.", 413, "PAYLOAD_TOO_LARGE");
  return text;
}

export async function POST(request: Request) {
  try {
    await enforceDeviceAttendanceRateLimit(requestIp(request.headers));
    const rawBody = await readBodyWithLimit(request);
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(JSON.parse(rawBody));
    } catch {
      throw new AppError("Invalid device heartbeat payload.", 400, "INVALID_INPUT");
    }
    await enforceDeviceAttendanceRateLimit(requestIp(request.headers), input.deviceSerial, { skipIp: true });

    const timestamp = request.headers.get("x-device-timestamp") ?? "";
    const nonce = request.headers.get("x-device-nonce") ?? "";
    const signature = request.headers.get("x-device-signature") ?? "";
    const deviceSecret = request.headers.get("x-device-secret") ?? "";
    if (!timestamp || !nonce || !signature || !deviceSecret) throw new UnauthorizedError("Missing device authentication headers.");

    const directory = await db.schoolLoginDirectory.findUnique({
      where: { uniqueCode: input.schoolCode.toLowerCase() },
      select: { schoolId: true, status: true },
    });
    if (!directory || directory.status !== "active") throw new UnauthorizedError("Device authentication failed.");

    const result = await withTenant(directory.schoolId, async (tx) => {
      const device = await tx.device.findUnique({
        where: { schoolId_deviceSerial: { schoolId: directory.schoolId, deviceSerial: input.deviceSerial } },
        select: { id: true, apiKeyHash: true, kind: true, status: true, label: true },
      });
      if (!device || device.status !== "active" || device.kind !== input.kind) throw new UnauthorizedError("Device authentication failed.");
      verifyDeviceSignature({ apiKeyHash: device.apiKeyHash, deviceSecret, timestamp, nonce, rawBody, signature });

      const policy = await readAttendancePolicy(tx, directory.schoolId);
      if (!policy.devices.enabled) throw new AppError("Attendance devices are disabled by the school.", 409, "ATTENDANCE_DEVICES_DISABLED");
      const now = new Date();
      await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: now } });
      return {
        deviceId: device.id,
        label: device.label,
        serverTime: now.toISOString(),
        policy: {
          timezone: policy.timezone,
          expectedResumptionTime: policy.expectedResumptionTime,
          attendanceGraceMinutes: policy.attendanceGraceMinutes,
          staff: policy.staff,
          students: policy.students,
          heartbeatEverySeconds: Math.max(30, Math.floor(policy.devices.heartbeatOfflineSeconds / 2)),
        },
      };
    });

    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}
