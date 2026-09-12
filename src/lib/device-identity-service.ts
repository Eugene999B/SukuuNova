import { Prisma } from "@prisma/client";
import { AppError } from "./errors";
import { recordAttendance } from "./attendance-service";
import { requireActiveStaffTarget } from "./authorization";

type Transaction = Prisma.TransactionClient;

type MatchInput = {
  tx: Transaction;
  schoolId: string;
  deviceId: string;
  externalId: string;
  confidence?: number;
  type: "in" | "out";
  kind: "face" | "fingerprint" | "card";
  periodId?: string;
  timestamp?: Date;
};

export async function matchDeviceIdentityAttendance(input: MatchInput) {
  const externalId = input.externalId.trim();
  if (!externalId) {
    throw new AppError("Device externalId is required.", 400, "INVALID_INPUT");
  }
  if (
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100)
  ) {
    throw new AppError("Confidence must be between 0 and 100.", 400, "INVALID_INPUT");
  }

  const identity = await input.tx.deviceIdentity.findFirst({
    where: { schoolId: input.schoolId, deviceKind: input.kind, externalId },
    select: { studentId: true, staffId: true }
  });
  if (!identity?.studentId && !identity?.staffId) {
    throw new AppError(
      "Device identity is not enrolled for this school.",
      404,
      "DEVICE_IDENTITY_NOT_FOUND"
    );
  }

  if (identity.studentId) {
    const student = await input.tx.student.findFirst({
      where: { id: identity.studentId, schoolId: input.schoolId, status: "active" },
      select: { id: true }
    });
    if (!student) {
      throw new AppError("This device mapping belongs to a student who is no longer active.", 409, "STALE_DEVICE_IDENTITY");
    }
  } else if (identity.staffId) {
    try {
      await requireActiveStaffTarget(input.tx, input.schoolId, identity.staffId);
    } catch {
      throw new AppError("This device mapping belongs to a staff account that is no longer eligible.", 409, "STALE_DEVICE_IDENTITY");
    }
  }

  const target = identity.studentId
    ? { studentId: identity.studentId }
    : { staffId: identity.staffId! };

  const event = await recordAttendance(input.tx, {
    schoolId: input.schoolId,
    target,
    type: input.type,
    method: input.kind,
    confidenceScore: input.confidence,
    deviceId: input.deviceId,
    deviceAuthenticated: true,
    periodId: input.periodId,
    timestamp: input.timestamp
  });

  return { status: "recorded" as const, event };
}

export async function matchFaceDeviceIdentityAttendance(
  tx: Transaction,
  input: Omit<MatchInput, "tx" | "kind">
) {
  return matchDeviceIdentityAttendance({ ...input, tx, kind: "face" });
}

export async function matchFingerprintAttendance(
  tx: Transaction,
  input: Omit<MatchInput, "tx" | "kind">
) {
  return matchDeviceIdentityAttendance({ ...input, tx, kind: "fingerprint" });
}

export async function matchCardAttendance(
  tx: Transaction,
  input: Omit<MatchInput, "tx" | "kind">
) {
  return matchDeviceIdentityAttendance({ ...input, tx, kind: "card" });
}
