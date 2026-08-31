"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
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
  users: User[];
  roles: Role[];
  permissions: Permission[];
  me: string;
  canManage: boolean;
  canControlRoles: boolean;
};

type FormState = { name: string; email: string; phone: string; password: string };
const emptyForm: FormState = { name: "", email: "", phone: "", password: "" };

const rolePurpose: Record<string, string> = {
  Owner: "Full school control and oversight.",
  Principal: "School leadership, oversight and academic/operational approvals.",
  "Vice Principal": "Deputy leadership, academic monitoring and operational support.",
  "Academic Coordinator": "Owns academic quality checks, review and coordination.",
  "Department Head": "Reviews department delivery, results and teaching quality.",
  "Class Teacher": "Runs assigned classes and classroom workflows.",
  "Subject Teacher": "Delivers assigned subjects and classroom work.",
  Accountant: "Finance, collections, billing and financial approvals.",
  "HR Officer": "Staff, recruitment, payroll and workforce administration.",
  "Admissions Officer": "Admissions pipeline and student intake.",
  "Front Desk/Gate Security": "Front desk, visitors and authorised pickup workflow.",
  "Transport Officer": "Transport routes, drivers and operational assignments.",
  Parent: "Linked child/family access only.",
  Student: "Learner access only.",
};

const permissionGroups: Record<string, string> = {
  lesson_plans: "Lesson planning",
  homework: "Homework",
  scores: "Results & gradebook",
  report_cards: "Report cards",
  exams: "Exams & assessments",
  classes: "Classes & curriculum",
  attendance: "Attendance",
  analytics: "Analytics",
  reports: "Reports",
  students: "Students",
  finance: "Finance",
  fees: "Fees",
  payroll: "Payroll",
  users: "Accounts",
  settings: "Settings",
  roles: "Roles",
  calendar: "Calendar",
  library: "Library",
  transport: "Transport",
  feeding: "Feeding",
  assets: "Assets",
  recruitment: "Recruitment",
  risk_flags: "Safeguarding",
  ai_drafts: "AI assistance",
  offline: "Offline",
  parents: "Family links",
  templates: "Templates",
  visitors: "Visitors",
  broadcast: "Broadcasts",
};

function permissionGroup(key: string) {
  return permissionGroups[key.split(":")[0]] ?? key.split(":")[0];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AccessPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [grantKeys, setGrantKeys] = useState<string[]>([]);
  const [denyKeys, setDenyKeys] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const response = await fetch("/api/school/access");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load access settings.");
      setData(payload as Data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load access settings.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const requestedUserId = searchParams.get("userId");
    if (!data || !requestedUserId) return;
    const requestedUser = data.users.find((user) => user.id === requestedUserId);
    if (requestedUser && requestedUser.id !== selectedId) openUser(requestedUser);
  }, [data, searchParams, selectedId]);

  const selected = data?.users.find((user) => user.id === selectedId);
  const pendingStaff = (data?.users ?? []).filter((user) => user.status === "pending");

  const filteredPermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.permissions ?? []).filter((permission) => {
      if (!query) return true;
      return permission.key.toLowerCase().includes(query) || (permission.description ?? "").toLowerCase().includes(query);
    });
  }, [data, search]);

  const groupedPermissions = useMemo(() => {
    return Object.entries(
      filteredPermissions.reduce<Record<string, Permission[]>>((groups, permission) => {
        const group = permissionGroup(permission.key);
        (groups[group] ??= []).push(permission);
        return groups;
      }, {}),
    );
  }, [filteredPermissions]);

  function openUser(user: User) {
    setSelectedId(user.id);
    setDraftRoles(user.userRoles.map((entry) => entry.role.name));
    setGrantKeys(user.permissionOverrides.filter((entry) => entry.granted).map((entry) => entry.permission.key));
    setDenyKeys(user.permissionOverrides.filter((entry) => !entry.granted).map((entry) => entry.permission.key));
    setForm({ name: user.name, email: user.email ?? "", phone: user.phone ?? "", password: "" });
    setSearch("");
  }

  function toggleRole(name: string) {
    setRoleNames((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  }

  function setPermission(key: string, kind: "grant" | "deny") {
    if (kind === "grant") {
      setGrantKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
      setDenyKeys((current) => current.filter((item) => item !== key));
      return;
    }
    setDenyKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
    setGrantKeys((current) => current.filter((item) => item !== key));
  }

  async function createDirectAccount() {
    if (!roleNames.length) {
      setMessage("Choose at least one role.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, roleNames }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not create account.");
      setMessage(`Account for ${payload.name} created with ${roleNames.join(" + ")}.`);
      setForm(emptyForm);
      setRoleNames([]);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create account.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUser() {
    if (!selected || !data?.canControlRoles) return;
    if (selected.status === "pending" && form.password.length < 12) {
      setMessage("Set a login password of at least 12 characters before activating this staff member.");
      return;
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
          password: activating ? form.password : undefined,
          roleNames: draftRoles,
          grantedPermissionKeys: grantKeys,
          deniedPermissionKeys: denyKeys,
          clearPermissionOverrides: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update account.");
      setMessage(
        activating
          ? `${selected.name}'s staff login is now active.`
          : `${selected.name}'s role and direct permission profile was updated.`,
      );
      setForm((current) => ({ ...current, password: "" }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update account.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(user: User) {
    setSaving(true);
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    try {
      const response = await fetch("/api/school/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, status: nextStatus }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update status.");
      setMessage(`${user.name} is now ${nextStatus}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      universe="school"
      title="People, Roles & Access"
      subtitle="Create staff profiles separately from logins. Activate only the people who should be able to sign in, with the role and scope they actually need."
      active="Roles & Permissions"
    >
      <div className="access-shell">
        <section className="access-hero">
          <div>
            <span className="access-kicker">SCHOOL ACCESS CONTROL</span>
            <h2>Everyone gets a job, not a copy of the owner.</h2>
            <p>
              Staff records and login accounts are separate. A teacher can exist in the workforce directory without credentials, then be explicitly activated here with the right teaching role and permissions.
            </p>
          </div>
          <div className="access-hero-stat">
            <strong>{data?.users.length ?? 0}</strong>
            <span>staff identities</span>
            <small>{pendingStaff.length} waiting for login activation</small>
          </div>
        </section>

        {pendingStaff.length > 0 ? (
          <section className="access-card">
            <div className="access-card-head">
              <div>
                <span className="access-kicker">PENDING STAFF</span>
                <h3>Staff who do not have a login yet</h3>
                <p>Select a person to activate their account. Their staff profile and teaching assignments already exist.</p>
              </div>
              <span className="access-count">{pendingStaff.length}</span>
            </div>
            <div className="user-list">
              {pendingStaff.map((user) => (
                <button className={`user-row ${selectedId === user.id ? "selected" : ""}`} key={user.id} onClick={() => openUser(user)}>
                  <span className="user-avatar">{initials(user.name)}</span>
                  <span className="user-copy">
                    <b>{user.name}</b>
                    <small>{user.email || user.phone || "No contact"}</small>
                    <span>{user.userRoles.map((entry) => entry.role.name).join(" + ") || "No role"}</span>
                  </span>
                  <span className="status-dot pending" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="access-grid">
          <section className="access-card">
            <div className="access-card-head">
              <div>
                <span className="access-kicker">DIRECT ACCOUNT</span>
                <h3>Create a non-staff login</h3>
                <p>Use this for identities that are not created through the workforce staff directory.</p>
              </div>
            </div>
            {!data?.canManage ? (
              <div className="access-note">Your account cannot create or change school users.</div>
            ) : (
              <div className="access-form">
                <label>Full name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Ama Mensah" /></label>
                <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@school.com" /></label>
                <label>Phone / WhatsApp<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Optional" /></label>
                <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="12+ characters" /></label>
                <div>
                  <b className="field-label">Default role bundle</b>
                  <div className="role-picker">
                    {data.roles.map((role) => (
                      <button type="button" key={role.id} onClick={() => toggleRole(role.name)} className={roleNames.includes(role.name) ? "chosen" : ""}>
                        <strong>{role.name}</strong>
                        <span>{rolePurpose[role.name] ?? "School-defined responsibility."}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button className="access-primary" disabled={saving} onClick={() => void createDirectAccount()}>
                  {saving ? "Creating account…" : "Create account"}
                </button>
              </div>
            )}
          </section>

          <section className="access-card">
            <div className="access-card-head">
              <div>
                <span className="access-kicker">ACCOUNT DIRECTORY</span>
                <h3>Who can do what</h3>
                <p>Open an identity to review status, roles and direct permissions without changing the baseline role for everyone else.</p>
              </div>
              <span className="access-count">{data?.users.length ?? 0}</span>
            </div>
            <div className="user-list">
              {(data?.users ?? []).map((user) => (
                <button className={`user-row ${selectedId === user.id ? "selected" : ""}`} key={user.id} onClick={() => openUser(user)}>
                  <span className="user-avatar">{initials(user.name)}</span>
                  <span className="user-copy">
                    <b>{user.name}{user.id === data?.me ? " · You" : ""}</b>
                    <small>{user.email || user.phone || "No contact"}</small>
                    <span>{user.userRoles.map((entry) => entry.role.name).join(" + ") || "No role"}</span>
                  </span>
                  <span className={`status-dot ${user.status}`} />
                </button>
              ))}
            </div>
          </section>
        </div>

        {selected ? (
          <section className="access-card access-editor">
            <div className="access-card-head">
              <div>
                <span className="access-kicker">{selected.status === "pending" ? "ACTIVATE STAFF LOGIN" : "ACCOUNT PROFILE"}</span>
                <h3>{selected.name}</h3>
                <p>{selected.email || selected.phone || "No contact"} · {selected.status}</p>
              </div>
              <div className="editor-actions">
                {selected.status !== "pending" ? (
                  <button className="access-secondary" onClick={() => void changeStatus(selected)} disabled={saving}>
                    {selected.status === "suspended" ? "Reactivate" : "Suspend"}
                  </button>
                ) : null}
                {data?.canControlRoles ? (
                  <button className="access-primary compact" onClick={() => void saveSelectedUser()} disabled={saving}>
                    {saving ? (selected.status === "pending" ? "Activating…" : "Saving…") : selected.status === "pending" ? "Create login & activate" : "Save profile"}
                  </button>
                ) : null}
              </div>
            </div>

            {selected.status === "pending" ? (
              <div className="access-note" style={{ marginBottom: 16 }}>
                <strong>Login not created yet.</strong> This is a staff profile only. Set a password below and activate the same person; the existing teacher, class and subject relationships remain attached.
              </div>
            ) : null}

            <div className="editor-grid">
              <div>
                <b className="field-label">Roles assigned to this identity</b>
                <div className="role-picker compact-grid">
                  {(data?.roles ?? []).map((role) => (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => data?.canControlRoles && setDraftRoles((current) => current.includes(role.name) ? current.filter((item) => item !== role.name) : [...current, role.name])}
                      className={draftRoles.includes(role.name) ? "chosen" : ""}
                      disabled={!data?.canControlRoles}
                    >
                      <strong>{role.name}</strong>
                      <span>{rolePurpose[role.name] ?? "School-defined responsibility."}</span>
                    </button>
                  ))}
                </div>
                {selected.status === "pending" ? (
                  <label style={{ display: "block", marginTop: 16 }}>
                    Login password
                    <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 12 characters" disabled={!data?.canControlRoles} />
                  </label>
                ) : null}
              </div>

              <div>
                <div className="permission-toolbar">
                  <div>
                    <b className="field-label">Direct permissions for {selected.name}</b>
                    <small>Grant adds a right. Deny overrides an inherited role.</small>
                  </div>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter permissions…" />
                </div>
                <div className="permission-list">
                  {groupedPermissions.map(([group, permissions]) => (
                    <div className="permission-group" key={group}>
                      <b>{group}</b>
                      {permissions.map((permission) => (
                        <div className="permission-row" key={permission.key}>
                          <span>
                            <strong>{permission.key}</strong>
                            <small>{permission.description || "School permission"}</small>
                          </span>
                          <button type="button" className={grantKeys.includes(permission.key) ? "on grant" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "grant")} disabled={!data?.canControlRoles}>Grant</button>
                          <button type="button" className={denyKeys.includes(permission.key) ? "on deny" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "deny")} disabled={!data?.canControlRoles}>Deny</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {message ? <div className="access-message">{message}</div> : null}

        <section className="access-footer">
          <div>
            <span className="access-kicker">ROLE DESIGN</span>
            <h3>Need a new job without changing the system defaults?</h3>
            <p>Create a custom role, give it exactly the permissions it needs, then combine it with another role on one identity.</p>
          </div>
          <Link className="access-secondary link-button" href="/school/settings/roles">Open Role Designer →</Link>
        </section>
      </div>
    </AppShell>
  );
}
