"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Worker={id:string;name:string;email:string;role:string;status:string};
type School={id:string;name:string;uniqueCode:string;status:string};
type Access={schoolId:string;schoolName:string|null;uniqueCode:string|null;status:string|null};
type Payload={workers:Worker[];schools:School[];access:Record<string,Access[]>};

function statusClass(status:string){return status.toLowerCase()==="active"?"app-pill":"app-pill"}

export default function WorkerAccessPage(){
 const [data,setData]=useState<Payload|null>(null),[workerId,setWorkerId]=useState(""),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(""),[schoolFilter,setSchoolFilter]=useState("all"),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 const load=()=>fetch("/api/platform/worker-access").then(async r=>{if(!r.ok)throw new Error((await r.json() as {error?:string}).error||"Could not load worker access.");return r.json() as Promise<Payload>}).then(d=>{setData(d);setWorkerId(current=>current||d.workers[0]?.id||"");}).catch(e=>setMessage(e instanceof Error?e.message:"Could not load worker access."));
 useEffect(()=>{void load()},[]);
 const currentAccess=useMemo(()=>data?.access?.[workerId]??[],[data,workerId]);
 useEffect(()=>{setSelected(currentAccess.map(x=>x.schoolId))},[workerId,currentAccess]);
 const worker=data?.workers.find(w=>w.id===workerId);
 const filteredWorkers=useMemo(()=>data?.workers.filter(w=>`${w.name} ${w.email} ${w.role}`.toLowerCase().includes(query.toLowerCase()))??[],[data,query]);
 const filteredSchools=useMemo(()=>data?.schools.filter(s=>{const hay=`${s.name} ${s.uniqueCode}`.toLowerCase();const matchesQuery=hay.includes(query.toLowerCase());const matchesFilter=schoolFilter==="all"|| (schoolFilter==="allowed"?selected.includes(s.id):!selected.includes(s.id));return matchesQuery&&matchesFilter})??[],[data,query,schoolFilter,selected]);
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const selectVisible=()=>setSelected(v=>Array.from(new Set([...v,...filteredSchools.map(s=>s.id)])));
 const clearVisible=()=>{const visible=new Set(filteredSchools.map(s=>s.id));setSelected(v=>v.filter(id=>!visible.has(id)))};
 const save=async()=>{if(!workerId)return;setSaving(true);setMessage("");try{const r=await fetch("/api/platform/worker-access",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({adminId:workerId,schoolIds:selected})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||"Could not save scope.");setMessage("Scope saved. The change is now in the platform audit trail.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Could not save scope.")}finally{setSaving(false)}};
 return <AppShell universe="platform" active="Worker School Scope" title="Worker school scope" subtitle="Assign platform operators only the customer schools they are authorised to administer.">
  <div className="app-dashboard-grid">
   <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">STEP 1 · OPERATOR</span><h2>Choose a worker</h2><p>Scope is separate from role permissions. A powerful role with zero school scope still has no customer-school reach.</p></div><Link href="/platform/admins" className="app-pill">Manage workers</Link></div>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search workers or schools…" aria-label="Search workers or schools" />
    <div className="app-list" style={{marginTop:10,maxHeight:260,overflowY:"auto"}}>{filteredWorkers.map(w=><button key={w.id} type="button" className={`app-list-row ${w.id===workerId?"is-selected":""}`} style={{width:"100%",textAlign:"left",cursor:"pointer"}} onClick={()=>setWorkerId(w.id)}><div><b>{w.name}</b><span>{w.email} · {w.role}</span></div><span className={statusClass(w.status)}>{w.status}</span></button>)}</div>
    {worker&&<div className="app-banner" style={{marginTop:12}}><div><h3>{worker.name}</h3><p>{worker.role} · {selected.length} of {data?.schools.length??0} schools currently allowed.</p></div></div>}
   </section>

   <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">STEP 2 · TENANT SCOPE</span><h2>Allowed schools</h2><p>Use search and filters to build the exact tenant scope. Every save replaces the worker’s previous scope atomically.</p></div><button className="app-action" disabled={saving||!workerId} onClick={()=>void save()}><strong>{saving?"Saving…":"Save scope"}</strong>Apply access</button></div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:10}}><button type="button" className="app-pill" onClick={selectVisible}>Select visible</button><button type="button" className="app-pill" onClick={clearVisible}>Clear visible</button><select value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)} aria-label="Filter schools" style={{marginLeft:"auto"}}><option value="all">All schools</option><option value="allowed">Allowed only</option><option value="blocked">Blocked only</option></select></div>
    {data&&<div className="app-table-wrap"><table className="app-table"><thead><tr><th scope="col">School</th><th scope="col">Code</th><th scope="col">School status</th><th scope="col">Worker access</th></tr></thead><tbody>{filteredSchools.map(s=><tr key={s.id}><td><label style={{display:"flex",gap:9,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)} /><span><b>{s.name}</b></span></label></td><td>{s.uniqueCode}</td><td><span className="app-pill">{s.status}</span></td><td><span className="app-pill">{selected.includes(s.id)?"Allowed":"Blocked"}</span></td></tr>)}</tbody></table></div>}
    {!filteredSchools.length&&<div className="app-empty"><b>No schools match this view.</b><span>Adjust the search or filter to see more tenants.</span></div>}
    {message&&<div className="app-banner" style={{marginTop:12}}><div><h3>{message}</h3><p>Scope changes are restricted to Super Admin and recorded for review.</p></div></div>}
   </section>

   <section className="app-card app-panel" style={{gridColumn:"1/-1"}}><div className="app-card-head"><div><span className="app-eyebrow">STEP 3 · VERIFY</span><h2>Effective access summary</h2><p>Review the resulting boundary before leaving the page. This makes accidental over-scoping easier to catch.</p></div></div><div className="app-dashboard-grid" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}><div className="app-kpi"><span>Schools allowed</span><strong>{selected.length}</strong><small>{data?.schools.length?Math.round(selected.length/data.schools.length*100):0}% of network</small></div><div className="app-kpi"><span>Schools blocked</span><strong>{Math.max(0,(data?.schools.length??0)-selected.length)}</strong><small>No customer-school access</small></div><div className="app-kpi"><span>Worker role</span><strong style={{fontSize:18}}>{worker?.role??"—"}</strong><small>{worker?.status??""}</small></div></div></section>
  </div>
 </AppShell>;
}
