"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, KeyRound, Search, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import "./platform-worker-scope-v3.css";

type Worker = { id: string; name: string; email: string; role: string; status: string; permissions: string[] };
type School = { id: string; name: string; uniqueCode: string; status: string };
type Access = { schoolId: string; schoolName: string | null; uniqueCode: string | null; status: string | null };
type Payload = { workers: Worker[]; schools: School[]; access: Record<string, Access[]> };
const MAX_SCHOOL_SCOPE = 200;

function roleLabel(value: string) {
  return value.replace(/_/g, " ").replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

export default function WorkerAccessPage() {
  const searchParams = useSearchParams();
  const requestedWorkerId = searchParams.get("workerId") ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [workerId, setWorkerId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [workerQuery, setWorkerQuery] = useState("");
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => fetch("/api/platform/worker-access", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Could not load worker access.");
      return response.json() as Promise<Payload>;
    })
    .then((payload) => {
      setData(payload);
      setWorkerId((current) => requestedWorkerId && payload.workers.some((worker) => worker.id === requestedWorkerId)
        ? requestedWorkerId
        : current && payload.workers.some((worker) => worker.id === current)
          ? current
          : payload.workers[0]?.id || "");
    })
    .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load worker access.")), [requestedWorkerId]);

  useEffect(() => { void load(); }, [load]);

  const currentAccess = useMemo(() => data?.access?.[workerId] ?? [], [data, workerId]);
  useEffect(() => { setSelected(currentAccess.map((item) => item.schoolId)); }, [workerId, currentAccess]);

  const worker = data?.workers.find((item) => item.id === workerId);
  const isProtected = worker?.role === "super_admin";
  const filteredWorkers = useMemo(() => {
    const query = workerQuery.trim().toLowerCase();
    return data?.workers.filter((item) => !query || `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(query)) ?? [];
  }, [data, workerQuery]);
  const filteredSchools = useMemo(() => {
    const query = schoolQuery.trim().toLowerCase();
    return data?.schools.filter((school) => {
      const matchesQuery = !query || `${school.name} ${school.uniqueCode}`.toLowerCase().includes(query);
      const allowed = selected.includes(school.id);
      const matchesFilter = schoolFilter === "all" || (schoolFilter === "allowed" ? allowed : !allowed);
      return matchesQuery && matchesFilter;
    }) ?? [];
  }, [data, schoolFilter, schoolQuery, selected]);

  const toggle = (id: string) => setSelected((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : current.length >= MAX_SCHOOL_SCOPE ? current : [...current, id]);

  const selectVisible = () => setSelected((current) => {
    const next = [...current, ...filteredSchools.map((school) => school.id).filter((id) => !current.includes(id))];
    if (next.length > MAX_SCHOOL_SCOPE) setMessage(`School scope is limited to ${MAX_SCHOOL_SCOPE} schools. Only the first ${MAX_SCHOOL_SCOPE} selected schools were kept.`);
    return next.slice(0, MAX_SCHOOL_SCOPE);
  });

  const clearVisible = () => {
    const visible = new Set(filteredSchools.map((school) => school.id));
    setSelected((current) => current.filter((id) => !visible.has(id)));
  };

  const save = async () => {
    if (!workerId || isProtected) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/worker-access", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminId: workerId, schoolIds: selected }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save scope.");
      setMessage("Scope saved. The change is now recorded in the Platform audit trail.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save scope.");
    } finally {
      setSaving(false);
    }
  };

  const permissionCount = worker?.role === "super_admin" ? "All" : String(worker?.permissions.length ?? 0);
  const networkShare = data?.schools.length ? Math.round((selected.length / data.schools.length) * 100) : 0;

  return <AppShell universe="platform" active="Worker School Scope" title="Worker school scope" subtitle="Control exactly which customer schools each Platform operator may enter.">
    <div className="platform-scope-v3">
      <section className="platform-scope-v3-hero">
        <div>
          <span className="platform-scope-v3-eyebrow">Governance · tenant boundary</span>
          <h2>Keep Platform capability and school reach separate.</h2>
          <p>Choose an operator, select only the schools needed for their work, then verify the effective boundary before saving. Super Admin remains platform-wide and protected from routine scope edits.</p>
        </div>
        <Link href="/platform/admins" className="platform-scope-v3-back"><ArrowLeft size={15}/> Workers & permissions</Link>
      </section>

      {message ? <div className="platform-scope-v3-message" role="status">{message}</div> : null}

      <div className="platform-scope-v3-layout">
        <section className="platform-scope-v3-card">
          <div className="platform-scope-v3-head">
            <div><span className="platform-scope-v3-eyebrow">Step 1 · operator</span><h3>Choose a worker</h3><p>Search the accountable Platform identity whose customer-school reach you want to review.</p></div>
            <Users size={20}/>
          </div>
          <label className="platform-scope-v3-search"><Search size={15}/><span className="sr-only">Search workers</span><input value={workerQuery} onChange={(event) => setWorkerQuery(event.target.value)} placeholder="Name, email or role" aria-label="Search workers"/></label>
          <div className="platform-scope-v3-worker-list">
            {filteredWorkers.map((item) => <button key={item.id} type="button" className={`platform-scope-v3-worker ${item.id === workerId ? "is-selected" : ""}`} onClick={() => setWorkerId(item.id)}>
              <span><b>{item.name}</b><small>{item.email} · {roleLabel(item.role)}</small></span>
              <span className={`platform-scope-v3-state ${item.status === "active" ? "is-active" : ""}`}>{item.status}</span>
            </button>)}
            {!filteredWorkers.length ? <div className="platform-scope-v3-empty"><b>No workers match this search.</b><span>Try a name, email address or role.</span></div> : null}
          </div>
          {worker ? <div className="platform-scope-v3-worker-summary"><b>{worker.name}</b><span>{isProtected ? "Protected Super Admin · platform-wide school access" : `${selected.length} of ${data?.schools.length ?? 0} schools currently allowed · ${permissionCount} capability permissions`}</span></div> : null}
        </section>

        <section className="platform-scope-v3-card">
          <div className="platform-scope-v3-head">
            <div><span className="platform-scope-v3-eyebrow">Step 2 · tenant scope</span><h3 id="allowed-schools-heading">Allowed schools</h3><p>{isProtected ? "This protected identity is not limited by routine tenant scope." : "Select only the customer schools this operator needs to support."}</p></div>
            <KeyRound size={20}/>
          </div>

          <div className="platform-scope-v3-toolbar">
            <label className="platform-scope-v3-search"><Search size={15}/><span className="sr-only">Search schools</span><input value={schoolQuery} onChange={(event) => setSchoolQuery(event.target.value)} placeholder="School name or code" aria-label="Search schools"/></label>
            <select className="platform-scope-v3-select" value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} aria-label="Filter schools"><option value="all">All schools</option><option value="allowed">Allowed only</option><option value="blocked">Blocked only</option></select>
            <button type="button" className="platform-scope-v3-tool" disabled={isProtected || selected.length >= MAX_SCHOOL_SCOPE} onClick={selectVisible}>Select visible</button>
            <button type="button" className="platform-scope-v3-tool" disabled={isProtected} onClick={clearVisible}>Clear visible</button>
          </div>

          {!isProtected ? <div className="platform-scope-v3-limit" role="status"><b>{selected.length}/{MAX_SCHOOL_SCOPE}</b> schools selected · {networkShare}% of the current network. The server enforces the {MAX_SCHOOL_SCOPE}-school maximum.</div> : <div className="platform-scope-v3-limit"><ShieldCheck size={14}/> Protected Super Admin has Platform-wide school reach by design.</div>}

          {data ? <div className="platform-scope-v3-table-wrap"><table className="platform-scope-v3-table" aria-labelledby="allowed-schools-heading"><thead><tr><th scope="col">School</th><th scope="col">Code</th><th scope="col">School state</th><th scope="col">Worker access</th></tr></thead><tbody>{filteredSchools.map((school) => {
            const allowed = isProtected || selected.includes(school.id);
            return <tr key={school.id}><td><label><input type="checkbox" disabled={isProtected || (!selected.includes(school.id) && selected.length >= MAX_SCHOOL_SCOPE)} checked={allowed} onChange={() => toggle(school.id)}/><span><b>{school.name}</b></span></label></td><td>{school.uniqueCode}</td><td><span className={`platform-scope-v3-state ${school.status === "active" ? "is-active" : ""}`}>{school.status}</span></td><td><span className={`platform-scope-v3-access ${allowed ? "is-allowed" : "is-blocked"}`}>{isProtected ? "Platform-wide" : allowed ? "Allowed" : "Blocked"}</span></td></tr>;
          })}</tbody></table></div> : null}

          {!filteredSchools.length ? <div className="platform-scope-v3-empty"><b>No schools match this view.</b><span>Adjust the search or access filter to see more tenants.</span></div> : null}
          <div style={{ padding: "0 16px 16px", display: "flex", justifyContent: "flex-end" }}><button className="platform-scope-v3-save" disabled={saving || !workerId || isProtected || worker?.status !== "active"} onClick={() => void save()}><Check size={15}/>{saving ? "Saving scope…" : "Save school scope"}</button></div>
        </section>

        <section className="platform-scope-v3-card platform-scope-v3-verify">
          <div className="platform-scope-v3-head"><div><span className="platform-scope-v3-eyebrow">Step 3 · verify</span><h3>Effective access summary</h3><p>Review the resulting Platform boundary before you leave this governance workflow.</p></div><UserRoundCheck size={20}/></div>
          <div className="platform-scope-v3-kpis">
            <div className="platform-scope-v3-kpi"><span>School access</span><strong>{isProtected ? "All" : selected.length}</strong><small>{isProtected ? "Protected Platform-wide boundary" : `${networkShare}% of current network`}</small></div>
            <div className="platform-scope-v3-kpi"><span>Blocked schools</span><strong>{isProtected ? "—" : Math.max(0, (data?.schools.length ?? 0) - selected.length)}</strong><small>{isProtected ? "Not scope-limited" : "Customer schools this worker cannot enter"}</small></div>
            <div className="platform-scope-v3-kpi"><span>Capabilities</span><strong>{permissionCount}</strong><small>{worker ? roleLabel(worker.role) : "Choose a worker"}</small></div>
            <div className="platform-scope-v3-kpi"><span>Account state</span><strong>{worker?.status ?? "—"}</strong><small>{isProtected ? "Protected identity" : "Scope requires an active worker account"}</small></div>
          </div>
          {worker?.permissions.length ? <div className="platform-scope-v3-permissions">{worker.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div> : null}
        </section>
      </div>
    </div>
  </AppShell>;
}
