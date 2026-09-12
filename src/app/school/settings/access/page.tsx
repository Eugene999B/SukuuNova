"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, Plus, Search, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsHero } from "@/components/SettingsHub";
import { permissionDescription, permissionGroup, permissionLabel, permissionRisk } from "@/lib/permission-catalog";
import "@/components/settings-hub.css";
import "./access-workspace.css";

type Role = {
  id: string;
  name: string;
  key: string | null;
  isSystem: boolean;
  rolePermissions?: Array<{ permission: { key: string } }>;
};

type Override = {
  granted: boolean;
  permission: { key: string; description: string | null };
};

type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  userRoles: Array<{ role: Role }>;
  permissionOverrides: Override[];
};

type Permission = { id: string; key: string; description: string | null };
type Data = {
  school: { name: string; uniqueCode: string } | null;
  users: User[];
  roles: Role[];
  permissions: Permission[];
  me: string;
  canManage: boolean;
  canControlRoles: boolean;
};

type FormState = { name: string; email: string; phone: string; password: string };
type Mode = "accounts" | "create";
const emptyForm: FormState = { name: "", email: "", phone: "", password: "" };
const elevatedRoleNames = new Set(["Owner", "Administrator", "Principal", "Vice Principal"]);

const rolePurpose: Record<string, string> = {
  Owner: "Ultimate school authority. Keep this role protected.",
  Administrator: "Broad school operations and system administration.",
  Principal: "School leadership, academic oversight and operational approvals.",
  "Vice Principal": "Deputy leadership, monitoring and operational support.",
  "Academic Coordinator": "Academic quality, readiness and coordination.",
  "Department Head": "Department teaching quality and academic review.",
  "Class Teacher": "Assigned-class teaching, attendance and class-teacher duties.",
  "Subject Teacher": "Teaching and assessment for assigned subjects and classes.",
  Accountant: "Finance, collections, billing and financial approvals.",
  "HR Officer": "Staff, recruitment, workforce attendance and payroll workflows.",
  "Admissions Officer": "Admissions, enrolment and learner intake.",
  "Front Desk/Gate Security": "Visitors, identity, attendance support and pickup.",
  "Transport Officer": "Transport operations and learner route assignments.",
  Parent: "Linked child and family access only.",
  Student: "Learner-facing access only.",
};

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function strongPasswordRequired(roles: string[]) {
  return roles.some((role) => elevatedRoleNames.has(role));
}

function AccessPageInner() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<Mode>("accounts");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [grantKeys, setGrantKeys] = useState<string[]>([]);
  const [denyKeys, setDenyKeys] = useState<string[]>([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [handoff, setHandoff] = useState<{ name: string; login: string; roles: string[]; password: string } | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/school/access");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load school accounts.");
      setData(payload as Data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load school accounts.");
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const requestedUserId = searchParams.get("userId");
    if (!data || !requestedUserId) return;
    const requestedUser = data.users.find((user) => user.id === requestedUserId);
    if (requestedUser && requestedUser.id !== selectedId) openUser(requestedUser);
  }, [data, searchParams, selectedId]);

  const selected = data?.users.find((user) => user.id === selectedId);
  const currentUser = data?.users.find((user) => user.id === data.me);
  const currentRoleLabel = currentUser?.userRoles.map(({ role }) => role.name).join(" · ") || "School account";
  const inheritedKeys = useMemo(() => new Set(
    (data?.roles ?? []).filter((role) => draftRoles.includes(role.name)).flatMap((role) => (role.rolePermissions ?? []).map(({ permission }) => permission.key)),
  ), [data, draftRoles]);
  const effectiveKeys = new Set([...inheritedKeys, ...grantKeys].filter((key) => !denyKeys.includes(key)));
  const pendingStaff = (data?.users ?? []).filter((user) => user.status === "pending");
  const activeCount = (data?.users ?? []).filter((user) => user.status === "active").length;
  const suspendedCount = (data?.users ?? []).filter((user) => user.status === "suspended").length;
  const createStrongPassword = strongPasswordRequired(roleNames);
  const createUsesPhonePassword = Boolean(form.phone.trim()) && !createStrongPassword;
  const selectedStrongPassword = strongPasswordRequired(draftRoles);
  const selectedUsesPhonePassword = Boolean(selected?.phone) && !selectedStrongPassword;

  const filteredUsers = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return data?.users ?? [];
    return (data?.users ?? []).filter((user) => [user.name, user.email ?? "", user.phone ?? "", ...user.userRoles.map(({ role }) => role.name)].some((value) => value.toLowerCase().includes(query)));
  }, [accountSearch, data]);

  const filteredPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    return (data?.permissions ?? []).filter((permission) => !query || permissionLabel(permission.key).toLowerCase().includes(query) || permissionGroup(permission.key).toLowerCase().includes(query) || permission.key.toLowerCase().includes(query));
  }, [data, permissionSearch]);

  const groupedPermissions = useMemo(() => Object.entries(
    filteredPermissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      const group = permissionGroup(permission.key);
      (groups[group] ??= []).push(permission);
      return groups;
    }, {}),
  ), [filteredPermissions]);

  function resetCreate() {
    setForm(emptyForm);
    setRoleNames([]);
    setHandoff(null);
  }

  function openUser(user: User) {
    setMode("accounts");
    setHandoff(null);
    setSelectedId(user.id);
    setDraftRoles(user.userRoles.map((entry) => entry.role.name));
    setGrantKeys((user.permissionOverrides ?? []).filter((entry) => entry.granted).map((entry) => entry.permission.key));
    setDenyKeys((user.permissionOverrides ?? []).filter((entry) => !entry.granted).map((entry) => entry.permission.key));
    setForm({ name: user.name, email: user.email ?? "", phone: user.phone ?? "", password: "" });
    setPermissionSearch("");
    setShowAdvanced(false);
  }

  function toggleCreateRole(name: string) {
    setRoleNames((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function toggleDraftRole(name: string) {
    if (!data?.canControlRoles) return;
    setDraftRoles((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }

  function setPermission(key: string, kind: "grant" | "deny") {
    if (kind === "grant") {
      setGrantKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
      setDenyKeys((current) => current.filter((item) => item !== key));
      return;
    }
    setDenyKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setGrantKeys((current) => current.filter((item) => item !== key));
  }

  async function createDirectAccount() {
    if (!roleNames.length) { setMessage("Choose at least one normal role for this account."); return; }
    if (!createUsesPhonePassword) {
      const minimum = createStrongPassword ? 12 : 6;
      if (form.password.length < minimum) { setMessage(`Set a temporary password of at least ${minimum} characters.`); return; }
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, roleNames }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not create account.");
      const temporaryPassword = payload.temporaryPasswordSource === "phone" ? (payload.phone || form.phone) : form.password;
      setHandoff({ name: payload.name, login: payload.email || payload.phone || form.email || form.phone, roles: roleNames, password: temporaryPassword });
      setMessage(`Account for ${payload.name} is ready.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create account.");
    } finally { setSaving(false); }
  }

  async function saveSelectedUser() {
    if (!selected || !data?.canControlRoles) return;
    if (!draftRoles.length) { setMessage("Choose at least one role before saving this account."); return; }
    if (selected.status === "pending" && !selectedUsesPhonePassword) {
      const minimum = selectedStrongPassword ? 12 : 6;
      if (form.password.length < minimum) { setMessage(`Set a login password of at least ${minimum} characters before activating this staff member.`); return; }
    }
    setSaving(true);
    setMessage("");
    try {
      const activating = selected.status === "pending";
      const response = await fetch("/api/school/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          status: activating ? "active" : selected.status,
          password: activating && !selectedUsesPhonePassword ? form.password : undefined,
          roleNames: draftRoles,
          grantedPermissionKeys: grantKeys,
          deniedPermissionKeys: denyKeys,
          clearPermissionOverrides: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update account.");
      if (activating) {
        const temporaryPassword = payload.temporaryPasswordSource === "phone" ? (selected.phone || "") : form.password;
        setHandoff({ name: selected.name, login: selected.email || selected.phone || "No login contact recorded", roles: draftRoles, password: temporaryPassword });
        setMessage(`${selected.name}'s staff login is now active.`);
      } else {
        setMessage(`${selected.name}'s access was updated.`);
      }
      setForm((current) => ({ ...current, password: "" }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update account.");
    } finally { setSaving(false); }
  }

  async function changeStatus(user: User) {
    setSaving(true);
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    try {
      const response = await fetch("/api/school/access", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id, status: nextStatus }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update account status.");
      setMessage(`${user.name} is now ${nextStatus}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update account status.");
    } finally { setSaving(false); }
  }

  return (
    <AppShell universe="school" title="People & Access" subtitle="Create accounts, assign normal roles and review effective access." active="People & Access" schoolName={data?.school?.name ?? "School Workspace"} schoolCode={data?.school?.uniqueCode ?? ""} userName={currentUser?.name ?? "School account"} role={currentRoleLabel}>
      <div className="settings-hub">
        <SettingsHero
          eyebrow="School access"
          title="Choose the person first. Give them the job they actually do."
          description="Most accounts only need a normal role such as Principal, Accountant or Subject Teacher. Ordinary staff can start with their phone number as the temporary password; they must change it after signing in."
          contextLabel="Account health"
          contextValue={`${activeCount} active · ${pendingStaff.length} pending`}
          contextMeta={`${suspendedCount} suspended · ${data?.users.length ?? 0} total identities`}
        />

        {message ? <div className="settings-status-message" role="status" aria-live="polite">{message}</div> : null}

        <div className="access-mode-switch" role="tablist" aria-label="People and access tasks">
          <button type="button" role="tab" aria-selected={mode === "accounts"} className={mode === "accounts" ? "is-active" : ""} onClick={() => setMode("accounts")}><UsersRound size={16} /> Accounts & access</button>
          <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "is-active" : ""} onClick={() => { setMode("create"); resetCreate(); }} disabled={!data?.canManage}><Plus size={16} /> Create account</button>
          <Link href="/school/settings/roles"><ShieldCheck size={16} /> Understand roles</Link>
        </div>

        {mode === "create" ? (
          <section className="settings-focus-panel">
            <header>
              <span className="settings-hub-eyebrow">New login</span>
              <h2>Create a non-teaching school account</h2>
              <p>For teachers, create the staff profile in Staff & Teachers first so the same identity keeps its class and subject assignments. Use this form for leadership, finance and other non-teaching logins.</p>
            </header>
            <div className="settings-focus-body">
              {!data?.canManage ? <div className="access-note">Your account cannot create or change school users.</div> : (
                <div className="access-create-layout">
                  <div className="access-form">
                    <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ama Mensah" /></label>
                    <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@school.com" /></label>
                    <label>Phone / WhatsApp<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Optional if email is provided" /></label>
                    {createUsesPhonePassword ? <div className="access-note"><strong>Temporary password: {form.phone}</strong> This ordinary staff member will use the phone number for the first login, then SukuuNova will require a new password of at least 6 characters.</div> : <label>Temporary password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={`At least ${createStrongPassword ? 12 : 6} characters`} /></label>}
                  </div>
                  <div>
                    <b className="field-label">What job will this person do?</b>
                    <p className="access-help-copy">Choose the closest normal role. You can review exceptions after the account exists.</p>
                    <div className="role-picker compact-grid">
                      {(data?.roles ?? []).map((role) => <button type="button" key={role.id} onClick={() => toggleCreateRole(role.name)} className={roleNames.includes(role.name) ? "chosen" : ""}><strong>{role.name}</strong><span>{rolePurpose[role.name] ?? "School-defined responsibility."}</span></button>)}
                    </div>
                  </div>
                </div>
              )}
              <div className="settings-save-row">
                <button type="button" className="settings-secondary-action" onClick={() => { setMode("accounts"); resetCreate(); }}>Cancel</button>
                <button type="button" className="settings-primary-action" onClick={() => void createDirectAccount()} disabled={saving || !data?.canManage}>{saving ? "Creating…" : "Create account"}</button>
              </div>
            </div>
          </section>
        ) : (
          <div className="access-directory-layout">
            <section className="settings-focus-panel access-directory-panel">
              <header>
                <span className="settings-hub-eyebrow">Account directory</span>
                <h2>Select a person</h2>
                <p>Search by name, login contact or role. Pending staff already exist as staff identities and only need their login activated.</p>
              </header>
              <div className="settings-focus-body">
                <label className="access-search-box"><Search size={15} /><input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search people or roles…" /></label>
                {pendingStaff.length ? <div className="access-note"><strong>{pendingStaff.length} staff {pendingStaff.length === 1 ? "profile is" : "profiles are"} waiting for login activation.</strong> Select a pending person below instead of creating them again.</div> : null}
                <div className="user-list">
                  {filteredUsers.map((user) => (
                    <button className={`user-row ${selectedId === user.id ? "selected" : ""}`} key={user.id} onClick={() => openUser(user)}>
                      <span className="user-avatar">{initials(user.name)}</span>
                      <span className="user-copy"><b>{user.name}{user.id === data?.me ? " · You" : ""}</b><small>{user.email || user.phone || "No login contact"}</small><span>{user.userRoles.map((entry) => entry.role.name).join(" + ") || "No role assigned"}</span></span>
                      <span className={`status-dot ${user.status}`} title={user.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings-focus-panel access-person-panel">
              {!selected ? (
                <div className="access-selection-empty">
                  <UserRoundCog size={34} />
                  <h2>Select an account to review</h2>
                  <p>You will see its normal role, current status and effective access here. Nothing changes until you save.</p>
                </div>
              ) : (
                <>
                  <header>
                    <span className="settings-hub-eyebrow">{selected.status === "pending" ? "Activate staff login" : "Account access"}</span>
                    <h2>{selected.name}</h2>
                    <p>{selected.email || selected.phone || "No login contact"} · {selected.status}</p>
                  </header>
                  <div className="settings-focus-body">
                    {selected.status === "pending" ? <div className="access-note"><strong>This person already exists as staff.</strong> Choose their role. If they have a phone number and are not Owner/Administrator/Principal/Vice Principal, that phone number becomes the temporary first-login password automatically.</div> : null}

                    <div className="access-summary-grid">
                      <div className="settings-readonly"><span>Role rights</span><strong>{inheritedKeys.size}</strong></div>
                      <div className="settings-readonly"><span>Direct grants</span><strong>{grantKeys.length}</strong></div>
                      <div className="settings-readonly"><span>Direct denials</span><strong>{denyKeys.length}</strong></div>
                      <div className="settings-readonly"><span>Effective rights</span><strong>{effectiveKeys.size}</strong></div>
                    </div>

                    <div className="access-step">
                      <div className="access-step-head"><span>1</span><div><h3>Choose the person's normal role</h3><p>Start with their real job. Roles provide the normal inherited permissions.</p></div></div>
                      <div className="role-picker compact-grid">
                        {(data?.roles ?? []).map((role) => <button type="button" key={role.id} onClick={() => toggleDraftRole(role.name)} className={draftRoles.includes(role.name) ? "chosen" : ""} disabled={!data?.canControlRoles}><strong>{role.name}</strong><span>{rolePurpose[role.name] ?? "School-defined responsibility."}</span></button>)}
                      </div>
                    </div>

                    {selected.status === "pending" ? (selectedUsesPhonePassword ? <div className="access-note"><strong>First-login password: {selected.phone}</strong> The staff member must change it after signing in. Their new ordinary-user password may be 6 characters or longer.</div> : <label className="access-password-field">Temporary login password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={`At least ${selectedStrongPassword ? 12 : 6} characters`} disabled={!data?.canControlRoles} /></label>) : null}

                    <div className="access-step">
                      <div className="access-step-head"><span>2</span><div><h3>Only add exceptions when the role is not enough</h3><p>Direct denials override everything. Advanced access is for genuine exceptions, not normal account setup.</p></div></div>
                      <button type="button" className="settings-secondary-action" onClick={() => setShowAdvanced((value) => !value)} disabled={!data?.canManage}><KeyRound size={14} /> {showAdvanced ? "Hide advanced access" : `Advanced access · ${grantKeys.length + denyKeys.length} exceptions`}</button>
                    </div>

                    {showAdvanced && data?.canManage ? (
                      <div className="access-advanced-panel">
                        <label className="access-search-box"><Search size={15} /><input aria-label="Filter permissions" value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Search permissions…" /></label>
                        <div className="permission-list">
                          {groupedPermissions.map(([group, permissions]) => (
                            <div className="permission-group" key={group}>
                              <b>{group}</b>
                              {permissions.map((permission) => (
                                <div className="permission-row" key={permission.key}>
                                  <span><strong>{permissionLabel(permission.key)}{permissionRisk(permission.key) === "critical" ? " · HIGH IMPACT" : ""}</strong><small>{permissionDescription(permission.key)}</small><small>Role: {inheritedKeys.has(permission.key) ? "Granted" : "Not granted"} · Effective: {effectiveKeys.has(permission.key) ? "Allowed" : "Denied"}</small></span>
                                  <button type="button" className={grantKeys.includes(permission.key) ? "on grant" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "grant")} aria-pressed={grantKeys.includes(permission.key)} disabled={!data?.canControlRoles}>Grant</button>
                                  <button type="button" className={denyKeys.includes(permission.key) ? "on deny" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "deny")} aria-pressed={denyKeys.includes(permission.key)} disabled={!data?.canControlRoles}>Deny</button>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="settings-save-row">
                      {selected.status !== "pending" ? <button type="button" className="settings-secondary-action" onClick={() => void changeStatus(selected)} disabled={saving || selected.id === data?.me}>{selected.status === "suspended" ? "Reactivate account" : "Suspend account"}</button> : <span />}
                      {data?.canControlRoles ? <button type="button" className="settings-primary-action" onClick={() => void saveSelectedUser()} disabled={saving}>{saving ? "Saving…" : selected.status === "pending" ? "Activate login" : "Save access"}</button> : null}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {handoff ? (
          <section className="settings-focus-panel" role="status" aria-live="polite">
            <header><span className="settings-hub-eyebrow">Account ready</span><h2>Give these details to {handoff.name} securely</h2><p>This is the temporary first-login password. SukuuNova requires the person to change it after signing in.</p></header>
            <div className="settings-focus-body"><div className="access-handoff-grid"><div className="settings-readonly"><span>Login</span><strong>{handoff.login}</strong></div><div className="settings-readonly"><span>Role</span><strong>{handoff.roles.join(" + ")}</strong></div><div className="settings-readonly"><span>Temporary password</span><strong>{handoff.password}</strong></div></div></div>
          </section>
        ) : null}

        <div className="settings-hub-note"><strong>Teachers are staff first, logins second.</strong><p>Create teaching staff in Staff & Teachers, connect their class and subject assignments, then activate that same person's login here. This prevents duplicate teacher identities.</p></div>
      </div>
    </AppShell>
  );
}

export default function AccessPage() {
  return <Suspense fallback={<div className="settings-hub" aria-busy="true">Loading school accounts…</div>}><AccessPageInner /></Suspense>;
}
