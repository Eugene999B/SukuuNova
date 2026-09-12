import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../src/lib/default-rbac";

const root = path.resolve(process.cwd());
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("workspace and account boundary contracts", () => {
  it("keeps the canonical Principal baseline aligned with leadership expectations", () => {
    const expected = DEFAULT_PERMISSIONS.filter((key) => key !== "students:delete");
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.Principal)).toEqual(new Set(expected));
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain("settings:manage_roles");
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain("attendance:display");
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain("attendance:pickup_approve");
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain("visitors:log");
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).toContain("transport:manage");
    expect(DEFAULT_ROLE_PERMISSIONS.Principal).not.toContain("students:delete");
  });

  it("refreshes Eugene Academy access in both trial and production showcase pipelines", () => {
    const trial = source("scripts/run-eugene-academy-showcase.cjs");
    const production = source("scripts/seed-eugene-academy-production-showcase.cjs");
    const refresh = source("scripts/refresh-eugene-academy-access.cjs");
    expect(trial).toContain("refresh-eugene-academy-access.cjs");
    expect(trial).toContain('EUGENE_ACADEMY_ACCESS_TARGET: "trial"');
    expect(production).toContain("refresh-eugene-academy-access.cjs");
    expect(production).toContain('EUGENE_ACADEMY_ACCESS_TARGET: "production"');
    for (const permission of ["settings:manage_roles", "users:write", "visitors:log", "attendance:display", "attendance:pickup_approve", "transport:manage", "identity_cards:manage", "exports:finance"]) {
      expect(refresh).toContain(permission);
    }
    expect(refresh).toContain('if (principalSet.has("students:delete"))');
    expect(refresh).toContain("granted: false");
    expect(refresh).toContain("effectiveDelete");
    expect(refresh).toContain("effectively has students:delete");
  });

  it("keeps identity-card access available to canonical system roles without crashing the workspace", () => {
    const migration = source("prisma/migrations/20260911153000_identity_card_permission_backfill/migration.sql");
    const page = source("src/app/school/id-cards/page.tsx");
    const staff = source("src/app/school/staff/page.tsx");
    expect(migration).toContain("identity_cards:manage");
    expect(migration).toContain('r."isSystem" = TRUE');
    for (const roleKey of ["owner", "administrator", "principal", "hr_officer", "admissions_officer", "front_desk_security"]) {
      expect(migration).toContain(`'${roleKey}'`);
    }
    expect(page).toContain('hasPermission(tx, session.userId, "identity_cards:manage")');
    expect(page).toContain("ID card access needs permission");
    expect(page).not.toContain('requirePermission(tx, session.userId, "identity_cards:manage")');
    expect(staff).toContain('href="/school/id-cards" className="button secondary">ID cards</Link>');
  });

  it("clears incompatible cookies whenever a user changes login universe", () => {
    const school = source("src/app/api/auth/school/login/route.ts");
    const guardian = source("src/app/api/auth/guardian/login/route.ts");
    const platform = source("src/app/api/auth/platform/login/route.ts");
    expect(school).toContain("response.cookies.delete(PLATFORM_COOKIE)");
    expect(school).toContain("response.cookies.delete(GUARDIAN_COOKIE)");
    expect(guardian).toContain("response.cookies.delete(SCHOOL_COOKIE)");
    expect(guardian).toContain("response.cookies.delete(PLATFORM_COOKIE)");
    expect(platform).toContain("response.cookies.delete(SCHOOL_COOKIE)");
    expect(platform).toContain("response.cookies.delete(GUARDIAN_COOKIE)");
  });

  it("routes account settings according to the active school, guardian or platform universe", () => {
    const settings = source("src/app/account/settings/page.tsx");
    expect(settings.indexOf("getSchoolSession()")).toBeLessThan(settings.indexOf("getGuardianSession()"));
    expect(settings).toContain('redirect(workspace === "teacher" ? "/teacher/settings" : "/school/settings")');
    expect(settings).toContain('redirect("/guardian/settings")');
    expect(settings).toContain("<PlatformAccountSettingsClient />");
    expect(settings).not.toContain('universe="platform"');
  });

  it("binds password changes and required-state to the active Account Security universe", () => {
    const security = source("src/app/account/security/page.tsx");
    expect(security).toContain('name="universe" value={universe}');
    expect(security).toContain('if (universe === "school" || universe === "teacher")');
    expect(security).toContain('if (universe === "guardian")');
    expect(security).toContain('if (universe === "platform")');
    expect(security).toContain("const requiredByRoute");
    expect(security).toContain("const guardianRequired = requiredByRoute || Boolean(currentGuardian.needsPasswordChange)");
    expect(security).toContain("required={requiredByRoute}");
  });

  it("does not expose writable platform preference defaults before the saved state loads", () => {
    const settings = source("src/app/account/settings/PlatformAccountSettingsClient.tsx");
    expect(settings).toContain('type LoadState = "loading" | "ready" | "error"');
    expect(settings).toContain('const editable = loadState === "ready"');
    expect(settings).toContain("disabled={busy || !editable}");
    expect(settings).toContain("async function readResponse");
    expect(settings).toContain('setMessage("Unable to save preferences.")');
  });

  it("keeps People & Access bound to the current school and logged-in account", () => {
    const accessApi = source("src/app/api/school/access/route.ts");
    const accessPage = source("src/app/school/settings/access/page.tsx");
    const compactAccessApi = accessApi.replace(/\s+/g, "");
    expect(compactAccessApi).toContain('select:{name:true,uniqueCode:true}');
    expect(compactAccessApi).toContain('return{school,users,roles,permissions,me:session.userId');
    expect(accessPage).toContain('schoolName={data?.school?.name ?? "School Workspace"}');
    expect(accessPage).toContain('userName={currentUser?.name ?? "School account"}');
    expect(accessPage).toContain("role={currentRoleLabel}");
  });

  it("keeps school transport readers out of the family branch and bounds mutation bodies before JSON decode", () => {
    const transport = source("src/app/api/phase3/transport/route.ts");
    expect(transport).toContain('scope: "school" as const');
    expect(transport).toContain('scope: "family" as const');
    expect(transport).toContain("isFamilyOnly(access.roleKeys)");
    expect(transport).toContain('requirePermission(tx, session.userId, "transport:view")');
    expect(transport).toContain("return NextResponse.json(data");
    expect(transport).not.toContain("Parent transport access requires");
    expect(transport).toContain("MAX_TRANSPORT_BODY_BYTES");
    expect(transport).toContain("readBoundedJson(request)");
    expect(transport).toContain("transportMutationSchema");
    expect(transport).not.toContain("request.json()");
  });

  it("renders pickup approval as an explicit two-person decision with uncapped summary counts", () => {
    const pickup = source("src/app/school/pickup/page.tsx");
    expect(pickup).toContain("Two-person control");
    expect(pickup).toContain('value="rejected"');
    expect(pickup).toContain('value="approved"');
    expect(pickup).toContain("A different authorised staff member must review this request.");
    expect(pickup).toContain("tx.student.count");
    expect(pickup).toContain("tx.approvedPickup.count");
    expect(pickup).toContain("tx.pickupApprovalRequest.count");
    expect(pickup).toContain("tx.pickupEvent.count");
    expect(pickup).toContain("data.pendingCount");
    expect(pickup).toContain("data.pickupsTodayCount");
  });
});
