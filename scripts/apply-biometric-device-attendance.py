from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one occurrence, found {count}: {old[:140]!r}')
    write(path, content.replace(old, new, 1))

def update_model(path, model_name, transform):
    content = read(path)
    pattern = re.compile(rf'(?ms)^model {re.escape(model_name)} \\{{.*?^\\}}')
    match = pattern.search(content)
    if not match:
        raise SystemExit(f'Prisma model not found: {model_name}')
    block = match.group(0)
    new_block = transform(block)
    if new_block == block:
        raise SystemExit(f'No change produced for Prisma model {model_name}')
    write(path, content[:match.start()] + new_block + content[match.end():])

schema = 'prisma/schema.prisma'

def add_school_relations(block):
    anchor = '  houses              House[]\n}'
    replacement = ('  houses              House[]\n'
                   '  devices             Device[]\n'
                   '  deviceIdentities    DeviceIdentity[]\n'
                   '  deviceAttendanceReceipts DeviceAttendanceReceipt[]\n}')
    if anchor not in block:
        raise SystemExit('School relation anchor not found')
    return block.replace(anchor, replacement, 1)


def add_user_relation(block):
    anchor = '  faceReviewsCompleted FaceMatchReview[] @relation("FaceReviewedBy")\n'
    replacement = (anchor +
                   '  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStaff")\n')
    if anchor not in block:
        raise SystemExit('User face relation anchor not found')
    return block.replace(anchor, replacement, 1)


def add_student_relation(block):
    anchor = '  faceMatchReviews FaceMatchReview[]\n'
    replacement = anchor + '  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStudent")\n'
    if anchor not in block:
        raise SystemExit('Student face review relation anchor not found')
    return block.replace(anchor, replacement, 1)


def update_attendance_event(block):
    if '  device           Device?' in block:
        raise SystemExit('AttendanceEvent device relation already present')
    block2, n1 = re.subn(r'  recordedBy\\s+String\\n', '  recordedBy       String?\n', block, count=1)
    if n1 != 1:
        raise SystemExit('AttendanceEvent recordedBy field not found')
    old_rel = '  recorder         User     @relation("AttendanceRecorder", fields: [recordedBy, schoolId], references: [id, schoolId], onDelete: Restrict)'
    new_rel = ('  recorder         User?    @relation("AttendanceRecorder", fields: [recordedBy, schoolId], references: [id, schoolId], onDelete: Restrict)\n'
               '  device           Device?  @relation(fields: [deviceId, schoolId], references: [id, schoolId], onDelete: Restrict)')
    if old_rel not in block2:
        raise SystemExit('AttendanceEvent recorder relation not found')
    return block2.replace(old_rel, new_rel, 1)

update_model(schema, 'School', add_school_relations)
update_model(schema, 'User', add_user_relation)
update_model(schema, 'Student', add_student_relation)
update_model(schema, 'AttendanceEvent', update_attendance_event)

with schema_path := schema:
    content = read(schema_path)
    if '\nmodel Device {' in content or content.rstrip().endswith('model Device {'):
        raise SystemExit('Device models already appear in schema')
    content += '''\n\nmodel Device {
  id              String   @id @default(cuid())
  schoolId        String
  deviceSerial    String
  kind            String
  label           String
  apiKeyHash      String
  status          String   @default("active")
  lastSeenAt      DateTime?
  createdAt       DateTime @default(now())
  school          School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  attendanceEvents AttendanceEvent[]
  identities      DeviceIdentity[]
  attendanceReceipts DeviceAttendanceReceipt[]
  @@unique([id, schoolId])
  @@unique([schoolId, deviceSerial])
  @@index([schoolId])
}

model DeviceIdentity {
  id         String   @id @default(cuid())
  schoolId   String
  deviceKind String
  externalId String
  studentId  String?
  staffId    String?
  createdAt  DateTime @default(now())
  school     School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  student    Student? @relation("DeviceIdentityStudent", fields: [studentId, schoolId], references: [id, schoolId], onDelete: Restrict)
  staff      User?    @relation("DeviceIdentityStaff", fields: [staffId, schoolId], references: [id, schoolId], onDelete: Restrict)
  @@unique([id, schoolId])
  @@unique([schoolId, deviceKind, externalId])
  @@unique([schoolId, deviceKind, studentId])
  @@unique([schoolId, deviceKind, staffId])
  @@index([schoolId])
}

model DeviceAttendanceReceipt {
  id             String   @id @default(cuid())
  schoolId       String
  deviceId       String
  idempotencyKey String
  nonce          String
  capturedAt     DateTime?
  createdAt      DateTime @default(now())
  processedAt    DateTime?
  school         School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  device         Device   @relation(fields: [deviceId, schoolId], references: [id, schoolId], onDelete: Cascade)
  @@unique([id, schoolId])
  @@unique([schoolId, deviceId, idempotencyKey])
  @@unique([schoolId, deviceId, nonce])
  @@index([schoolId])
  @@index([schoolId, deviceId, createdAt])
}
'''
    write(schema_path, content)

# Tenant model allow-list for withTenant/forced tenancy.
replace_once('src/lib/db.ts', '  "ReportCardTemplate"\n]);', '  "ReportCardTemplate",\n  "Device",\n  "DeviceIdentity",\n  "DeviceAttendanceReceipt"\n]);')

# Notification type for real student check-in/check-out alerts.
replace_once('src/lib/message-outbox.ts', '"student_absence"|"staff_late"', '"student_absence"|"student_attendance"|"staff_late"')

# Attendance: server time is authoritative; device-authenticated calls bypass staff permission/assignment checks but remain tenant-scoped.
p = 'src/lib/attendance-service.ts'
content = read(p)
old_sig = '''    schoolId: string; actorId: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face"; confidenceScore?: number; deviceId?: string; timestamp?: Date;\n'''
new_sig = '''    schoolId: string; actorId?: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face" | "fingerprint" | "card"; confidenceScore?: number; deviceId?: string; deviceAuthenticated?: boolean;\n'''
if old_sig not in content:
    raise SystemExit('attendance signature anchor not found')
content = content.replace(old_sig, new_sig, 1)
old_auth = '''  await requirePermission(tx, input.actorId, "attendance:record");\n  if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n  else await authorizeStaffAttendance(tx, input.actorId);\n'''
new_auth = '''  if (input.deviceAuthenticated) {\n    if (!input.deviceId) throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  } else {\n    if (!input.actorId) throw new ForbiddenError("A staff actor is required for attendance.");\n    await requirePermission(tx, input.actorId, "attendance:record");\n    if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n    else await authorizeStaffAttendance(tx, input.actorId);\n  }\n'''
if old_auth not in content:
    raise SystemExit('attendance auth block not found')
content = content.replace(old_auth, new_auth, 1)
content = content.replace('  const timestamp = input.timestamp ?? new Date();', '  const timestamp = new Date();', 1)
content = content.replace('      recordedBy: input.actorId\n', '      recordedBy: input.actorId ?? null\n', 1)
content = content.replace('    schoolId: input.schoolId, actorId: input.actorId, action: "attendance.recorded",', '    schoolId: input.schoolId, actorId: input.actorId ?? ("device:" + input.deviceId), action: "attendance.recorded",', 1)
anchor = '  if (input.target.staffId && isLate) {'
if content.count(anchor) != 1:
    raise SystemExit('student notification insertion anchor not unique')
student_notify = '''  if (input.target.studentId) {\n    const student = await tx.student.findUnique({\n      where: { id: input.target.studentId },\n      select: { name: true }\n    });\n    const guardians = await tx.studentGuardian.findMany({\n      where: { studentId: input.target.studentId, isPrimary: true },\n      include: { guardian: { select: { id: true, phone: true } } }\n    });\n    const attendanceLabel = input.type === "out"\n      ? "checked out"\n      : (isLate ? "checked in late" : "checked in on time");\n    for (const link of guardians) {\n      if (!link.guardian.phone) continue;\n      await enqueueSms(tx, {\n        schoolId: input.schoolId,\n        recipientType: "guardian",\n        recipientId: link.guardian.id,\n        recipientPhone: link.guardian.phone,\n        body: "SukuuNova attendance alert: " + (student?.name ?? "Your child") + " " + attendanceLabel + ".",\n        templateKey: "student_attendance",\n        templateVariables: { "1": student?.name ?? "Student", "2": attendanceLabel }\n      });\n    }\n  }\n\n'''
content = content.replace(anchor, student_notify + anchor, 1)
write(p, content)

# Face matcher: no caller-supplied timestamp, and device-authenticated calls may reach recordAttendance.
p = 'src/lib/face-service.ts'
content = read(p)
old_input = '''    schoolId: string;\n    actorId: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    timestamp?: Date;\n'''
new_input = '''    schoolId: string;\n    actorId?: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    deviceAuthenticated?: boolean;\n'''
if old_input not in content:
    raise SystemExit('face matcher input anchor not found')
content = content.replace(old_input, new_input, 1)
old_permission = '  await requirePermission(tx, input.actorId, "attendance:record");\n  const [settings, match] = await Promise.all(['
new_permission = '''  if (!input.deviceAuthenticated) {\n    if (!input.actorId) throw new AppError("A staff actor is required for face attendance.", 401, "ACTOR_REQUIRED");\n    await requirePermission(tx, input.actorId, "attendance:record");\n  } else if (!input.deviceId) {\n    throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  }\n  const [settings, match] = await Promise.all(['
if old_permission not in content:
    raise SystemExit('face permission anchor not found')
content = content.replace(old_permission, new_permission, 1)
content = content.replace('    method: "face",\n    timestamp: input.timestamp,\n', '    method: "face",\n', 1)
write(p, content)

# Existing staff-session face route no longer accepts caller timestamps.
p = 'src/app/api/phase2/face/route.ts'
content = read(p)
new_content, count = re.subn(r',?timestamp:z\.coerce\.date\(\)\.optional\(\)', '', content, count=1)
if count != 1:
    raise SystemExit('face route timestamp field not found')
write(p, new_content)

# HMAC device auth helper.
write('src/lib/device-auth.ts', '''import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function signDevicePayload(
  apiKeyHash: string,
  timestamp: string,
  nonce: string,
  rawBody: string
): string {
  return createHmac("sha256", apiKeyHash)
    .update(timestamp + "\\n" + nonce + "\\n" + rawBody, "utf8")
    .digest("hex");
}

export function verifyDeviceSignature(input: {
  apiKeyHash: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
  signature: string;
  now?: Date;
  maxSkewMs?: number;
}): void {
  const now = input.now ?? new Date();
  const timestampMs = Number(input.timestamp);
  if (!Number.isInteger(timestampMs)) {
    throw new AppError("Invalid device timestamp.", 401, "INVALID_DEVICE_SIGNATURE");
  }
  const maxSkewMs = input.maxSkewMs ?? 5 * 60 * 1000;
  if (Math.abs(now.getTime() - timestampMs) > maxSkewMs) {
    throw new AppError("Device request timestamp is outside the allowed replay window.", 401, "DEVICE_TIMESTAMP_EXPIRED");
  }
  if (!/^[0-9a-f]{64}$/i.test(input.signature)) {
    throw new AppError("Invalid device signature.", 401, "INVALID_DEVICE_SIGNATURE");
  }
  const expected = Buffer.from(
    signDevicePayload(input.apiKeyHash, input.timestamp, input.nonce, input.rawBody),
    "hex"
  );
  const received = Buffer.from(input.signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new AppError("Invalid device signature.", 401, "INVALID_DEVICE_SIGNATURE");
  }
}
''')

# Generic device identity matching supports fingerprint and card while keeping a dedicated fingerprint entry point.
write('src/lib/device-identity-service.ts', '''import type { Prisma } from "@prisma/client";
import type { Prisma as PrismaNamespace } from "@prisma/client";
import { AppError } from "./errors";
import { recordAttendance } from "./attendance-service";

type Transaction = PrismaNamespace.TransactionClient;

type Input = {
  tx: Transaction;
  schoolId: string;
  deviceId: string;
  kind: "fingerprint" | "card";
  externalId: string;
  confidence?: number;
  type: "in" | "out";
};

export async function matchDeviceIdentityAttendance(input: Input) {
  const externalId = input.externalId.trim();
  if (!externalId) throw new AppError("Device externalId is required.", 400, "INVALID_INPUT");
  if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 100)) {
    throw new AppError("Confidence must be between 0 and 100.", 400, "INVALID_INPUT");
  }

  const identity = await input.tx.deviceIdentity.findFirst({
    where: { deviceKind: input.kind, externalId },
    select: { studentId: true, staffId: true }
  });
  if (!identity?.studentId && !identity?.staffId) {
    throw new AppError("Device identity is not enrolled for this school.", 404, "DEVICE_IDENTITY_NOT_FOUND");
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
    deviceAuthenticated: true
  });
  return { status: "recorded" as const, event };
}

export async function matchFingerprintAttendance(
  tx: Transaction,
  input: Omit<Input, "tx" | "kind"> & { kind?: never }
) {
  return matchDeviceIdentityAttendance({ ...input, tx, kind: "fingerprint" });
}

export async function matchCardAttendance(
  tx: Transaction,
  input: Omit<Input, "tx" | "kind"> & { kind?: never }
) {
  return matchDeviceIdentityAttendance({ ...input, tx, kind: "card" });
}
''')

# Enrollment/identity admin API.
write('src/app/api/school/devices/identities/route.ts', '''import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";

const createSchema = z.object({
  deviceKind: z.enum(["fingerprint", "card"]),
  externalId: z.string().trim().min(1).max(200),
  targetType: z.enum(["student", "staff"]),
  targetId: z.string().min(1)
});
const deleteSchema = z.object({ id: z.string().min(1) });

export async function GET() {
  try {
    const session = await requireSchoolSession();
    const data = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const [identities, students, staff] = await Promise.all([
        tx.deviceIdentity.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, deviceKind: true, externalId: true, studentId: true, staffId: true, createdAt: true }
        }),
        tx.student.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, admissionNo: true } }),
        tx.user.findMany({ where: { status: { in: ["active", "pending"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
      ]);
      return { identities, students, staff };
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
        ? await tx.student.findUnique({ where: { id: input.targetId }, select: { id: true, name: true } })
        : await tx.user.findUnique({ where: { id: input.targetId }, select: { id: true, name: true } });
      if (!person) throw new Error("Target person was not found.");
      const created = await tx.deviceIdentity.create({
        data: {
          schoolId: session.schoolId,
          deviceKind: input.deviceKind,
          externalId: input.externalId,
          studentId: input.targetType === "student" ? input.targetId : undefined,
          staffId: input.targetType === "staff" ? input.targetId : undefined
        },
        select: { id: true, deviceKind: true, externalId: true, studentId: true, staffId: true, createdAt: true }
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
    const input = deleteSchema.parse(await request.json());
    const identity = await withTenant(session.schoolId, async (tx) => {
      await requirePermission(tx, session.userId, "settings:manage_school");
      const existing = await tx.deviceIdentity.findUnique({ where: { id: input.id } });
      if (!existing) throw new Error("Device identity was not found.");
      const deleted = await tx.deviceIdentity.delete({ where: { id: existing.id } });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.identity_removed",
        entityType: "DeviceIdentity",
        entityId: deleted.id,
        before: existing
      });
      return deleted;
    });
    return NextResponse.json({ ok: true, identity });
  } catch (error) {
    return routeError(error);
  }
}
''')

# Device admin API.
write('src/app/api/school/devices/route.ts', '''import { NextResponse } from "next/server";
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
        select: { id: true, deviceSerial: true, kind: true, label: true, status: true, lastSeenAt: true, createdAt: true },
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
        select: { id: true, deviceSerial: true, kind: true, label: true, status: true, createdAt: true }
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.registered",
        entityType: "Device",
        entityId: created.id,
        after: { deviceSerial: created.deviceSerial, kind: created.kind, label: created.label }
      });
      return created;
    });
    return NextResponse.json({
      ok: true,
      device,
      deviceSecret,
      warning: "Copy this device secret now. It is never stored or shown again."
    }, { status: 201 });
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
      const existing = await tx.device.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
      });
      if (!existing) throw new Error("Device not found.");
      const updated = await tx.device.update({
        where: { id: existing.id },
        data: { status: "revoked" },
        select: { id: true, status: true, deviceSerial: true, kind: true, label: true }
      });
      await appendSchoolAudit(tx, {
        schoolId: session.schoolId,
        actorId: session.userId,
        action: "device.revoked",
        entityType: "Device",
        entityId: updated.id,
        before: existing,
        after: updated
      });
      return updated;
    });
    return NextResponse.json({ ok: true, device });
  } catch (error) {
    return routeError(error);
  }
}
''')

# Device attendance ingestion.
write('src/app/api/devices/attendance/route.ts', '''import { NextResponse } from "next/server";
import { z } from "zod";
import { db, withTenant } from "@/lib/db";
import { routeError } from "@/lib/errors";
import { UnauthorizedError } from "@/lib/errors";
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
      throw new UnauthorizedError("Invalid device request payload.");
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
        where: { schoolId_deviceSerial: { schoolId: directory.schoolId, deviceSerial: input.deviceSerial } },
        select: { id: true, apiKeyHash: true, kind: true, status: true }
      });
      if (!device || device.status !== "active" || device.kind !== input.kind) {
        throw new UnauthorizedError("Device authentication failed.");
      }

      verifyDeviceSignature({
        apiKeyHash: device.apiKeyHash,
        timestamp,
        nonce,
        rawBody
        ,signature
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
          const existing = await tx.deviceAttendanceReceipt.findFirst({
            where: { deviceId: device.id, OR: [{ idempotencyKey: input.idempotencyKey }, { nonce }] },
            select: { id: true, processedAt: true }
          });
          if (existing) return { status: "duplicate" as const };
        }
        throw error;
      }

      const serverReceivedAt = new Date();
      await tx.device.update({ where: { id: device.id }, data: { lastSeenAt: serverReceivedAt } });

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

      let recorded;
      if (input.kind === "face") {
        if (!input.image) throw new Error("Face device events require image data.");
        recorded = await matchFaceAttendance(tx, {
          schoolId: directory.schoolId,
          image: input.image,
          deviceId: device.id,
          type: input.type,
          deviceAuthenticated: true
        });
      } else if (input.kind === "fingerprint") {
        if (!input.externalId) throw new Error("Fingerprint device events require externalId.");
        recorded = await matchFingerprintAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type
        });
      } else {
        if (!input.externalId) throw new Error("Card device events require externalId.");
        recorded = await matchCardAttendance(tx, {
          schoolId: directory.schoolId,
          deviceId: device.id,
          externalId: input.externalId,
          confidence: input.confidence,
          type: input.type
        });
      }

      const receipt = await tx.deviceAttendanceReceipt.findFirstOrThrow({
        where: { deviceId: device.id, idempotencyKey: input.idempotencyKey }
      });
      await tx.deviceAttendanceReceipt.update({
        where: { id: receipt.id },
        data: { processedAt: new Date() }
      });

      return { status: "recorded" as const, eventId: recorded.event.id };
    });

    return NextResponse.json({ ok: true, result }, { status: result.status === "duplicate" ? 200 : 201 });
  } catch (error) {
    return routeError(error);
  }
}
''')

# Device settings page with registration, revocation and fingerprint/card external-ID enrollment.
write('src/app/school/settings/devices/page.tsx', '''"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Device = { id: string; deviceSerial: string; kind: string; label: string; status: string; lastSeenAt: string | null; createdAt: string };
type Identity = { id: string; deviceKind: string; externalId: string; studentId: string | null; staffId: string | null; createdAt: string };
type Person = { id: string; name: string; admissionNo?: string; email?: string | null };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [students, setStudents] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [serial, setSerial] = useState("");
  const [label, setLabel] = useState("Main Gate");
  const [kind, setKind] = useState("fingerprint");
  const [secret, setSecret] = useState("");
  const [externalId, setExternalId] = useState("");
  const [identityKind, setIdentityKind] = useState("fingerprint");
  const [targetType, setTargetType] = useState("student");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  async function loadDevices() {
    const response = await fetch("/api/school/devices");
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Could not load devices.");
    setDevices(data.devices ?? []);
  }
  async function loadIdentities() {
    const response = await fetch("/api/school/devices/identities");
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Could not load device identities.");
    setIdentities(data.identities ?? []); setStudents(data.students ?? []); setStaff(data.staff ?? []);
    if (!targetId && (data.students?.[0]?.id || data.staff?.[0]?.id)) setTargetId(targetType === "student" ? data.students?.[0]?.id : data.staff?.[0]?.id);
  }
  useEffect(() => { void loadDevices(); void loadIdentities(); }, []);

  async function registerDevice() {
    setMessage(""); setSecret("");
    const response = await fetch("/api/school/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceSerial: serial, kind, label }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.message ?? data.error ?? "Could not register device.");
    setSecret(data.deviceSecret); setMessage("Device registered. Copy the secret now; it will never be shown again."); setSerial(""); await loadDevices();
  }
  async function revokeDevice(id: string) {
    if (!window.confirm("Revoke this device? It will stop accepting attendance immediately.")) return;
    const response = await fetch("/api/school/devices", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "revoke" }) });
    const data = await response.json(); setMessage(response.ok ? "Device revoked." : data.message ?? data.error ?? "Could not revoke device."); if (response.ok) await loadDevices();
  }
  async function enrollIdentity() {
    const response = await fetch("/api/school/devices/identities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceKind: identityKind, externalId, targetType, targetId }) });
    const data = await response.json(); setMessage(response.ok ? "Hardware identity mapping saved." : data.message ?? data.error ?? "Could not save mapping."); if (response.ok) { setExternalId(""); await loadIdentities(); }
  }
  async function removeIdentity(id: string) {
    const response = await fetch("/api/school/devices/identities", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json(); setMessage(response.ok ? "Mapping removed." : data.message ?? data.error ?? "Could not remove mapping."); if (response.ok) await loadIdentities();
  }
  const people = targetType === "student" ? students : staff;

  return <AppShell universe="school" title="Biometric Attendance Devices" subtitle="Register attendance terminals, provision one-time secrets, map hardware identities, and revoke lost devices." active="Security & Access">
    <main style={{ display: "grid", gap: 18 }}>
      <section className="app-card app-panel">
        <p className="app-kpi-label">DEVICE REGISTRATION</p>
        <h2>Connect an attendance terminal</h2>
        <div style={{ display: "grid", gap: 12, maxWidth: 820, gridTemplateColumns: "1fr 1fr" }}>
          <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="Device serial" />
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label, e.g. Main Gate" />
          <select value={kind} onChange={e => setKind(e.target.value)}><option value="fingerprint">Fingerprint</option><option value="face">Face</option><option value="card">Card</option></select>
          <button className="app-action" onClick={() => void registerDevice()} disabled={!serial.trim() || !label.trim()}><strong>Register device</strong></button>
        </div>
        {secret ? <div className="app-banner" style={{ marginTop: 14 }}><strong>Copy this device secret now</strong><p style={{ wordBreak: "break-all" }}>{secret}</p></div> : null}
      </section>

      <section className="app-card app-panel">
        <p className="app-kpi-label">DEVICE IDENTITY MAPPING</p>
        <h2>Map terminal identities to people</h2>
        <p>Fingerprint/card terminals report their own external identity. Map it once; no raw fingerprint or card data is stored by SukuuNova.</p>
        <div style={{ display: "grid", gap: 12, maxWidth: 900, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <select value={identityKind} onChange={e => setIdentityKind(e.target.value)}><option value="fingerprint">Fingerprint</option><option value="card">Card</option></select>
          <input value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="Vendor external ID" />
          <select value={targetType} onChange={e => { const next = e.target.value; setTargetType(next); const first = next === "student" ? students[0]?.id : staff[0]?.id; setTargetId(first ?? ""); }}><option value="student">Student</option><option value="staff">Staff</option></select>
          <select value={targetId} onChange={e => setTargetId(e.target.value)}>{people.map(person => <option key={person.id} value={person.id}>{person.name}{person.admissionNo ? ` · ${person.admissionNo}` : ""}</option>)}</select>
          <button className="app-action" onClick={() => void enrollIdentity()} disabled={!externalId.trim() || !targetId}><strong>Save mapping</strong></button>
        </div>
        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>{identities.map(identity => { const person = identity.studentId ? students.find(p => p.id === identity.studentId) : staff.find(p => p.id === identity.staffId); return <div key={identity.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "center", border: "1px solid var(--app-line,#d7e0e0)", padding: 10, borderRadius: 10 }}><span>{identity.deviceKind}</span><strong>{identity.externalId}</strong><span>{person?.name ?? "Unknown person"}</span><button className="app-pill" onClick={() => void removeIdentity(identity.id)}>Remove</button></div>; })}</div>
      </section>

      <section className="app-card app-panel">
        <p className="app-kpi-label">REGISTERED DEVICES</p>
        {devices.length === 0 ? <p>No attendance devices registered yet.</p> : <div style={{ display: "grid", gap: 10 }}>{devices.map(device => <div key={device.id} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr auto", gap: 12, alignItems: "center", border: "1px solid var(--app-line,#d7e0e0)", padding: 12, borderRadius: 12 }}><div><strong>{device.label}</strong><div>{device.deviceSerial}</div></div><span>{device.kind}</span><span>{device.status}{device.lastSeenAt ? ` · ${new Date(device.lastSeenAt).toLocaleString()}` : " · never seen"}</span>{device.status === "active" ? <button className="app-pill" onClick={() => void revokeDevice(device.id)}>Revoke</button> : <span className="app-pill">Revoked</span>}</div>)}</div>}
      </section>
      {message ? <div className="app-banner"><p>{message}</p></div> : null}
    </main>
  </AppShell>;
}
''')

# Security settings link.
replace_once('src/app/school/settings/SchoolSettingsWorkspace.tsx',
             '<Integration title="Account security" state="Open" detail="Password, MFA and account-protection controls." href="/account/security"/>',
             '<Integration title="Account security" state="Open" detail="Password, MFA and account-protection controls." href="/account/security"/><Integration title="Biometric attendance devices" state="Open" detail="Register, map and revoke hardware attendance terminals." href="/school/settings/devices"/>')

# Migration.
write('prisma/migrations/20260831081000_biometric_devices/migration.sql', '''CREATE TABLE "Device" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceSerial" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "apiKeyHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Device_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "DeviceIdentity" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceKind" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "studentId" TEXT,
  "staffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceIdentity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeviceIdentity_studentId_schoolId_fkey" FOREIGN KEY ("studentId","schoolId") REFERENCES "Student"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeviceIdentity_staffId_schoolId_fkey" FOREIGN KEY ("staffId","schoolId") REFERENCES "User"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "DeviceAttendanceReceipt" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "DeviceAttendanceReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceAttendanceReceipt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DeviceAttendanceReceipt_deviceId_schoolId_fkey" FOREIGN KEY ("deviceId","schoolId") REFERENCES "Device"("id","schoolId") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "AttendanceEvent" ALTER COLUMN "recordedBy" DROP NOT NULL;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_deviceId_schoolId_fkey" FOREIGN KEY ("deviceId","schoolId") REFERENCES "Device"("id","schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Device_tenant_isolation" ON "Device" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceIdentity_tenant_isolation" ON "DeviceIdentity" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceAttendanceReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceAttendanceReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceAttendanceReceipt_tenant_isolation" ON "DeviceAttendanceReceipt" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
CREATE UNIQUE INDEX "Device_id_schoolId_key" ON "Device"("id","schoolId");
CREATE UNIQUE INDEX "Device_schoolId_deviceSerial_key" ON "Device"("schoolId","deviceSerial");
CREATE INDEX "Device_schoolId_idx" ON "Device"("schoolId");
CREATE UNIQUE INDEX "DeviceIdentity_id_schoolId_key" ON "DeviceIdentity"("id","schoolId");
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_externalId_key" ON "DeviceIdentity"("schoolId","deviceKind","externalId");
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_studentId_key" ON "DeviceIdentity"("schoolId","deviceKind","studentId");
CREATE UNIQUE INDEX "DeviceIdentity_schoolId_deviceKind_staffId_key" ON "DeviceIdentity"("schoolId","deviceKind","staffId");
CREATE INDEX "DeviceIdentity_schoolId_idx" ON "DeviceIdentity"("schoolId");
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_id_schoolId_key" ON "DeviceAttendanceReceipt"("id","schoolId");
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_idempotencyKey_key" ON "DeviceAttendanceReceipt"("schoolId","deviceId","idempotencyKey");
CREATE UNIQUE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_nonce_key" ON "DeviceAttendanceReceipt"("schoolId","deviceId","nonce");
CREATE INDEX "DeviceAttendanceReceipt_schoolId_idx" ON "DeviceAttendanceReceipt"("schoolId");
CREATE INDEX "DeviceAttendanceReceipt_schoolId_deviceId_createdAt_idx" ON "DeviceAttendanceReceipt"("schoolId","deviceId","createdAt");
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_target_check" CHECK (((CASE WHEN "studentId" IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN "staffId" IS NOT NULL THEN 1 ELSE 0 END)) = 1);
ALTER TABLE "Device" ADD CONSTRAINT "Device_kind_check" CHECK ("kind" IN ('face','fingerprint','card'));
ALTER TABLE "Device" ADD CONSTRAINT "Device_status_check" CHECK ("status" IN ('active','revoked'));
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_kind_check" CHECK ("deviceKind" IN ('fingerprint','card'));
''')

write('docs/biometric-devices.md', '''# SukuuNova hardware attendance devices

## Authentication

Each device receives one random secret at registration. SukuuNova stores only `SHA-256(secret)` as `Device.apiKeyHash`. Devices derive the same value locally and use it as the HMAC-SHA256 key.

Requests sign the exact raw JSON body with:

`timestamp + "\\n" + nonce + "\\n" + rawBody`

using headers `X-Device-Timestamp`, `X-Device-Nonce`, and `X-Device-Signature`.

The server uses `schoolCode` in the signed body to select the school tenant, then performs all device reads/writes inside `withTenant(schoolId)`, so PostgreSQL FORCE RLS remains authoritative.

## Offline retries

Every event has an idempotency key and signed nonce. `DeviceAttendanceReceipt` enforces uniqueness per device. The receipt is created in the same transaction as the attendance write, so a failed attendance transaction does not consume the key; a successful retry cannot create a second attendance event.

## Timestamps

The device's `capturedAt` field is diagnostic only. Attendance lateness and event timestamps always use server-received time. Large client/server time deviations are logged server-side but never trusted for attendance calculations.

## Fingerprint/card mapping

Fingerprint and card terminals report a vendor external ID. The school administrator maps that external ID to a Student or Staff identity in Settings → Security & Access → Biometric attendance devices. Raw fingerprint templates/images are not stored by SukuuNova.
''')
PYTHON_PLACEHOLDER

print('Biometric device source patch prepared.')
