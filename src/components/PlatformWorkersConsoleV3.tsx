"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, KeyRound, LockKeyhole, RefreshCw, Search, ShieldCheck, UserPlus, Users } from "lucide-react";

type Worker = { id: string; name: string; email: string; role: string; status: string; permissions: string[] };
type Payload = { admins: Worker[]; permissions: string[] };
type EditableRole = "platform_admin" | "support_admin" | "billing_admin" | "analytics_admin";

const GROUPS: Record<string, { label: string; description: string; permissions: string[] }> = {
  Network: { label: "Network operations", description: "View and manage school accounts and controlled customer access.", permissions: ["schools.view", "schools.manage", "schools.suspend", "schools.impersonate"] },
  Finance: { label: "Finance", description: "Subscription, invoice and payment administration.", permissions: ["billing.view", "billing.manage", "plans.manage"] },
  Insight: { label: "Analytics & evidence", description: "Cross-school reporting and historical evidence review.", permissions: ["analytics.view", "audit.view"] },
  Operations: { label: "Support operations", description: "Case handling and support workflow controls.", permissions: ["support.view", "support.manage"] },
  Security: { label: "Security & administration", description: "Internal operators, platform security and settings.", permissions: ["admins.view", "admins.manage", "security.manage", "settings.manage"] },
};

function permissionLabel(value: string) {
  return value.replace(/\./g, " · ").replace(/_/g, " ").replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function roleLabel(value: string) {
  return value.replace(/_/g, " ").replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function editableRole(value: string): EditableRole {
  return ["platform_admin", "support_admin", "billing_admin", "analytics_admin"].includes(value) ? value as EditableRole : "support_admin";
}

function initials(value: string) {
  return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "OP";
}

export default function PlatformWorkersConsoleV3() {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [draftRole, setDraftRole] = useState<EditableRole>("support_admin");
  const [draftPermissions, setDraftPermissions] = useState<string[]>(["support.view", "support.manage"]);
  const [createMode, setCreateMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/platform/admin?view=admins", { cache: "no-store" });
      const payload = await response.json() as Payload & { error?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.message ?? payload.error ?? "Unable to load platform workers.");
        return;
      }
      setData(payload);
      setSelectedId((current) => current && payload.admins.some((worker) => worker.id === current) ? current : payload.admins[0]?.id ?? "");
      setMessage("");
    } catch {
      setMessage("Unable to load platform workers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = data?.admins.find((worker) => worker.id === selectedId) ?? null;
  const protectedSuperAdmin = selected?.role === "super_admin";
  const workers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.admins ?? []).filter((worker) => !normalized || worker.name.toLowerCase().includes(normalized) || worker.email.toLowerCase().includes(normalized) || worker.role.toLowerCase().includes(normalized));
  }, [data, query]);
  const counts = useMemo(() => ({
    active: (data?.admins ?? []).filter((worker) => worker.status === "active").length,
    suspended: (data?.admins ?? []).filter((worker) => worker.status !== "active").length,
  }), [data]);

  function beginCreate() {
    setCreateMode(true);
    setSelectedId("");
    setDraftName("");
    setDraftEmail("");
    setDraftPassword("");
    setDraftRole("support_admin");
    setDraftPermissions(["support.view", "support.manage"]);
    setMessage("");
  }

  function loadWorker(worker: Worker) {
    setCreateMode(false);
    setSelectedId(worker.id);
    setDraftName(worker.name);
    setDraftEmail(worker.email);
    setDraftPassword("");
    setDraftRole(editableRole(worker.role));
    setDraftPermissions(worker.permissions);
    setMessage("");
  }

  function togglePermission(permission: string) {
    if (protectedSuperAdmin) return;
    setDraftPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  function toggleGroup(permissions: string[]) {
    if (protectedSuperAdmin) return;
    const complete = permissions.every((permission) => draftPermissions.includes(permission));
    setDraftPermissions((current) => complete ? current.filter((permission) => !permissions.includes(permission)) : [...new Set([...current, ...permissions])]);
  }

  async function save() {
    if (!createMode && (!selectedId || protectedSuperAdmin)) return;
    setLoading(true);
    setMessage("");
    try {
      const payload = createMode
        ? { action: "createWorker", name: draftName.trim(), email: draftEmail.trim(), password: draftPassword, role: draftRole, permissions: draftPermissions }
        : { action: "updateWorker", adminId: selectedId, status: selected?.status === "active" ? "active" : "suspended", role: draftRole, permissions: draftPermissions };
      const response = await fetch("/api/platform/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) {
        setMessage(result.message ?? result.error ?? "Could not save worker.");
        return;
      }
      setMessage(createMode ? "Worker created and written to the Platform audit trail." : "Worker permissions updated and audited.");
      setCreateMode(false);
      await load();
    } catch {
      setMessage("Could not save worker.");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(status: "active" | "suspended") {
    if (!selectedId || protectedSuperAdmin) return;
    setLoading(true);
    try {
      const response = await fetch("/api/platform/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateWorker", adminId: selectedId, status, role: draftRole, permissions: draftPermissions }) });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? `Worker ${status === "active" ? "reactivated" : "suspended"} and audited.` : (result.message ?? result.error ?? "Could not update worker."));
      if (response.ok) await load();
    } catch {
      setMessage("Could not update worker.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeSessions() {
    if (!selectedId || protectedSuperAdmin) return;
    if (!window.confirm(`Revoke all active sessions for ${selected?.name ?? "this worker"}? They will need to sign in again on every device.`)) return;
    setLoading(true);
    try {
      const response = await fetch("/api/platform/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revokeSessions", adminId: selectedId }) });
      const result = await response.json() as { error?: string; message?: string };
      setMessage(response.ok ? (result.message ?? "All worker sessions revoked and audited.") : (result.message ?? result.error ?? "Could not revoke worker sessions."));
    } catch {
      setMessage("Could not revoke worker sessions.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="platform-workers-v3">
    <section className="platform-workers-v3-hero">
      <div><span className="platform-workers-v3-eyebrow">Governance</span><h2>Give each operator only the Platform access they need.</h2><p>Manage internal Platform identities and capability permissions here. School reach is controlled separately, so a role never silently grants access to every tenant.</p></div>
      <div className="platform-workers-v3-actions"><button type="button" className="platform-workers-v3-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button><button type="button" className="platform-workers-v3-button is-primary" onClick={beginCreate}><UserPlus size={16}/> New worker</button></div>
    </section>

    {message ? <div className="platform-workers-v3-notice" role="status">{message}</div> : null}

    <section className="platform-workers-v3-kpis" aria-label="Worker governance summary">
      <div className="platform-workers-v3-kpi"><span>Platform operators</span><strong>{data?.admins.length ?? 0}</strong><p>Internal administrative identities</p></div>
      <div className="platform-workers-v3-kpi"><span>Active</span><strong>{counts.active}</strong><p>Currently allowed to operate</p></div>
      <div className="platform-workers-v3-kpi"><span>Suspended</span><strong>{counts.suspended}</strong><p>Blocked pending governance review</p></div>
      <div className="platform-workers-v3-kpi"><span>Access model</span><strong>2 layers</strong><p>Capabilities here · school scope separately</p></div>
    </section>

    <div className="platform-workers-v3-layout">
      <section className="platform-workers-v3-card">
        <div className="platform-workers-v3-card-head"><div><h3>Platform operators</h3><p>Find the identity first, then inspect its effective role and capabilities.</p></div><Users size={20}/></div>
        <label className="platform-workers-v3-search"><Search size={16}/><span className="sr-only">Search workers</span><input aria-label="Search workers" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email or role"/></label>
        <div className="platform-workers-v3-list">{workers.map((worker) => <button type="button" className={`platform-workers-v3-row ${selectedId === worker.id && !createMode ? "is-selected" : ""}`} key={worker.id} onClick={() => loadWorker(worker)}><span className="platform-workers-v3-avatar" aria-hidden="true">{initials(worker.name)}</span><span><b>{worker.name}</b><small>{worker.email} · {roleLabel(worker.role)}</small></span><span className={`platform-workers-v3-state is-${worker.status}`}>{worker.status}</span><ChevronRight size={15} aria-hidden="true"/></button>)}{!workers.length ? <div className="platform-workers-v3-empty"><b>No operators match this search.</b><span>Try a name, email address or role.</span></div> : null}</div>
      </section>

      <section className="platform-workers-v3-card">
        <div className="platform-workers-v3-card-head"><div><h3>{createMode ? "Create Platform worker" : selected ? selected.name : "Worker details"}</h3><p>{createMode ? "Create one accountable operator identity; never share Platform credentials." : selected ? `${selected.email} · ${roleLabel(selected.role)} · ${selected.status}` : "Select an operator to inspect access."}</p></div>{selected && !createMode ? <Link className="platform-workers-v3-scope-link" href={`/platform/admins/access?workerId=${encodeURIComponent(selected.id)}`}><KeyRound size={14}/> School scope</Link> : null}</div>

        {protectedSuperAdmin && !createMode ? <div className="platform-workers-v3-protected" role="note"><ShieldCheck size={19}/><div><b>Protected Super Admin</b><p>This identity is read-only in routine governance. Role, permissions and suspension require a dedicated break-glass process.</p></div></div> : null}

        {(selected && !createMode) || createMode ? <div className="platform-workers-v3-editor">
          <div className="platform-workers-v3-form">
            <label><span>Full name</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. Customer Support Lead" disabled={!createMode}/></label>
            <label><span>Email</span><input type="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} placeholder="operator@sukuunova.com" disabled={!createMode}/></label>
            {createMode ? <label><span>Temporary password</span><input type="password" value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="12+ characters"/></label> : null}
            <label><span>Platform role</span><select value={protectedSuperAdmin ? "platform_admin" : draftRole} onChange={(event) => setDraftRole(event.target.value as EditableRole)} disabled={protectedSuperAdmin}><option value="platform_admin">Platform Admin</option><option value="support_admin">Support Admin</option><option value="billing_admin">Billing Admin</option><option value="analytics_admin">Analytics Admin</option></select></label>
          </div>

          <div className="platform-workers-v3-section-head"><h4>Capability groups</h4><span>{draftPermissions.length} permissions selected</span></div>
          <div className="platform-workers-v3-permissions" aria-disabled={protectedSuperAdmin}>{Object.entries(GROUPS).map(([key, group]) => {
            const complete = group.permissions.every((permission) => draftPermissions.includes(permission));
            return <div className={`platform-workers-v3-group ${complete ? "is-enabled" : ""}`} key={key}><button type="button" className="platform-workers-v3-group-head" onClick={() => toggleGroup(group.permissions)} disabled={protectedSuperAdmin}><span><b>{group.label}</b><small>{group.description}</small></span><span className={`platform-workers-v3-toggle ${complete ? "is-on" : ""}`}>{complete ? "Enabled" : "Off"}</span></button><div className="platform-workers-v3-items">{group.permissions.map((permission) => <label key={permission}><input type="checkbox" checked={draftPermissions.includes(permission)} onChange={() => togglePermission(permission)} disabled={protectedSuperAdmin}/><span>{permissionLabel(permission)}</span></label>)}</div></div>;
          })}</div>

          <div className="platform-workers-v3-selected"><span>Selected capabilities</span>{draftPermissions.slice(0, 8).map((permission) => <code key={permission}>{permission}</code>)}{draftPermissions.length > 8 ? <code>+{draftPermissions.length - 8} more</code> : null}</div>

          <div className="platform-workers-v3-editor-actions">{createMode ? <button type="button" className="platform-workers-v3-button is-primary" disabled={loading || draftName.trim().length < 2 || draftEmail.trim().length < 3 || draftPassword.length < 12} onClick={() => void save()}><UserPlus size={15}/> Create worker</button> : <><button type="button" className="platform-workers-v3-button is-primary" disabled={loading || protectedSuperAdmin} onClick={() => void save()}><Check size={15}/> Save permissions</button>{selected?.status === "active" ? <button type="button" className="platform-workers-v3-button is-danger" disabled={loading || protectedSuperAdmin} onClick={() => void setStatus("suspended")}><LockKeyhole size={15}/> Suspend worker</button> : <button type="button" className="platform-workers-v3-button" disabled={loading || protectedSuperAdmin} onClick={() => void setStatus("active")}><Check size={15}/> Reactivate worker</button>}{selected && !protectedSuperAdmin ? <button type="button" className="platform-workers-v3-button" disabled={loading} onClick={() => void revokeSessions()}><KeyRound size={15}/> Revoke sessions</button> : null}</>}</div>
        </div> : <div className="platform-workers-v3-empty is-large"><ShieldCheck size={24}/><b>Select an operator to inspect effective Platform capabilities.</b><span>Super Admin identities remain protected from routine role and permission edits.</span></div>}
      </section>
    </div>
  </div>;
}
