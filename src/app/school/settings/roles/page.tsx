import { ShieldCheck, UserCog, UsersRound } from "lucide-react";
import DefaultRoleUpgradeReview from "@/components/DefaultRoleUpgradeReview";
import { AppShell } from "@/components/AppShell";
import { SettingsHero, SettingsRouteCard } from "@/components/SettingsHub";
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
      tx.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true, key: true, isSystem: true, _count: { select: { rolePermissions: true, userRoles: true } } } }),
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

  const roleCards = (roles: typeof data.roles, custom = false) => <div className="role-governance-grid">{roles.map((role) => <article className="role-governance-card" key={role.id}><div className="role-governance-card-head"><span className={`role-governance-badge ${custom ? "custom" : ""}`}>{custom ? "Custom" : "System role"}</span><span>{role._count.userRoles} {role._count.userRoles === 1 ? "account" : "accounts"}</span></div><h3>{role.name}</h3><p>{custom ? "School-defined role. Review its permission bundle before assigning it to more people." : rolePurpose[role.name] ?? "A standard SukuuNova responsibility bundle for this school."}</p><small>{role._count.rolePermissions} inherited permissions</small></article>)}</div>;

  return (
    <AppShell universe="school" title="Roles & Permissions" subtitle="Choose normal job roles first; use permission exceptions only when necessary." active="Roles & Permissions" schoolName={data.school.name} schoolCode={data.school.uniqueCode} userName={session.name}>
      <div className="settings-hub roles-simple">
        <SettingsHero eyebrow="Access governance" title="Give people the job they actually do." description="For most staff, choose a normal school role. Open the catalogue only when you need to understand or maintain the underlying role model." contextLabel="Access model" contextValue={`${systemRoles.length} default roles`} contextMeta={`${assignedUsers} assignments · ${data.permissions} permissions`} />

        <section className="settings-focus-panel">
          <header><span className="settings-hub-eyebrow">Start here</span><h2>What do you need to change?</h2></header>
          <div className="settings-focus-body"><div className="settings-route-grid">
            <SettingsRouteCard href="/school/settings/access" icon={UsersRound} title="Change one person's access" description="Select the account, assign the normal job role, then review effective access." action="Open People & Access" />
            <SettingsRouteCard href="/school/settings/access" icon={UserCog} title="Create or activate an account" description="Create a login or activate an existing staff profile without duplicating the person." action="Manage accounts" />
            <SettingsRouteCard href="/school/staff" icon={UsersRound} title="Create teacher or staff" description="Start in the staff directory so teaching responsibilities stay attached to the same identity." action="Open staff directory" />
          </div></div>
        </section>

        <details className="sn-progressive"><summary>Default role catalogue · {systemRoles.length}</summary><div className="sn-progressive-body">{roleCards(systemRoles)}</div></details>
        {customRoles.length ? <details className="sn-progressive"><summary>School-defined roles · {customRoles.length}</summary><div className="sn-progressive-body">{roleCards(customRoles, true)}</div></details> : null}
        {data.upgradePreview ? <details className="sn-progressive"><summary>Owner role-upgrade review</summary><div className="sn-progressive-body"><p className="module-muted">Review newer default rights without overwriting custom roles or individual permission decisions.</p><DefaultRoleUpgradeReview initialPreview={data.upgradePreview} /></div></details> : null}

        <div className="settings-hub-note"><strong><ShieldCheck size={14} aria-hidden="true" /> Effective access is the final check.</strong><p>Role rights plus direct grants, minus direct denials, determine what a person can actually do. Review that result in People & Access.</p></div>
      </div>
    </AppShell>
  );
}