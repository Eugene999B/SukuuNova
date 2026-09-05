"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";

type Worker={id:string;name:string;email:string;role:string;status:string;permissions:string[]};
type School={id:string;name:string;uniqueCode:string;status:string};
type Access={schoolId:string;schoolName:string|null;uniqueCode:string|null;status:string|null};
type Payload={workers:Worker[];schools:School[];access:Record<string,Access[]>};
const MAX_SCHOOL_SCOPE = 200;

function statusClass(status:string){return status.toLowerCase()==="active"?"app-pill":"app-pill"}

export default function WorkerAccessPage(){
 const searchParams=useSearchParams();
 const requestedWorkerId=searchParams.get("workerId")??"";
 const [data,setData]=useState<Payload|null>(null),[workerId,setWorkerId]=useState(""),[selected,setSelected]=useState<string[]>([]),[workerQuery,setWorkerQuery]=useState(""),[schoolQuery,setSchoolQuery]=useState(""),[schoolFilter,setSchoolFilter]=useState("all"),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 const load=useCallback(()=>fetch("/api/platform/worker-access").then(async r=>{if(!r.ok)throw new Error((await r.json() as {error?:string}).error||"Could not load worker access.");return r.json() as Promise<Payload>}).then(d=>{setData(d);setWorkerId(current=>requestedWorkerId&&d.workers.some(w=>w.id===requestedWorkerId)?requestedWorkerId:(current&&d.workers.some(w=>w.id===current)?current:d.workers[0]?.id||""));}).catch(e=>setMessage(e instanceof Error?e.message:"Could not load worker access.")),[requestedWorkerId]);
 useEffect(()=>{void load()},[load]);
 const currentAccess=useMemo(()=>data?.access?.[workerId]??[],[data,workerId]);
 useEffect(()=>{setSelected(currentAccess.map(x=>x.schoolId))},[workerId,currentAccess]);
 const worker=data?.workers.find(w=>w.id===workerId);
 const isProtected=worker?.role==="super_admin";
 const filteredWorkers=useMemo(()=>data?.workers.filter(w=>`${w.name} ${w.email} ${w.role}`.toLowerCase().includes(workerQuery.toLowerCase()))??[],[data,workerQuery]);
 const filteredSchools=useMemo(()=>data?.schools.filter(s=>{const hay=`${s.name} ${s.uniqueCode}`.toLowerCase();const matchesQuery=hay.includes(schoolQuery.toLowerCase());const matchesFilter=schoolFilter==="all"|| (schoolFilter==="allowed"?selected.includes(s.id):!selected.includes(s.id));return matchesQuery&&matchesFilter})??[],[data,schoolQuery,schoolFilter,selected]);
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):v.length>=MAX_SCHOOL_SCOPE?v:(v.length<MAX_SCHOOL_SCOPE?[...v,id]:v));
 const selectVisible=()=>setSelected(v=>{const next=[...v,...filteredSchools.map(s=>s.id).filter(id=>!v.includes(id))];if(next.length>MAX_SCHOOL_SCOPE){setMessage(`School scope is limited to ${MAX_SCHOOL_SCOPE} schools. Only the first ${MAX_SCHOOL_SCOPE} selected schools were kept.`); }return next.slice(0,MAX_SCHOOL_SCOPE);});
 const clearVisible=()=>{const visible=new Set(filteredSchools.map(s=>s.id));setSelected(v=>v.filter(id=>!visible.has(id)))};
 const save=async()=>{if(!workerId||isProtected)return;setSaving(true);setMessage("");try{const r=await fetch("/api/platform/worker-access",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({adminId:workerId,schoolIds:selected})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||"Could not save scope.");setMessage("Scope saved. The change is now in the platform audit trail.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Could not save scope")}finally{setSaving(false)}};
 const permissionCount=worker?.role==="super_admin"?"All platform permissions":`${worker?.permissions.length??0} granted permissions`;
 return <AppShell universe="platform" active="Worker School Scope" title="Worker school scope" subtitle="Review effective platform access as one decision: role, permissions, status and customer-school boundary.">
  <div className="app-dashboard-grid">
   <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">STEP 1 · OPERATOR</span><h2>Choose a worker</h2><p>Scope is separate from role permissions. A powerful role with zero school scope still has no routine customer-school reach.</p></div><Link href="/platform/admins" className="app-pill">Manage workers</Link></div>
    <input value={workerQuery} onChange={e=>setWorkerQuery(e.target.value)} placeholder="Search workers…" aria-label="Search workers" />
    <div className="app-list" style={{marginTop:10,maxHeight:260,overflowY:"auto"}}>{filteredWorkers.map(w=><button key={w.id} type="button" className={`app-list-row ${w.id===workerId?"is-selected":""}`} style={{width:"100%",textAlign:"left",cursor:"pointer"}} onClick={()=>setWorkerId(w.id)}><div><b>{w.name}</b><span>{w.email} · {w.role}</span></div><span className={statusClass(w.status)}>{w.status}</span></button>)}</div>
    {worker&&<div className="app-banner" style={{marginTop:12}}><div><h3>{worker.name}</h3><p>{worker.email} · {worker.role} · {worker.status}</p><p>{isProtected?"Protected Super Admin: routine school-scope editing is disabled.":`${selected.length} of ${data?.schools.length??0} schools currently allowed.`}</p></div></div>}
   </section>

   <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">STEP 2 · TENANT SCOPE</span><h2 id="allowed-schools-heading">Allowed schools</h2><p>{isProtected?"Protected Super Admin accounts do not use routine school scope.":"Build the exact tenant boundary. Every changed scope is written to the platform audit trail."}</p></div><button className="app-action" disabled={saving||!workerId||isProtected||worker?.status!=="active"} onClick={()=>void save()}><strong>{saving?"Saving…":"Save scope"}</strong>Apply access</button></div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}><label style={{flex:"1 1 220px"}}><span style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0 0 0 0)",whiteSpace:"nowrap"}}>Search schools</span><input value={schoolQuery} onChange={e=>setSchoolQuery(e.target.value)} placeholder="Search schools…" aria-label="Search schools" /></label><button type="button" className="app-pill" disabled={isProtected||selected.length>=MAX_SCHOOL_SCOPE} onClick={selectVisible}>Select visible</button><button type="button" className="app-pill" disabled={isProtected} onClick={clearVisible}>Clear visible</button><select value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)} aria-label="Filter schools" style={{marginLeft:"auto"}}><option value="all">All schools</option><option value="allowed">Allowed only</option><option value="blocked">Blocked only</option></select></div>
    {!isProtected&&<div className="app-banner" style={{marginBottom:10}} role="status"><div><p style={{margin:0}}>{selected.length}/{MAX_SCHOOL_SCOPE} schools selected. The server limit is {MAX_SCHOOL_SCOPE}.</p></div></div>}
    {data&&<div className="app-table-wrap"><table className="app-table" aria-labelledby="allowed-schools-heading"><thead><tr><th scope="col">School</th><th scope="col">Code</th><th scope="col">School status</th><th scope="col">Worker access</th></tr></thead><tbody>{filteredSchools.map(s=><tr key={s.id}><td><label style={{display:"flex",gap:9,alignItems:"center",cursor:isProtected?"default":"pointer"}}><input type="checkbox" disabled={isProtected||(!selected.includes(s.id)&&selected.length>=MAX_SCHOOL_SCOPE)} checked={selected.includes(s.id)} onChange={()=>toggle(s.id)} /><span><b>{s.name}</b></span></label></td><td>{s.uniqueCode}</td><td><span className="app-pill">{s.status}</span></td><td><span className="app-pill">{isProtected?"Platform-wide":""}{!isProtected&&(selected.includes(s.id)?"Allowed":"Blocked")}</span></td></tr>)}</tbody></table></div>}
    {!filteredSchools.length&&<div className="app-empty"><b>No schools match this view.</b><span>Adjust the search or filter to see more tenants.</span></div>}
    {message&&<div className="app-banner" style={{marginTop:12}}><div><h3>{message}</h3><p>Scope changes are restricted to Super Admin and recorded with the before/after boundary.</p></div></div>}
   </section>

   <section className="app-card app-panel" style={{gridColumn:"1/-1"}}><div className="app-card-head"><div><span className="app-eyebrow">STEP 3 · VERIFY</span><h2>Effective access summary</h2><p>Check identity, role permissions, account state and tenant scope together before taking the next administrative action.</p></div></div><div className="app-dashboard-grid" style={{gridTemplateColumns:"repeat(4,minmax(0,1fr))"}}><div className="app-kpi"><span>School access</span><strong>{isProtected?"All":selected.length}</strong><small>{isProtected?"Super Admin boundary":`${data?.schools.length?Math.round(selected.length/data.schools.length*100):0}% of network`}</small></div><div className="app-kpi"><span>Blocked schools</span><strong>{isProtected?"—":Math.max(0,(data?.schools.length??0)-selected.length)}</strong><small>{isProtected?"Not scope-limited":"No customer-school access"}</small></div><div className="app-kpi"><span>Effective permissions</span><strong style={{fontSize:18}}>{permissionCount}</strong><small>Role: {worker?.role??"—"}</small></div><div className="app-kpi"><span>Account state</span><strong style={{fontSize:18}}>{worker?.status??"—"}</strong><small>{isProtected?"Protected identity":"Scope editor requires active account"}</small></div></div>{worker&&worker.permissions.length>0&&<div style={{marginTop:14}}><span className="app-eyebrow">PERMISSION SET</span><div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:8}}>{worker.permissions.map(permission=><span className="app-pill" key={permission}>{permission}</span>)}</div></div>}</section>
  </div>
 </AppShell>;
}
