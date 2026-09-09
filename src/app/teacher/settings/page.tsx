import { redirect } from "next/navigation";
import { CalendarClock, ClipboardPenLine, GraduationCap, LockKeyhole, Mail, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { getSchoolAuthorization } from "@/lib/authorization";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import "@/components/settings-hub.css";

export default async function TeacherSettingsPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    const [access, user, school] = await Promise.all([
      getSchoolAuthorization(tx, session.userId),
      tx.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true, phone: true, status: true } }),
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
    ]);
    return user && school ? { access, user, school } : null;
  });

  if (!data) redirect("/login/school");
  if (data.access.workspace !== "teacher") redirect("/dashboard");
  const roleLabel = data.access.roles.map((role) => role.name).join(" · ") || "Teacher";
  const contact = data.user.email || data.user.phone || "No login contact recorded";

  return (
    <AppShell universe="teacher" title="Settings" subtitle="Your teacher account and workspace." active="My Settings" userName={data.user.name} schoolName={data.school.name} schoolCode={data.school.uniqueCode} role={roleLabel}>
      <div className="settings-hub">
        <SettingsHero eyebrow="Teacher account" title="Keep personal account controls separate from school rules." description="Use this page for your own security and to understand the teaching areas connected to your account. Classes, subjects, permissions and official staff records are controlled by authorised school leadership." contextLabel="Signed-in teacher" contextValue={data.user.name} contextMeta={`${roleLabel} · ${contact}`} />

        <SettingsSection title="Your workspace" description="Open the areas that belong to your teaching account.">
          <div className="settings-route-grid">
            <SettingsRouteCard href="/account/security" icon={LockKeyhole} title="Password & security" description="Change your password and protect this teacher login." action="Open security" />
            <SettingsRouteCard href="/teacher" icon={UserRound} title="Teaching profile" description="Review the classes and subjects currently connected to your teacher account." action="Open teacher home" />
            <SettingsRouteCard href="/teacher/timetable" icon={CalendarClock} title="My timetable" description="See the timetable generated from the school's class, subject and teacher assignments." action="Open timetable" />
            <SettingsRouteCard href="/teacher/gradebook" icon={GraduationCap} title="My gradebook" description="Enter and review marks only for the classes and subjects assigned to you." action="Open gradebook" />
            <SettingsRouteCard href="/teacher/homework" icon={ClipboardPenLine} title="Homework & exercises" description="Create and manage work for your assigned classes and subjects." action="Open homework" />
            <SettingsRouteCard href="/teacher/module?view=My%20Messages" icon={Mail} title="Messages" description="Read and send communication available to your teaching account." action="Open messages" />
          </div>
        </SettingsSection>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Account information</span>
            <h2>What SukuuNova currently knows about this login</h2>
            <p>These values come from the school's staff/account record. Contact an authorised school administrator if official details or assignments need correction.</p>
          </header>
          <div className="settings-focus-body">
            <div className="settings-route-grid">
              <div className="settings-readonly"><span>Name</span><strong>{data.user.name}</strong></div>
              <div className="settings-readonly"><span>Role</span><strong>{roleLabel}</strong></div>
              <div className="settings-readonly"><span>Login contact</span><strong>{contact}</strong></div>
              <div className="settings-readonly"><span>Account status</span><strong>{data.user.status}</strong></div>
            </div>
          </div>
        </section>

        <div className="settings-hub-note">
          <strong>School-controlled settings stay with school leadership.</strong>
          <p>A teacher should not be asked to configure grading policy, school terms, role permissions or institutional settings from a personal account page. Your workspace follows the assignments and permissions the school has given you.</p>
        </div>
      </div>
    </AppShell>
  );
}
