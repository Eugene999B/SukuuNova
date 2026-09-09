import { ShieldCheck, UserCog, UsersRound, Wrench } from "lucide-react";
import DefaultRoleUpgradeReview from "@/components/DefaultRoleUpgradeReview";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard, SettingsSection } from "@/components/SettingsHub";
import { getSchoolAuthorization } from "@/lib/authorization";
import { previewDefaultRoleUpgrades } from "@/lib/default-role-upgrade-service";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import "@/components/settings-hub.css";
import "./roles-workspace.css";

const rolePurpose: Record<string, string> = {
  Owner: "Ultimate school authority. Keep ownership separate from normal daily work.",
  Administrator: "Broad school operations, account administration and system management.",
  Principal: "School leadership, academic oversight and operational approvals.",
  "Vice Principal": "Deputy leadership, monitoring and operational support.",
  "Academic Coordinator": "Academic quality, readiness, reviews and curriculum coordination.",
  "Department Head": "Department-level teaching quality, results and lesson-plan review.",
  Accountant: "Finance, collections, billing, approvals and financial reporting.",
  "HR Officer": "Staff administration, recruitment, attendance and payroll workflows.",
  "Admissions Officer": "Admissions, enrolment and learner intake workflows.",
  "Class Teacher": "Assigned-class attendance, classroom work and class-teacher reporting duties.",
  "Subject Teacher": "Teaching, assessment and academic work for assigned classes and subjects.",
  "Front Desk/Gate Security": "Visitors, attendance support, identity and authorised pickup workflows.",
  "Transport Officer": "Transport operations and assigned learner transport workflows.",
  Parent: "Relationship-scoped family access only.",
  Student: "Learner-facing access only.",
};

export default async function RolesPage() {
  const session = await requireSchoolSession();
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "settings:manage_roles");
    const [school, roles, permissions, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.role.findMany({
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          key: true,
          isSystem: true,
          _count: { select: { rolePermissions: true, userRoles: true } },
        },
      }),
      tx.permission.count(),
      getSchoolAuthorization(tx, session.userId),
    ]);
    const upgradePreview = access.isOwner ? await previewDefaultRoleUpgrades(tx, { schoolId: session.schoolId, actorId: session.userId }) : null;
    return { school, roles, permissions, access, upgradePreview };
  });

  if (!data.school) return null;
  const systemRoles = data.roles.filter((role) => role.isSystem);
  const customRoles = data.roles.filter((role) => !role.isSystem);
  const assignedUsers = data.roles.reduce((sum, role) => sum + role._count.userRoles, 0);

  return (
    <AppShell universe="school" title="Roles & Permissions" subtitle="Understand school roles and govern access safely." active="Roles & Permissions" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="settings-hub">
        <SettingsHero
          eyebrow="Access governance"
          title="Start with a person's job. Fine-tune permissions only when needed."
          description="Roles are reusable responsibility bundles such as Principal, Accountant or Subject Teacher. Individual grants and denials belong on the person's access profile, so you do not need to build a new role for every exception."
          contextLabel="School access model"
          contextValue={`${systemRoles.length} system roles · ${customRoles.length} custom roles`}
          contextMeta={`${assignedUsers} role assignments · ${data.permissions} available permissions`}
        />

        <SettingsSection title="What are you trying to do?" description="Choose the shortest route instead of editing permission lists blindly.">
          <div className="settings-route-grid">
            <SettingsRouteCard href="/school/settings/access" icon={UsersRound} title="Change one person's access" description="Select an account, assign its normal role, then review inherited rights, direct grants, direct denials and effective access." action="Open People & Access" />
            <SettingsRouteCard href="/school/settings/access" icon={UserCog} title="Create or activate an account" description="Create a non-staff login or activate an existing staff profile without duplicating the person." action="Manage accounts" />
            <SettingsRouteCard href="/school/staff" icon={UsersRound} title="Create a teacher or staff profile" description="Teachers should begin in Staff & Teachers so their class and subject relationships stay connected to the same identity." action="Open staff directory" />
            <SettingsRouteCard href="/school/settings" icon={Wrench} title="Back to Settings Home" description="Return to school-wide configuration, academic setup, reports, calendar and communication settings." action="Open Settings Home" />
          </div>
        </SettingsSection>

        <section className="settings-focus-panel">
          <header>
            <span className="settings-hub-eyebrow">Role catalogue</span>
            <h2>Default school jobs</h2>
            <p>These are the reusable roles SukuuNova understands. Permission totals are shown for transparency, but the role's purpose should be the main decision.</p>
          </header>
          <div className="settings-focus-body">
            <div className="role-governance-grid">
              {systemRoles.map((role) => (
                <article className="role-governance-card" key={role.id}>
                  <div className="role-governance-card-head">
                    <span className="role-governance-badge">System role</span>
                    <span>{role._count.userRoles} {role._count.userRoles === 1 ? "account" : "accounts"}</span>
                  </div>
                  <h3>{role.name}</h3>
                  <p>{rolePurpose[role.name] ?? "A standard SukuuNova responsibility bundle for this school."}</p>
                  <small>{role._count.rolePermissions} inherited permissions</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        {customRoles.length > 0 ? (
          <section className="settings-focus-panel">
            <header>
              <span className="settings-hub-eyebrow">School-defined roles</span>
              <h2>Custom responsibility bundles</h2>
              <p>Use custom roles for real recurring jobs that do not fit the defaults. One-off exceptions are better handled as direct grants or denials on the person's account.</p>
            </header>
            <div className="settings-focus-body">
              <div className="role-governance-grid">
                {customRoles.map((role) => (
                  <article className="role-governance-card" key={role.id}>
                    <div className="role-governance-card-head"><span className="role-governance-badge custom">Custom</span><span>{role._count.userRoles} {role._count.userRoles === 1 ? "account" : "accounts"}</span></div>
                    <h3>{role.name}</h3>
                    <p>School-defined role. Review its permission bundle before assigning it to more people.</p>
                    <small>{role._count.rolePermissions} inherited permissions</small>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {data.upgradePreview ? (
          <section className="settings-focus-panel">
            <header>
              <span className="settings-hub-eyebrow">Owner review</span>
              <h2>Keep default roles current without overwriting school decisions</h2>
              <p>SukuuNova can identify newer default rights that are missing from older system roles. The Owner reviews and selects upgrades; custom roles and direct user overrides remain preserved.</p>
            </header>
            <div className="settings-focus-body"><DefaultRoleUpgradeReview initialPreview={data.upgradePreview} /></div>
          </section>
        ) : null}

        <div className="settings-hub-note">
          <strong><ShieldCheck size={14} aria-hidden="true" /> Effective access is what matters.</strong>
          <p>A user's final authority is their role rights plus direct grants, minus direct denials. Use People & Access to see that effective result before saving sensitive changes.</p>
        </div>
      </div>
    </AppShell>
  );
}
