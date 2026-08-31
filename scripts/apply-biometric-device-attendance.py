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
        raise SystemExit(f"{path}: expected exactly one occurrence, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))

def update_model(path, model_name, transform):
    content = read(path)
    pattern = re.compile(rf"(?ms)^model {re.escape(model_name)} \{{.*?^\}}")
    match = pattern.search(content)
    if not match:
        raise SystemExit(f"Prisma model not found: {model_name}")
    block = match.group(0)
    new_block = transform(block)
    if new_block == block:
        raise SystemExit(f"No change produced for Prisma model {model_name}")
    write(path, content[:match.start()] + new_block + content[match.end():])

schema = 'prisma/schema.prisma'

def add_or_keep(block, marker, insertion):
    if insertion.strip() in block:
        return block
    if marker not in block:
        raise SystemExit(f"Schema marker not found: {marker[:100]!r}")
    return block.replace(marker, insertion, 1)

update_model(schema, 'School', lambda b: add_or_keep(b, '  houses              House[]\n}', '  houses              House[]\n  devices             Device[]\n  deviceIdentities    DeviceIdentity[]\n  deviceAttendanceReceipts DeviceAttendanceReceipt[]\n}'))
update_model(schema, 'User', lambda b: add_or_keep(b, '  faceReviewsCompleted FaceMatchReview[] @relation("FaceReviewedBy")\n', '  faceReviewsCompleted FaceMatchReview[] @relation("FaceReviewedBy")\n  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStaff")\n'))
update_model(schema, 'Student', lambda b: add_or_keep(b, '  faceEnrollments  FaceEnrollment[]\n', '  faceEnrollments  FaceEnrollment[]\n  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStudent")\n'))

def update_attendance(block):
    if '  device           Device?' in block:
        return block
    if '  recordedBy       String\n' not in block:
        raise SystemExit('AttendanceEvent recordedBy field not found')
    block = block.replace('  recordedBy       String\n', '  recordedBy       String?\n', 1)
    old_rel = '  recorder         User     @relation("AttendanceRecorder", fields: [recordedBy, schoolId], references: [id, schoolId], onDelete: Restrict)'
    new_rel = old_rel.replace('User     ', 'User?    ') + '\n  device           Device?  @relation(fields: [deviceId, schoolId], references: [id, schoolId], onDelete: Restrict)'
    if old_rel not in block:
        raise SystemExit('AttendanceEvent recorder relation not found')
    return block.replace(old_rel, new_rel, 1)
update_model(schema, 'AttendanceEvent', update_attendance)

content = read(schema)
if 'model Device {' not in content:
    content += r'''

model Device {
  id                  String   @id @default(cuid())
  schoolId            String
  deviceSerial        String
  kind                String
  label               String
  apiKeyHash          String
  status              String   @default("active")
  lastSeenAt          DateTime?
  createdAt           DateTime @default(now())
  school              School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  attendanceEvents    AttendanceEvent[]
  identities          DeviceIdentity[]
  attendanceReceipts  DeviceAttendanceReceipt[]
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
write(schema, content)

if '"Device"' not in read('src/lib/db.ts'):
    replace_once('src/lib/db.ts', '  "ReportCardTemplate"\n]);', '  "ReportCardTemplate",\n  "Device",\n  "DeviceIdentity",\n  "DeviceAttendanceReceipt"\n]);')
if 'student_attendance' not in read('src/lib/message-outbox.ts'):
    replace_once('src/lib/message-outbox.ts', '"student_absence"|"staff_late"', '"student_absence"|"student_attendance"|"staff_late"')

# Attendance service changes.
p='src/lib/attendance-service.ts'; s=read(p)
if 'deviceAuthenticated?: boolean' not in s:
    replace_once(p, '    schoolId: string; actorId: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face"; confidenceScore?: number; deviceId?: string; timestamp?: Date;\n', '    schoolId: string; actorId?: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face" | "fingerprint" | "card"; confidenceScore?: number; deviceId?: string; deviceAuthenticated?: boolean;\n')
    replace_once(p, '  await requirePermission(tx, input.actorId, "attendance:record");\n  if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n  else await authorizeStaffAttendance(tx, input.actorId);\n', '  if (input.deviceAuthenticated) {\n    if (!input.deviceId) throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  } else {\n    if (!input.actorId) throw new ForbiddenError("A staff actor is required for attendance.");\n    await requirePermission(tx, input.actorId, "attendance:record");\n    if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n    else await authorizeStaffAttendance(tx, input.actorId);\n  }\n')
    replace_once(p, '  const timestamp = input.timestamp ?? new Date();', '  const timestamp = new Date();')
    replace_once(p, '      recordedBy: input.actorId\n', '      recordedBy: input.actorId ?? null\n')
    replace_once(p, '    schoolId: input.schoolId, actorId: input.actorId, action: "attendance.recorded",', '    schoolId: input.schoolId, actorId: input.actorId ?? ("device:" + input.deviceId), action: "attendance.recorded",')
    s=read(p)
    marker='  if (input.target.staffId && isLate) {'
    notify='''  if (input.target.studentId) {\n    const student = await tx.student.findUnique({ where: { id: input.target.studentId }, select: { name: true } });\n    const guardians = await tx.studentGuardian.findMany({ where: { studentId: input.target.studentId, isPrimary: true }, include: { guardian: { select: { id: true, phone: true } } } });\n    const attendanceLabel = input.type === "out" ? "checked out" : (isLate ? "checked in late" : "checked in on time");\n    for (const link of guardians) {\n      if (!link.guardian.phone) continue;\n      await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardian.id, recipientPhone: link.guardian.phone, body: "SukuuNova attendance alert: " + (student?.name ?? "Your child") + " " + attendanceLabel + ".", templateKey: "student_attendance", templateVariables: { "1": student?.name ?? "Student", "2": attendanceLabel } });\n    }\n  }\n\n'''
    if s.count(marker)!=1: raise SystemExit('student notification anchor not found')
    write(p, s.replace(marker, notify+marker, 1))

# Face service.
p='src/lib/face-service.ts'; s=read(p)
if 'deviceAuthenticated?: boolean' not in s:
    replace_once(p, '    schoolId: string;\n    actorId: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    timestamp?: Date;\n', '    schoolId: string;\n    actorId?: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    deviceAuthenticated?: boolean;\n')
    replace_once(p, '  await requirePermission(tx, input.actorId, "attendance:record");\n  const [settings, match] = await Promise.all([', '  if (!input.deviceAuthenticated) {\n    if (!input.actorId) throw new AppError("A staff actor is required for face attendance.", 401, "ACTOR_REQUIRED");\n    await requirePermission(tx, input.actorId, "attendance:record");\n  } else if (!input.deviceId) {\n    throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  }\n  const [settings, match] = await Promise.all([')
    replace_once(p, '    timestamp: input.timestamp,\n', '')

# Staff-session face endpoint.
p='src/app/api/phase2/face/route.ts'; s=read(p)
new_s, n = re.subn(r',?timestamp:z\.coerce\.date\(\)\.optional\(\)', '', s, count=1)
if n != 1: raise SystemExit('face route timestamp field not found')
write(p, new_s)
PYTHON_DONE
