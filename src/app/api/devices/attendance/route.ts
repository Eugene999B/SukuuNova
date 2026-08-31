import { NextResponse } from "next/server";
import { z } from "zod";
import { db, withTenant } from "@/lib/db";
import { AppError, UnauthorizedError, routeError } from "@/lib/errors";
import { verifyDeviceSignature } from "@/lib/device-auth";
import { matchFaceAttendance } from "@/lib/face-service";
import { matchFingerprintAttendance, matchCardAttendance } from "@/lib/device-identity-service";

const schema = z.object({
  schoolCode: z.string().trim().min(2).max(80),
  deviceSerial: z.string().trim().min(2).max(120),
  kind: z.enum(["face", "fingerprint", "card"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  capturedAt: z.string().datetime().optional(),
  type: z.enum(["in", "out"]),
  image: z.string().min(100).optional(),
  externalId: z.string().trim().max(200).optional(),
  confidence: z.number().min(0).max(100).optional()
});

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let input: z.infer<typeof schema>;
    try {
      input = schema.parse(JSON.parse(rawBody));
    } catch {
      throw new AppError("Invalid device request payload.", 400, "INVALID_INPUT");
    }

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

      try {
        await tx.deviceAttendanceReceipt.create({
          data: {
            schoolId: directory.schoolId,
            deviceId: device.id,
            idempotencyKey: input.idempotencyKey,
            nonce,
            capturedAt: input.capturedAt ? new Date(input.capturedAt) : null
          }
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          const duplicate = await tx.deviceAttendanceReceipt.findFirst({
            where: {
              deviceId: device.id,
              OR: [
                { idempotencyKey: input.idempotencyKey },
                { nonce }
              ]
            },
            select: { id: true }
          });
          if (duplicate) return { status: "duplicate" as const };
        }
        throw error;
      }

      const serverReceivedAt = new Date();
      await tx.device.update({
        where: { id: device.id },
        data: { lastSeenAt: serverReceivedAt }
      });

      if (input.capturedAt) {
        const capturedAt = new Date(input.capturedAt);
        const deviationMs = Math.abs(serverReceivedAt.getTime() - capturedAt.getTime());
        if (deviationMs > 10_000) {
          console.warn("Device attendance capture time differs from server time; server time is authoritative", {
            deviceId: device.id,
            deviationMs
          });
        }
      }

      let recorded: Awaited<ReturnType<typeof matchFaceAttendance>>;
      if (input.kind === "face") {
        if (!input.image) throw new AppError("Face device events require image data.", 400, "INVALID_INPUT");
        recorded = await matchFaceAttendance(tx, {
          schoolId: directory.schoolId,
          image: input.image,
          deviceId: device.id,
          type: input.type,
          deviceAuthenticated: true
        });
      } else if (input.kind === "fingerprint") {
        if (!input.externalId) throw new AppError("Fingerprint device events require externalId.", 400, "INVALID_INPUT");
        recorded = await matchFingerprintAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type
        });
      } else {
        if (!input.externalId) throw new AppError("Card device events require externalId.", 400, "INVALID_INPUT");
        recorded = await matchCardAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type
        });
      }

      if (recorded.status !== "recorded") return recorded;

      if (recorded.status !== "recorded") return recorded;

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
