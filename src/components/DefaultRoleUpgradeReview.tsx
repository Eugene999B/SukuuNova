"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DefaultRoleUpgradePreview } from "@/lib/default-role-upgrade-service";

export default function DefaultRoleUpgradeReview({ initialPreview }: { initialPreview: DefaultRoleUpgradePreview }) {
  const router = useRouter();
  const [preview, setPreview] = useState(initialPreview);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const keyFor = (roleId: string, permission: string) => roleId + ":" + permission;
  const roles = preview.roles.map(role => ({
    roleId: role.roleId, revision: role.revision,
    permissionKeys: role.additions.filter(item => selected.has(keyFor(role.roleId, item.key))).map(item => item.key),
  })).filter(role => role.permissionKeys.length > 0);
  const changedCount = roles.reduce((sum, role) => sum + role.permissionKeys.length, 0);
  const missingCount = preview.roles.reduce((sum, role) => sum + role.additions.length, 0);

  async function refresh() {
    if (pending.current) return;
    if (selected.size && !window.confirm("Refresh this review and clear your current selections?")) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/school/roles/default-upgrades", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "The role review could not be refreshed.");
      setPreview(data as DefaultRoleUpgradePreview); setSelected(new Set()); setConfirmed(false);
      setMessage("Review refreshed. Select the permissions you want to add.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "The role review could not be refreshed."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function apply() {
    if (pending.current || !confirmed || !roles.length) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/school/roles/default-upgrades", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ roles, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "No permissions were added. Refresh the review before retrying.");
      setPreview(data.preview as DefaultRoleUpgradePreview);
      setSelected(new Set()); setConfirmed(false);
      setMessage(data.addedPermissions + " permissions added across " + data.updatedRoles + " roles. The changes are recorded in audit history.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "The upgrade could not be confirmed. Refresh to check the current role permissions."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <section className="role-builder-card" aria-labelledby="default-upgrade-heading" aria-busy={busy}>
    <div className="role-builder-head">
      <h3 id="default-upgrade-heading">Review default-role upgrades</h3>
      <p>Owner review · {missingCount} missing default permissions across {preview.roles.length} eligible system roles.</p>
      <p>Select each permission deliberately. It will be inherited by current and future accounts assigned to that role. Existing permissions and each account&apos;s direct grants or denials remain in place. Missing defaults may reflect intentional school restrictions.</p>
    </div>
    {error && <p className="role-notice" role="alert">{error}</p>}
    {message && <p className="role-notice" role="status">{message}</p>}
    <div className="role-upgrade-list">
      {preview.roles.filter(role => role.additions.length > 0).map(role => <details key={role.roleId} className="role-permission-group">
        <summary><strong>{role.name}</strong> · {role.additions.length} available additions · {role.assignedAccounts} assigned accounts</summary>
        <p>{role.activeAccounts} active accounts · {role.currentPermissionCount} existing permissions · {role.preservedExtraCount} permissions outside the default retained.</p>
        <div className="role-permission-groups">
          {role.additions.map(permission => <label className="role-permission" key={permission.key}>
            <input type="checkbox" disabled={busy} checked={selected.has(keyFor(role.roleId, permission.key))} onChange={event => {
              const checked = event.target.checked;
              setSelected(current => {
                const next = new Set(current), key = keyFor(role.roleId, permission.key);
                if (checked) next.add(key); else next.delete(key);
                return next;
              });
              setConfirmed(false); setMessage("");
            }} />
            <span><strong>{permission.label} · {permission.risk === "critical" ? "High impact" : permission.risk === "sensitive" ? "Sensitive" : permission.group}</strong>
              <small>{permission.description}</small>
              <small>{permission.deniedAccounts ? permission.deniedAccounts + " assigned accounts have a direct denial that will continue to block this permission." : "No assigned account has a direct denial for this permission."}</small>
            </span>
          </label>)}
        </div>
      </details>)}
    </div>
    {!missingCount && <p className="role-empty">Eligible system roles already include their current defaults. Custom and unrecognized roles are managed separately.</p>}
    <label className="role-permission">
      <input type="checkbox" checked={confirmed} disabled={busy || !changedCount} onChange={event => setConfirmed(event.target.checked)} />
      <span><strong>I reviewed the selected permissions and the assigned-account impact.</strong><small>{changedCount} permission additions selected across {roles.length} roles.</small></span>
    </label>
    <div className="role-builder-actions">
      <button type="button" className="role-secondary" disabled={busy} onClick={() => void refresh()}>Refresh review</button>
      <button type="button" className="role-primary" disabled={busy || !confirmed || !changedCount} onClick={() => void apply()}>{busy ? "Working…" : "Apply selected upgrades"}</button>
    </div>
  </section>;
}
