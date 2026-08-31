import fs from "node:fs";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(`${root}/${file}`, "utf8");
const write = (file, content) => fs.writeFileSync(`${root}/${file}`, content);

function replaceOnce(file, oldText, newText) {
  const content = read(file);
  const count = content.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one occurrence, found ${count}`);
  write(file, content.replace(oldText, newText));
}

// Apply only the existing-file/schema edits. This script never commits.
execFileSync(process.platform === "win32" ? "python.exe" : "python3", ["scripts/apply-biometric-device-attendance.py"], {
  cwd: root,
  stdio: "inherit"
});

// The device route needs to accept face manual-review results as well as recorded results.
const deviceRoute = "src/app/api/devices/attendance/route.ts";
let route = read(deviceRoute);
route = route.replace(
  'let recorded: { status: "recorded"; event: { id: string } };',
  'let recorded: Awaited<ReturnType<typeof matchFaceAttendance>>;'
);
route = route.replace(
  '      const receipt = await tx.deviceAttendanceReceipt.findFirstOrThrow({',
  '      if (recorded.status !== "recorded") return recorded;\n\n      const receipt = await tx.deviceAttendanceReceipt.findFirstOrThrow({'
);
write(deviceRoute, route);

// Make hardware management reachable from the main School Settings workspace.
const settings = "src/app/school/settings/SchoolSettingsWorkspace.tsx";
if (!read(settings).includes("Attendance devices")) {
  replaceOnce(
    settings,
    '["security","Security & access","Accounts, roles and delegated access"],',
    '["security","Security & access","Accounts, roles and delegated access"],["devices","Attendance devices","Biometric and card terminals"],'
  );
  replaceOnce(
    settings,
    '{section==="automation"&&<Section title="Automation centre"',
    '{section==="devices"&&<Section title="Attendance devices" detail="Register and revoke face, fingerprint and card attendance terminals for this school."><Link href="/school/settings/devices" className="sn-primary-link">Open device management →</Link></Section>}\n       {section==="automation"&&<Section title="Automation centre"'
  );
}

const migrationDir = "prisma/migrations/20260831081000_biometric_devices";
const migrationFile = `${migrationDir}/migration.sql`;
if (!fs.existsSync(`${root}/${migrationFile}`)) {
  // Critical: do NOT create the migration directory until after migrate diff,
  // otherwise Prisma treats the empty directory as a broken migration.
  const shadow = process.env.BIOMETRIC_SHADOW_DATABASE_URL ?? "postgresql://postgres@localhost:5432/postgres";
  const generated = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "prisma", "migrate", "diff",
      "--from-migrations", "./prisma/migrations",
      "--to-schema-datamodel", "./prisma/schema.prisma",
      "--shadow-database-url", shadow,
      "--script"
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );

  fs.mkdirSync(`${root}/${migrationDir}`, { recursive: true });
  const rls = `
ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Device" FORCE ROW LEVEL SECURITY;
CREATE POLICY "Device_tenant_isolation" ON "Device" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceIdentity_tenant_isolation" ON "DeviceIdentity" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
ALTER TABLE "DeviceAttendanceReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceAttendanceReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY "DeviceAttendanceReceipt_tenant_isolation" ON "DeviceAttendanceReceipt" USING ("schoolId" = sukuunova_current_school_id()) WITH CHECK ("schoolId" = sukuunova_current_school_id());
`;
  write(migrationFile, `${generated.trim()}\n${rls}`);
}

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "generate"],
  { cwd: root, stdio: "inherit" }
);
