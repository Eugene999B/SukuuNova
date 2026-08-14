"use client";

import { useState } from "react";

type Permission = { id: string; key: string; description: string | null };
type Role = {
  id: string;
  name: string;
  rolePermissions: Array<{ permission: Permission }>;
};

export function RoleBuilder({ initial }: { initial: { permissions: Permission[]; roles: Role[] } }) {
  const [roles, setRoles] = useState(initial.roles);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function save() {
    const response = await fetch("/api/phase2/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editing
        ? { action: "update", roleId: editing, name, permissionKeys: selected }
        : { action: "create", name, permissionKeys: selected })
    });
    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Role could not be saved.");
      return;
    }
    const refreshed = await fetch("/api/phase2/roles").then((row) => row.json());
    setRoles(refreshed.roles);
    setEditing(null);
    setName("");
    setSelected([]);
    setNotice("Custom role saved.");
  }

  async function remove(roleId: string) {
    const response = await fetch("/api/phase2/roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", roleId })
    });
    if (!response.ok) {
      const payload = await response.json();
      setNotice(payload.error ?? "Role could not be deleted.");
      return;
    }
    setRoles((rows) => rows.filter((row) => row.id !== roleId));
    setNotice("Custom role deleted.");
  }

  function edit(role: Role) {
    setEditing(role.id);
    setName(role.name);
    setSelected(role.rolePermissions.map((row) => row.permission.key));
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-10">
      <a href="/phase2" className="text-sm font-semibold text-nova">← Phase 2 console</a>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-nova">Owner only</p>
          <h1 className="mt-2 text-2xl font-bold">Custom role builder</h1>
          <label className="mt-5 block text-sm font-medium">Role name
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="mt-5 max-h-[55vh] space-y-2 overflow-auto">
            {initial.permissions.map((permission) => (
              <label key={permission.id} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(permission.key)}
                  onChange={(event) => setSelected((rows) =>
                    event.target.checked ? [...rows, permission.key] : rows.filter((key) => key !== permission.key)
                  )}
                />
                <span><strong>{permission.key}</strong><br /><span className="text-slate-500">{permission.description}</span></span>
              </label>
            ))}
          </div>
          <button onClick={save} disabled={name.trim().length < 2} className="mt-5 w-full rounded-xl bg-nova px-4 py-3 font-semibold text-white disabled:opacity-40">
            {editing ? "Update role" : "Create role"}
          </button>
          {notice && <p className="mt-3 text-sm">{notice}</p>}
        </section>
        <section className="space-y-3">
          {roles.map((role) => (
            <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold">{role.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{role.rolePermissions.length} permissions</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(role)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Edit</button>
                  <button onClick={() => remove(role.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Delete</button>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-600">{role.rolePermissions.map((row) => row.permission.key).join(" · ")}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
