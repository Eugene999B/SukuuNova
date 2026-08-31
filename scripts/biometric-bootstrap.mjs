import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(`${root}/${file}`, "utf8");
const write = (file, content) => fs.writeFileSync(`${root}/${file}`, content);
const replaceOnce = (file, oldText, newText) => {
  const content = read(file);
  const count = content.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`${file}: expected exactly one occurrence, found ${count}`);
  }
  write(file, content.replace(oldText, newText));
};

const schemaFile = "prisma/schema.prisma";
let schema = read(schemaFile);

if (!schema.includes("model Device {")) {
  schema = schema.replace(
    "  houses              House[]\n}",
    "  houses              House[]\n  devices             Device[]\n  deviceIdentities    DeviceIdentity[]\n  deviceAttendanceReceipts DeviceAttendanceReceipt[]\n}"
  );
  schema = schema.replace(
    '  faceReviewsCompleted FaceMatchReview[] @relation("FaceReviewedBy")\n',
    '  faceReviewsCompleted FaceMatchReview[] @relation("FaceReviewedBy")\n  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStaff")\n'
  );
  schema = schema.replace(
    "  faceMatchReviews FaceMatchReview[]\n",
    '  faceMatchReviews FaceMatchReview[]\n  deviceIdentities DeviceIdentity[] @relation("DeviceIdentityStudent")\n'
  );
  schema = schema.replace(
    "  recordedBy       String\n",
    "  recordedBy       String?\n"
  );
  schema = schema.replace(
    '  recorder         User     @relation("AttendanceRecorder", fields: [recordedBy, schoolId], references: [id, schoolId], onDelete: Restrict)\n',
    '  recorder         User?    @relation("AttendanceRecorder", fields: [recordedBy, schoolId], references: [id, schoolId], onDelete: Restrict)\n  device           Device?  @relation(fields: [deviceId, schoolId], references: [id, schoolId], onDelete: Restrict)\n'
  );
  schema += `

model Device {
  id                 String   @id @default(cuid())
  schoolId           String
  deviceSerial       String
  kind               String
  label              String
  apiKeyHash         String
  status              String   @default("active")
  lastSeenAt         DateTime?
  createdAt          DateTime @default(now())
  school             School   @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  attendanceEvents   AttendanceEvent[]
  identities         DeviceIdentity[]
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
`;
  write(schemaFile, schema);
}

if (!read("src/lib/db.ts").includes('"Device"')) {
  replaceOnce(
    "src/lib/db.ts",
    '  "ReportCardTemplate"\n]);',
    '  "ReportCardTemplate",\n  "Device",\n  "DeviceIdentity",\n  "DeviceAttendanceReceipt"\n]);'
  );
}

if (!read("src/lib/message-outbox.ts").includes("student_attendance")) {
  replaceOnce(
    "src/lib/message-outbox.ts",
    'export type NotificationTemplateKey="student_absence"|"staff_late"',
    'export type NotificationTemplateKey="student_absence"|"student_attendance"|"staff_late"'
  );
}

const attendance = "src/lib/attendance-service.ts";
if (!read(attendance).includes("deviceAuthenticated?: boolean")) {
  replaceOnce(
    attendance,
    '    schoolId: string; actorId: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face"; confidenceScore?: number; deviceId?: string; timestamp?: Date;\n',
    '    schoolId: string; actorId?: string; target: AttendanceTarget; type: "in" | "out";\n    method: "manual" | "qr" | "face" | "fingerprint" | "card"; confidenceScore?: number; deviceId?: string; deviceAuthenticated?: boolean;\n'
  );
  replaceOnce(
    attendance,
    '  await requirePermission(tx, input.actorId, "attendance:record");\n  if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n  else await authorizeStaffAttendance(tx, input.actorId);\n',
    '  if (input.deviceAuthenticated) {\n    if (!input.deviceId) throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  } else {\n    if (!input.actorId) throw new ForbiddenError("A staff actor is required for attendance.");\n    await requirePermission(tx, input.actorId, "attendance:record");\n    if (input.target.studentId) await authorizeStudentAttendance(tx, input.actorId, input.target.studentId);\n    else await authorizeStaffAttendance(tx, input.actorId);\n  }\n'
  );
  replaceOnce(attendance, "  const timestamp = input.timestamp ?? new Date();", "  const timestamp = new Date();");
  replaceOnce(attendance, "      recordedBy: input.actorId\n", "      recordedBy: input.actorId ?? null\n");
  replaceOnce(
    attendance,
    '    schoolId: input.schoolId, actorId: input.actorId, action: "attendance.recorded",',
    '    schoolId: input.schoolId, actorId: input.actorId ?? ("device:" + input.deviceId), action: "attendance.recorded",'
  );
  let updated = read(attendance);
  if (!updated.includes('templateKey: "student_attendance"')) {
    const guardianBlock = `  if (input.target.studentId) {
    const student = await tx.student.findUnique({ where: { id: input.target.studentId }, select: { name: true } });
    const guardians = await tx.studentGuardian.findMany({ where: { studentId: input.target.studentId, isPrimary: true }, include: { guardian: { select: { id: true, phone: true } } } });
    const attendanceLabel = input.type === "out" ? "checked out" : (isLate ? "checked in late" : "checked in on time");
    for (const link of guardians) {
      if (!link.guardian.phone) continue;
      await enqueueSms(tx, { schoolId: input.schoolId, recipientType: "guardian", recipientId: link.guardian.id, recipientPhone: link.guardian.phone, body: "SukuuNova attendance alert: " + (student?.name ?? "Your child") + " " + attendanceLabel + ".", templateKey: "student_attendance", templateVariables: { "1": student?.name ?? "Student", "2": attendanceLabel } });
    }
  }

`;
    const anchor = "  if (input.target.staffId && isLate) {";
    if (!updated.includes(anchor)) throw new Error("attendance student-notification anchor not found");
    updated = updated.replace(anchor, guardianBlock + anchor);
    write(attendance, updated);
  }
}

const face = "src/lib/face-service.ts";
if (!read(face).includes("deviceAuthenticated?: boolean")) {
  replaceOnce(
    face,
    '    actorId: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    timestamp?: Date;\n',
    '    actorId?: string;\n    image: string;\n    deviceId?: string;\n    type: "in" | "out";\n    deviceAuthenticated?: boolean;\n'
  );
  replaceOnce(
    face,
    '  await requirePermission(tx, input.actorId, "attendance:record");\n  const [settings, match] = await Promise.all([',
    '  if (!input.deviceAuthenticated) {\n    if (!input.actorId) throw new AppError("A staff actor is required for face attendance.", 401, "ACTOR_REQUIRED");\n    await requirePermission(tx, input.actorId, "attendance:record");\n  } else if (!input.deviceId) {\n    throw new AppError("Authenticated device id is required.", 401, "DEVICE_CONTEXT_REQUIRED");\n  }\n  const [settings, match] = await Promise.all(['
  );
  const current = read(face);
  write(face, current.replace('    timestamp: input.timestamp,\n', ''));
}

const phase2 = "src/app/api/phase2/face/route.ts";
const phase2Text = read(phase2);
if (phase2Text.includes('timestamp:z.coerce.date().optional()')) {
  write(phase2, phase2Text.replace('timestamp:z.coerce.date().optional(),', ''));
}

const deviceRoute = "src/app/api/devices/attendance/route.ts";
let route = read(deviceRoute);
route = route.replace(
  '      let recorded: { status: "recorded"; event: { id: string } };',
  '      let recorded: Awaited<ReturnType<typeof matchFaceAttendance>>;'
);
route = route.replace(
  '      return { status: "recorded" as const, eventId: recorded.event.id };',
  '      if (recorded.status !== "recorded") {\n        return recorded;\n      }\n\n      return { status: "recorded" as const, eventId: recorded.event.id };'
);
if (route !== read(deviceRoute)) write(deviceRoute, route);

const migrationDir = "prisma/migrations/20260831081000_biometric_devices";
const migrationFile = `${migrationDir}/migration.sql`;
if (!fs.existsSync(`${root}/${migrationFile}`)) {
  fs.mkdirSync(`${root}/${migrationDir}`, { recursive: true });
  const generated = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "diff", "--from-migrations", "./prisma/migrations", "--to-schema-datamodel", "./prisma/schema.prisma", "--script"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );
  const rls = `\nALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "Device" FORCE ROW LEVEL SECURITY;\nCREATE POLICY "Device_tenant_isolation" ON "Device" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());\nALTER TABLE "DeviceIdentity" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "DeviceIdentity" FORCE ROW LEVEL SECURITY;\nCREATE POLICY "DeviceIdentity_tenant_isolation" ON "DeviceIdentity" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());\nALTER TABLE "DeviceAttendanceReceipt" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "DeviceAttendanceReceipt" FORCE ROW LEVEL SECURITY;\nCREATE POLICY "DeviceAttendanceReceipt_tenant_isolation" ON "DeviceAttendanceReceipt" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());\n`;
  write(migrationFile, `${generated.trim()}\n${rls}`);
}

if (process.env.GITHUB_ACTIONS === "true") {
  execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["add", schemaFile, migrationFile, "src/lib/db.ts", "src/lib/message-outbox.ts", attendance, face, phase2, deviceRoute, "scripts/biometric-bootstrap.mjs", "package.json"], { cwd: root, stdio: "inherit" });
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.trim()) {
    execFileSync("git", ["commit", "-m", "feat: integrate hardware biometric attendance"], { cwd: root, stdio: "inherit" });
    execFileSync("git", ["push", "origin", "main"], { cwd: root, stdio: "inherit" });
  }
}

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "generate"],
  { cwd: root, stdio: "inherit" }
);
