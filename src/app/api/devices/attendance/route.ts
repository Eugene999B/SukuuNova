import { NextResponse } from "next/server";
import { z } from "zod";
import { db, withTenant } from "@/lib/db";
import { AppError, UnauthorizedError, routeError } from "@/lib/errors";
import { verifyDeviceSignature } from "@/lib/device-auth";
import { matchFaceAttendance } from "@/lib/face-service";
import { matchFingerprintAttendance, matchCardAttendance } from "@/lib/device-identity-service";
import { enforceDeviceAttendanceRateLimit } from "@/lib/device-rate-limit";
import { requestIp } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

const schema = z.object({
  schoolCode: z.string().trim().min(2).max(80),
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  capturedAt: z.string().datetime().optional(),
  type: z.enum(["in", "out"]),
  periodId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  image: z.string().min(100).optional(),
  externalId: z.string().trim().max(200).optional(),
  confidence: z.number().min(0).max(100).optional()
});

async function readBodyWithLimit(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new AppError("Device request payload is too large.", 413, "PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AppError("Device request payload is too large.", 413, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function POST(request: Request) {
  try {
    await enforceDeviceAttendanceRateLimit(requestIp(request.headers));
    const rawBody = await readBodyWithLimit(request);
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(JSON.parse(rawBody));
    } catch {
      throw new AppError("Invalid device request payload.", 400, "INVALID_INPUT");
    }

    await enforceDeviceAttendanceRateLimit(requestIp(request.headers), input.deviceSerial);

    const timestamp = request.headers.get("x-device-timestamp") ?? "";
    const nonce = request.headers.get("x-device-nonce") ?? "";
    const signature = request.headers.get("x-device-signature") ?? "";
    if (!timestamp || !nonce || !signature) {
      throw new UnauthorizedError("Missing device authentication headers.");
    }

    const directory = await db.schoolLoginDirectory.findUnique({
      where: { uniqueCode: input.schoolCode.toLowerCase() },
      select: { schoolId: true, status: true }
    });
    if (!directory || directory.status !== "active") {
      throw new UnauthorizedError("Device authentication failed.");
    }

    const result = await withTenant(directory.schoolId, async (tx) => {
      const device = await tx.device.findUnique({
        where: {
          schoolId_deviceSerial: {
            schoolId: directory.schoolId,
            deviceSerial: input.deviceSerial
          }
        },
        select: { id: true, apiKeyHash: true, kind: true, status: true }
      });
      if (!device || device.status !== "active" || device.kind !== input.kind) {
        throw new UnauthorizedError("Device authentication failed.");
      }

      verifyDeviceSignature({
        apiKeyHash: device.apiKeyHash,
        timestamp,
        nonce,
        rawBody,
        signature
      });

      const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
      if (Number.isNaN(capturedAt.getTime())) {
        throw new AppError("Invalid device capture timestamp.", 400, "INVALID_ATTENDANCE_TIMESTAMP");
      }

      try {
        await tx.deviceAttendanceReceipt.create({
          data: {
            schoolId: directory.schoolId,
            deviceId: device.id,
            idempotencyKey: input.idempotencyKey,
            nonce,
            capturedAt
          }
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          const sameOperation = await tx.deviceAttendanceReceipt.findFirst({
            where: { deviceId: device.id, idempotencyKey: input.idempotencyKey },
            select: { id: true }
          });
          if (sameOperation) return { status: "duplicate" as const };

          const reusedNonce = await tx.deviceAttendanceReceipt.findFirst({
            where: { deviceId: device.id, nonce },
            select: { id: true }
          });
          if (reusedNonce) {
            throw new UnauthorizedError("Device nonce has already been used.", "REPLAY_DETECTED");
          }
        }
        throw error;
      }

      const serverReceivedAt = new Date();
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: serverReceivedAt }
      });

      const deviationMs = Math.abs(serverReceivedAt.getTime() - capturedAt.getTime());
      if (deviationMs > 10_000) {
        console.warn("Device attendance capture time differs from server time", {
          deviceId: device.id,
          deviationMs
        });
      }

      if (input.periodId) {
        await tx.$executeRaw`SELECT set_config('sukuunova.attendance_period', ${input.periodId}, true)`;
      }

      let recorded: Awaited<ReturnType<typeof matchFaceAttendance>>;
      if (input.kind === "face") {
        if (!input.image) throw new AppError("Face device events require image data.", 400, "INVALID_INPUT");
        recorded = await matchFaceAttendance(tx, {
          schoolId: directory.schoolId,
          image: input.image,
          deviceId: device.id,
          type: input.type,
          deviceAuthenticated: true,
          periodId: input.periodId,
          timestamp: capturedAt
        });
      } else if (input.kind === "fingerprint") {
        if (!input.externalId) throw new AppError("Fingerprint device events require externalId.", 400, "INVALID_INPUT");
        recorded = await matchFingerprintAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type,
          periodId: input.periodId,
          timestamp: capturedAt
        });
      } else {
        if (!input.externalId) throw new AppError("Card device events require externalId.", 400, "INVALID_INPUT");
        recorded = await matchCardAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type,
          periodId: input.periodId,
          timestamp: capturedAt
        });
      }

      if (recorded.status !== "recorded") return recorded;

      const receipt = await tx.deviceAttendanceReceipt.findFirstOrThrow({
        where: { deviceId: device.id, idempotencyKey: input.idempotencyKey },
        select: { id: true }
      });
      await tx.deviceAttendanceReceipt.update({
        where: { id: receipt.id },
        data: { processedAt: new Date() }
      });

      return { status: "recorded" as const, eventId: recorded.event.id };
    });

    return NextResponse.json(
      { ok: true, result },
      { status: result.status === "duplicate" ? 200 : 201 }
    );
  } catch (error) {
    return routeError(error);
  }
}
