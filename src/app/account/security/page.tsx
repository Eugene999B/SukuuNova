import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { GUARDIAN_COOKIE, getGuardianSession, createGuardianSessionToken } from "@/lib/guardian-auth";
import { getPlatformSession, getSchoolSession, createPlatformSessionToken, createSchoolSessionToken, PLATFORM_COOKIE, SCHOOL_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import "./security.css";

const db = new PrismaClient();

async function changePassword(formData: FormData) {
  "use server";
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (next.length < 8) throw new Error("New password must contain at least 8 characters.");
  if (next !== confirm) throw new Error("New passwords do not match.");

  const guardian = await getGuardianSession();
  if (guardian) {
    await withTenant(guardian.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: guardian.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      await tx.user.update({ where: { id: guardian.userId }, data: { passwordHash: await hash(next, 12) } });
    });
    const responseCookies = await cookies();
    responseCookies.set(GUARDIAN_COOKIE, await createGuardianSessionToken({ ...guardian, needsPasswordChange: false }), sessionCookieOptions());
    redirect("/guardian");
  }

  const school = await getSchoolSession();
  if (school) {
    await withTenant(school.schoolId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: school.userId }, select: { passwordHash: true } });
      if (!user || !(await compare(current, user.passwordHash))) throw new Error("Current password is incorrect.");
      await tx.user.update({ where: { id: school.userId }, data: { passwordHash: await hash(next, 12) } });
    });
    const responseCookies = await cookies();
    const token = await createSchoolSessionToken({
      kind: "school",
      userId: school.userId,
      schoolId: school.schoolId,
      name: school.name,
      authorizationVersion: school.authorizationVersion,
      impersonationId: school.impersonationId,
      impersonatedByAdminId: school.impersonatedByAdminId
    });
    responseCookies.set(SCHOOL_COOKIE, token, sessionCookieOptions());
    redirect("/dashboard");
  }

  const platform = await getPlatformSession();
  if (platform) {
    const admin = await db.platformAdmin.findUnique({ where: { id: platform.adminId }, select: { passwordHash: true } });
    if (!admin || !(await compare(current, admin.passwordHash))) throw new Error("Current password is incorrect.");
    await db.platformAdmin.update({ where: { id: platform.adminId }, data: { passwordHash: await hash(next, 12) } });
    const responseCookies = await cookies();
    responseCookies.set(PLATFORM_COOKIE, await createPlatformSessionToken(platform), sessionCookieOptions());
    responseCookies.delete(SCHOOL_COOKIE);
    redirect("/platform");
  }
  redirect("/");
}

function SecurityBody({ name, required, target }: { name: string; required: boolean; target: string }) {
  return <div className="security-centre">
    <div className="security-hero">
      <div>
        <span className="security-kicker">Account protection</span>
        <h2>{required ? "Secure your account before continuing" : "Your SukuuNova security centre"}</h2>
        <p>{required ? "A temporary password is active on this account. Replace it now with a private password." : `Review the protection of ${name}'s SukuuNova account from one place.`}</p>
      </div>
      <div className="security-score"><span>Security posture</span><strong>{required ? "Action required" : "Protected"}</strong><small>{required ? "Password update required" : "Password controls available"}</small></div>
    </div>

    <div className="security-grid security-grid-top">
      <section className="security-card security-card-password">
        <div className="security-card-head"><div><span className="security-label">Credentials</span><h3>Change password</h3><p>Use a unique password and keep it private.</p></div><span className="security-icon">●</span></div>
        <form action={changePassword} className="security-form">
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button type="submit">Update password</button>
        </form>
      </section>

      <section className="security-card">
        <div className="security-card-head"><div><span className="security-label">Protection</span><h3>Security checklist</h3><p>The controls SukuuNova should keep visible to every account owner.</p></div><span className="security-status-good">Ready</span></div>
        <div className="security-checklist">
          <div><span className="check">✓</span><div><strong>Password protection</strong><small>Active for this account</small></div></div>
          <div><span className="check">✓</span><div><strong>School-scoped access</strong><small>Permissions are governed by the school workspace</small></div></div>
          <div><span className="pending">•</span><div><strong>Multi-factor authentication</strong><small>Prepared as a dedicated security control</small></div></div>
          <div><span className="pending">•</span><div><strong>Session & device review</strong><small>Designed for future active-session management</small></div></div>
        </div>
      </section>
    </div>

    <div className="security-grid security-grid-three">
      <section className="security-card"><span className="security-label">Account recovery</span><h3>Recovery & sign-in</h3><p>Keep recovery information and sign-in protections easy to find.</p><div className="security-link-list"><Link href="/account/security">Password & recovery <span>→</span></Link><Link href={target === "school workspace" ? "/school/settings/access" : "/account/security"}>Access & delegated accounts <span>→</span></Link></div></section>
      <section className="security-card"><span className="security-label">Access governance</span><h3>Who can reach school data?</h3><p>Review roles, delegated administrators and the scope of staff access.</p><div className="security-link-list"><Link href="/school/settings/roles">Roles & permissions <span>→</span></Link><Link href="/school/settings/access">Sub-accounts & access <span>→</span></Link></div></section>
      <section className="security-card"><span className="security-label">Security operations</span><h3>Recommended controls</h3><p>Centralize the actions that protect high-value school information.</p><ul className="security-mini-list"><li>Require stronger passwords for privileged roles</li><li>Review dormant accounts before term changes</li><li>Use least-privilege roles for delegated administrators</li><li>Keep communication and data exports permission-controlled</li></ul></section>
    </div>

    <section className="security-card security-future"><div><span className="security-label">Security roadmap</span><h3>Advanced controls ready for the next security layer</h3><p>These controls should become first-class SukuuNova security services as the account platform expands: MFA/passkeys, active-session revocation, login history, recovery codes, trusted devices, security alerts, forced sign-out, privileged-action re-authentication and configurable school security policies.</p></div><div className="security-future-grid"><span>Multi-factor</span><span>Passkeys</span><span>Active sessions</span><span>Device trust</span><span>Recovery codes</span><span>Security alerts</span></div></section>
  </div>;
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const guardian = await getGuardianSession();
  const school = await getSchoolSession();
  const platform = await getPlatformSession();
  if (!guardian && !school && !platform) redirect("/");
  const required = (await searchParams).required === "1" || Boolean(guardian?.needsPasswordChange);

  if (school) {
    const schoolRecord = await withTenant(school.schoolId, (tx) => tx.school.findUnique({ where: { id: school.schoolId }, select: { name: true, uniqueCode: true } }));
    if (!schoolRecord) redirect("/dashboard");
    return <AppShell universe="school" title="Account Security" subtitle="Protect your account, review access and keep sign-in controls under your control." active="Account security" schoolName={schoolRecord.name} schoolCode={schoolRecord.uniqueCode} userName={school.name}><SecurityBody name={school.name} required={required} target="school workspace" /></AppShell>;
  }

  if (platform) return <AppShell universe="platform" title="Account Security" subtitle="Protect your SukuuNova platform administrator account." active="Platform Settings" userName={platform.name}><SecurityBody name={platform.name} required={required} target="platform control" /></AppShell>;

  return <main className="guardian-security-shell"><div className="guardian-security-inner"><SecurityBody name="your guardian account" required={required} target="guardian portal" /></div></main>;
}
