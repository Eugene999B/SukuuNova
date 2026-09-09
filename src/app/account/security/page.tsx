import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { compare, hash } from "bcryptjs";
import { KeyRound, LockKeyhole, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { getSchoolAuthorization } from "@/lib/authorization";
import { GUARDIAN_COOKIE, getGuardianSession, createGuardianSessionToken, requireGuardianSession } from "@/lib/guardian-auth";
import { getPlatformSession, getSchoolSession, requirePlatformSession, requireSchoolSession, createPlatformSessionToken, createSchoolSessionToken, PLATFORM_COOKIE, PLATFORM_SESSION_SECONDS, SCHOOL_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db, withTenant } from "@/lib/db";
import { recordLoginAttempt, requestIp } from "@/lib/rate-limit";
import "@/components/settings-hub.css";

async function throttlePasswordChange(identity: string) {
  await recordLoginAttempt("password-change", identity, requestIp(await headers()));
}

async function changePassword(formData: FormData) {
  "use server";
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next.length < 12 || next.length > 256) throw new Error("New password must contain 12–256 characters.");
  if (next !== confirm) throw new Error("New passwords do not match.");

  const guardian = await getGuardianSession();
  if (guardian) {
    const currentGuardian = await requireGuardianSession();
    await throttlePasswordChange(`guardian:${currentGuardian.schoolId}:${currentGuardian.userId}`);
    await withTenant(currentGuardian.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: currentGuardian.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      const now = new Date();
      await tx.user.update({ where: { id: currentGuardian.userId }, data: { passwordHash: await hash(next, 12) } });
      await tx.schoolPasswordResetToken.updateMany({ where: { schoolId: currentGuardian.schoolId, userId: currentGuardian.userId, usedAt: null }, data: { usedAt: now } });
    });
    const responseCookies = await cookies();
    responseCookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ ...currentGuardian, needsPasswordChange: false }), sessionCookieOptions());
    redirect("/guardian/settings");
  }

  const school = await getSchoolSession();
  if (school) {
    const currentSchool = await requireSchoolSession();
    await throttlePasswordChange(`school:${currentSchool.schoolId}:${currentSchool.userId}`);
    const workspace = await withTenant(currentSchool.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: currentSchool.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      const now = new Date();
      await tx.user.update({ where: { id: currentSchool.userId }, data: { passwordHash: await hash(next, 12) } });
      await tx.schoolPasswordResetToken.updateMany({ where: { schoolId: currentSchool.schoolId, userId: currentSchool.userId, usedAt: null }, data: { usedAt: now } });
      return (await getSchoolAuthorization(tx, currentSchool.userId)).workspace;
    });
    const responseCookies = await cookies();
    const token = await createSchoolSessionToken({ kind: "school", userId: currentSchool.userId, schoolId: currentSchool.schoolId, name: currentSchool.name, authorizationVersion: currentSchool.authorizationVersion, impersonationId: currentSchool.impersonationId, impersonatedByAdminId: currentSchool.impersonatedByAdminId });
    responseCookies.set(SCHOOL_COOKIE, token, sessionCookieOptions());
    redirect(workspace === "teacher" ? "/teacher/settings" : "/dashboard");
  }

  const platform = await getPlatformSession();
  if (platform) {
    const currentPlatform = await requirePlatformSession();
    await throttlePasswordChange(`platform:${currentPlatform.adminId}`);
    const admin = await db.platformAdmin.findUnique({ where: { id: currentPlatform.adminId }, select: { passwordHash: true } });
    if (!admin || !(await compare(current, admin.passwordHash))) throw new Error("Current password is incorrect.");
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.platformAdmin.update({ where: { id: currentPlatform.adminId }, data: { passwordHash: await hash(next, 12) } });
      await tx.platformPasswordResetToken.updateMany({ where: { adminId: currentPlatform.adminId, usedAt: null }, data: { usedAt: now } });
    });
    const responseCookies = await cookies();
    responseCookies.set(PLATFORM_COOKIE, await createPlatformSessionToken(currentPlatform), sessionCookieOptions(PLATFORM_SESSION_SECONDS));
    responseCookies.delete(SCHOOL_COOKIE);
    redirect("/account/settings");
  }
  redirect("/");
}

type SecurityUniverse = "platform" | "school" | "teacher" | "guardian";

function SecurityBody({ universe, required, accountName }: { universe: SecurityUniverse; required: boolean; accountName: string }) {
  const related = universe === "platform" ? [
    { href: "/account/settings", icon: UserCog, title: "My settings", description: "Return to your personal platform workspace preferences." },
    { href: "/platform/admins", icon: UsersRound, title: "Platform workers", description: "Review worker roles and permissions separately from your own password." },
    { href: "/platform/audit", icon: ShieldCheck, title: "Security audit", description: "Review privileged platform actions when your role permits it." },
  ] : universe === "guardian" ? [
    { href: "/guardian/settings", icon: UserCog, title: "Guardian settings", description: "Return to your family account, linked children and privacy information." },
    { href: "/guardian/messages", icon: UsersRound, title: "School messages", description: "Contact the school through the communication available to your guardian account." },
  ] : universe === "teacher" ? [
    { href: "/teacher/settings", icon: UserCog, title: "My teacher settings", description: "Return to your teacher account, teaching profile and connected work areas." },
    { href: "/teacher", icon: UsersRound, title: "Teaching profile", description: "Review the classes and subjects currently connected to this account." },
  ] : [
    { href: "/school/settings", icon: UserCog, title: "Settings Home", description: "Return to school-wide configuration and specialist settings." },
    { href: "/school/settings/access", icon: UsersRound, title: "People & Access", description: "Manage other school accounts without sharing this password." },
    { href: "/school/settings/roles", icon: ShieldCheck, title: "Roles & Permissions", description: "Review reusable school roles and governed access." },
  ];

  return (
    <div className="settings-hub">
      <SettingsHero
        eyebrow="Account security"
        title={required ? "Change your temporary password before continuing." : "Protect this account without mixing security with permissions."}
        description="Your password protects this login. Roles and permissions control what the login may do. Keeping those two ideas separate makes account administration safer and easier to understand."
        contextLabel="Account"
        contextValue={accountName}
        contextMeta={required ? "Password change required" : "Password protected"}
      />

      <section className="settings-focus-panel">
        <header>
          <span className="settings-hub-eyebrow">Password</span>
          <h2>{required ? "Set a new private password" : "Change password"}</h2>
          <p>Use at least 12 characters. Your current password is required so another person cannot change it from an unlocked session.</p>
        </header>
        <div className="settings-focus-body">
          <form action={changePassword} className="security-settings-form">
            <label className="settings-field"><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label className="settings-field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></label>
            <label className="settings-field"><span>Confirm new password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></label>
            <div className="settings-save-row"><span className="security-password-guidance"><LockKeyhole size={14} aria-hidden="true" /> Avoid reusing a password from email, banking or another school system.</span><button type="submit" className="settings-primary-action"><KeyRound size={14} aria-hidden="true" /> Update password</button></div>
          </form>
        </div>
      </section>

      {!required ? (
        <SettingsSection title="Related account controls" description="These actions are separate from changing your password.">
          <div className="settings-route-grid">
            {related.map((item) => <SettingsRouteCard key={item.href} href={item.href} icon={item.icon} title={item.title} description={item.description} action="Open" />)}
          </div>
        </SettingsSection>
      ) : null}

      <div className="settings-hub-note">
        <strong>Security features are shown only when they actually exist.</strong>
        <p>SukuuNova will not display pretend MFA, trusted-device or session controls on this page. Platform and School 360 session-revocation tools remain in their real authorised workflows.</p>
      </div>
    </div>
  );
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const guardian = await getGuardianSession();
  const school = await getSchoolSession();
  const platform = await getPlatformSession();
  if (!guardian && !school && !platform) redirect("/");
  const required = (await searchParams).required === "1" || Boolean(guardian?.needsPasswordChange);

  if (school) {
    const data = await withTenant(school.schoolId, async (tx) => {
      const [schoolRecord, access] = await Promise.all([
        tx.school.findUnique({ where: { id: school.schoolId }, select: { name: true, uniqueCode: true } }),
        getSchoolAuthorization(tx, school.userId),
      ]);
      return schoolRecord ? { schoolRecord, workspace: access.workspace, role: access.roles.map((role) => role.name).join(" · ") } : null;
    });
    if (!data) redirect("/dashboard");
    const universe = data.workspace === "teacher" ? "teacher" : "school";
    return <AppShell universe={universe} title="Account Security" subtitle="Password and login protection." active="Account Security" schoolName={data.schoolRecord.name} schoolCode={data.schoolRecord.uniqueCode} userName={school.name} role={data.role || (universe === "teacher" ? "Teacher" : "School account")}><SecurityBody universe={universe} accountName={school.name} required={required} /></AppShell>;
  }

  if (platform) {
    return <AppShell universe="platform" title="Account Security" subtitle="Password and login protection." active="Account Security" userName={platform.name} role={platform.role}><SecurityBody universe="platform" accountName={platform.name} required={required} /></AppShell>;
  }

  const currentGuardian = await requireGuardianSession();
  return <AppShell universe="guardian" title="Account Security" subtitle="Password and family-login protection." active="Account Security" schoolName={currentGuardian.schoolName} userName="Guardian" role="Guardian"><SecurityBody universe="guardian" accountName="Guardian account" required={required} /></AppShell>;
}
