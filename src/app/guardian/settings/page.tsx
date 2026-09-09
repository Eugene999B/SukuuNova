import { redirect } from "next/navigation";
import { BookOpen, Gamepad2, LockKeyhole, Mail, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { withTenant } from "@/lib/db";
import { requireGuardianSession } from "@/lib/guardian-auth";
import "@/components/settings-hub.css";

export default async function GuardianSettingsPage() {
  const session = await requireGuardianSession();
  if (session.needsPasswordChange) redirect("/account/security?required=1");

  const data = await withTenant(session.schoolId, async (tx) => {
    const [guardian, user] = await Promise.all([
      tx.guardian.findFirst({
        where: { id: session.guardianId, schoolId: session.schoolId, userId: session.userId },
        select: { name: true, phone: true, students: { select: { studentId: true, relationship: true, isPrimary: true } } },
      }),
      tx.user.findUnique({ where: { id: session.userId }, select: { email: true, phone: true, status: true } }),
    ]);
    return guardian && user ? { guardian, user } : null;
  });

  if (!data) redirect("/login/guardian");

  const linkedCount = new Set(data.guardian.students.map((link) => link.studentId)).size;
  const contact = data.user.email || data.user.phone || data.guardian.phone || "Contact details held by your school";

  return (
    <AppShell universe="guardian" title="Settings" subtitle="Your family account, security and privacy." active="Settings" schoolName={session.schoolName} userName={data.guardian.name} role="Guardian">
      <div className="settings-hub">
        <SettingsHero
          eyebrow="Family account"
          title="Your settings should be simple: account, children, messages and privacy."
          description="Your school controls academic records and school policy. You control your own account security and use this page to understand where family information and learning tools live."
          contextLabel="Guardian account"
          contextValue={data.guardian.name}
          contextMeta={`${contact} · ${linkedCount} linked ${linkedCount === 1 ? "child" : "children"}`}
        />

        <SettingsSection title="Your account" description="These are the settings and family areas that belong to you.">
          <div className="settings-route-grid">
            <SettingsRouteCard href="/account/security" icon={LockKeyhole} title="Password & security" description="Change your password and keep access to your family account protected." action="Open security" />
            <SettingsRouteCard href="/guardian/children" icon={UsersRound} title="Linked children" description="See the learners this guardian account is allowed to access and switch between them safely." action="View children" />
            <SettingsRouteCard href="/guardian/messages" icon={Mail} title="Messages & school contact" description="Read school communication and continue conversations available to your guardian account." action="Open messages" />
            <SettingsRouteCard href="/guardian/arcade" icon={Gamepad2} title="Learning Arcade" description="Choose a linked child and continue age-appropriate learning games with separate progress for each learner." action="Open Learning Arcade" />
            <SettingsRouteCard href="/guardian/academics" icon={BookOpen} title="Academics & reports" description="Review released academic information without exposing draft or unreleased school records." action="Open academics" />
          </div>
        </SettingsSection>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Privacy</span>
            <h2>What this guardian account can and cannot see</h2>
            <p>Family access is relationship-scoped. SukuuNova should never show you another family's child simply because both learners attend the same school.</p>
          </header>
          <div className="settings-focus-body">
            <div className="settings-route-grid">
              <div className="settings-readonly"><span>Linked learners</span><strong>{linkedCount}</strong></div>
              <div className="settings-readonly"><span>Account status</span><strong>{data.user.status}</strong></div>
              <div className="settings-readonly"><span>School</span><strong>{session.schoolName}</strong></div>
            </div>
            <div className="settings-hub-note" style={{ marginTop: 16 }}>
              <strong>Need a child link or contact detail corrected?</strong>
              <p>Relationship links and official guardian details are school records. Contact the school so the change is verified rather than editing protected learner relationships from the family portal.</p>
            </div>
          </div>
        </section>

        <div className="settings-hub-note">
          <strong>Released information only.</strong>
          <p>Guardian pages should show approved/released academic records, valid balances and linked-child information. Draft grades, unrelated learners and school-administration controls remain outside the guardian portal.</p>
        </div>
      </div>
    </AppShell>
  );
}
