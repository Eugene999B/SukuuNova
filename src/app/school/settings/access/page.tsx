"use client";

import Link from "next/link";
import { permissionGroup, permissionLabel, permissionDescription, permissionRisk } from "@/lib/permission-catalog";
import { Suspense, useEffect, useMemo, useState } from "react";
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
  Administrator: "School operations, account management and system administration.",
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AccessPageInner() {
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
  const [handoff, setHandoff] = useState<{name:string;login:string;roles:string[];password:string}|null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/school/access");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load access settings.");
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
  const inheritedKeys = useMemo(() => new Set(
    (data?.roles ?? []).filter((role) => draftRoles.includes(role.name))
      .flatMap((role) => (role.rolePermissions ?? []).map(({ permission }) => permission.key))
  ), [data, draftRoles]);
  const effectiveKeys = new Set([...inheritedKeys, ...grantKeys].filter((key) => !denyKeys.includes(key)));
  const pendingStaff = (data?.users ?? []).filter((user) => user.status === "pending");

  const filteredPermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.permissions ?? []).filter((permission) => {
      if (!query) return true;
      return permissionLabel(permission.key).toLowerCase().includes(query) || permissionGroup(permission.key).toLowerCase().includes(query) || permission.key.toLowerCase().includes(query) || (permission.description ?? "").toLowerCase().includes(query);
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
    setHandoff(null);
    setSelectedId(user.id);
    setDraftRoles(user.userRoles.map((entry) => entry.role.name));
    setGrantKeys((user.permissionOverrides ?? []).filter((entry) => entry.granted).map((entry) => entry.permission.key));
    setDenyKeys((user.permissionOverrides ?? []).filter((entry) => !entry.granted).map((entry) => entry.permission.key));
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
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not create account.");
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
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update account.");
      if (activating) {
        setHandoff({
          name: selected.name,
          login: selected.email || selected.phone || "No email or phone provided",
          roles: draftRoles,
          password: form.password,
        });
        setMessage(`${selected.name}'s staff login is now active.`);
      } else {
        setMessage(`${selected.name}'s role and direct permission profile was updated.`);
      }
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
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update status.");
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
      subtitle="Access."
      active="Roles & Permissions"
    >
      <div className="access-shell">
        <section className="access-hero">
          <div>
            <span className="access-kicker">SCHOOL ACCESS CONTROL</span>
            <h2>Everyone gets a job, not a copy of the owner.</h2>
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
                    <small>Draft preview: role rights {inheritedKeys.size} · direct grants {grantKeys.length} · direct denials {denyKeys.length} · effective rights {effectiveKeys.size}.</small>
                    <small>Denials take precedence. Pending or suspended accounts cannot use these rights until active. Save profile to apply changes.</small>
                  </div>
                  <input aria-label="Filter permissions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter permissions…" />
                </div>
                {!data?.canManage ? <p>Detailed permission profiles require account-management access.</p> : null}
                <div className="permission-list">
                  {(data?.canManage ? groupedPermissions : []).map(([group, permissions]) => (
                    <div className="permission-group" key={group}>
                      <b>{group}</b>
                      {permissions.map((permission) => (
                        <div className="permission-row" key={permission.key}>
                          <span>
                            <strong>{permissionLabel(permission.key)}{permissionRisk(permission.key) === "critical" ? " · HIGH IMPACT" : ""}</strong>
                            <small>{permissionDescription(permission.key)}</small>
                            <small>Role: {inheritedKeys.has(permission.key) ? "Granted" : "Not granted"} · Direct: {denyKeys.includes(permission.key) ? "Denied" : grantKeys.includes(permission.key) ? "Granted" : "Inherited"} · Effective: {effectiveKeys.has(permission.key) ? "Allowed" : "Denied"}</small>
                          </span>
                          <button type="button" className={grantKeys.includes(permission.key) ? "on grant" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "grant")} aria-pressed={grantKeys.includes(permission.key)} aria-label={`Grant ${permissionLabel(permission.key)}`} disabled={!data?.canControlRoles}>Grant</button>
                          <button type="button" className={denyKeys.includes(permission.key) ? "on deny" : ""} onClick={() => data?.canControlRoles && setPermission(permission.key, "deny")} aria-pressed={denyKeys.includes(permission.key)} aria-label={`Deny ${permissionLabel(permission.key)}`} disabled={!data?.canControlRoles}>Deny</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {handoff ? (
          <section className="access-card" role="status" aria-live="polite">
            <div className="access-card-head">
              <div>
                <span className="access-kicker">ACCOUNT READY</span>
                <h3>Here is what to tell {handoff.name}</h3>
                <p>The password below is shown only because you just set it. It is not stored in this handoff panel after you leave or select another account.</p>
              </div>
            </div>
            <div className="access-note">
              <strong>Login: {handoff.login}</strong><br />
              <span>Role: {handoff.roles.join(" + ") || "No role"}</span><br />
              <span>Initial password: <code>{handoff.password}</code></span>
            </div>
          </section>
        ) : null}

        {message ? <div className="access-message" role="status" aria-live="polite">{message}</div> : null}

        <section className="access-footer">
          <div>
            <span className="access-kicker">ROLE DESIGN</span>
            <h3>Need a new job without changing the system defaults?</h3>

          </div>
          <Link className="access-secondary link-button" href="/school/settings/roles">Open Role Designer →</Link>
        </section>
      </div>
    </AppShell>
  );
}


export default function AccessPage() {
  return (
    <Suspense fallback={<div className="access-shell" aria-busy="true">Loading access settings…</div>}>
      <AccessPageInner />
    </Suspense>
  );
}
