"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Worker={id:string;name:string;email:string;role:string;status:string};
type School={id:string;name:string;uniqueCode:string;status:string};
type Access={schoolId:string;schoolName:string|null;uniqueCode:string|null;status:string|null};
type Payload={workers:Worker[];schools:School[];access:Record<string,Access[]>};

export default function WorkerAccessPage(){
 const [data,setData]=useState<Payload|null>(null),[workerId,setWorkerId]=useState(""),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(""),[saving,setSaving]=useState(false);
 const load=()=>fetch("/api/platform/worker-access").then(async r=>{if(!r.ok)throw new Error((await r.json() as {error?:string}).error||"Could not load worker access.");return r.json() as Promise<Payload>}).then(d=>{setData(d);setWorkerId(current=>current||d.workers[0]?.id||"");}).catch(e=>setMessage(e instanceof Error?e.message:"Could not load worker access."));
 useEffect(()=>{void load()},[]);
 const currentAccess=useMemo(()=>data?.access?.[workerId]??[],[data,workerId]);
 useEffect(()=>{setSelected(currentAccess.map(x=>x.schoolId))},[workerId,currentAccess.length]);
 const worker=data?.workers.find(w=>w.id===workerId);
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
 const save=async()=>{if(!workerId)return;setSaving(true);setMessage("");try{const r=await fetch("/api/platform/worker-access",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({adminId:workerId,schoolIds:selected})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||"Could not save scope.");setMessage("Worker school scope saved and audited.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Could not save scope.")}finally{setSaving(false)}};
 return <AppShell universe="platform" title="Worker school scope" subtitle="Give each internal worker both the powers they need and the schools they are allowed to touch." active="Workers & Permissions"><div className="app-dashboard-grid"><section className="app-card app-panel"><div className="app-card-head"><div><h2>Choose a worker</h2><p>A worker can have platform capabilities plus a deliberate school scope. Empty scope means no customer-school access.</p></div><Link href="/platform/admins" className="app-pill">Back to workers</Link></div><select value={workerId} onChange={e=>setWorkerId(e.target.value)} style={{width:"100%"}}>{data?.workers.map(w=><option key={w.id} value={w.id}>{w.name} · {w.role} · {w.status}</option>)}</select>{worker&&<div className="app-list-row" style={{marginTop:12}}><div><b>{worker.name}</b><span>{worker.email} · {worker.role}</span></div><span className="app-pill">{selected.length} schools</span></div>}</section><section className="app-card app-panel"><div className="app-card-head"><div><h2>Allowed schools</h2><p>Select exactly which school accounts this worker may administer.</p></div><button className="app-action" disabled={saving||!workerId} onClick={()=>void save()}><strong>{saving?"Saving…":"Save scope"}</strong>Apply access</button></div><div className="app-list">{data?.schools.map(s=><label key={s.id} className="app-list-row" style={{cursor:"pointer"}}><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)} /><div><b>{s.name}</b><span>{s.uniqueCode} · {s.status}</span></div><span className="app-pill">{selected.includes(s.id)?"Allowed":"Blocked"}</span></label>)}</div>{message&&<div className="app-banner" style={{marginTop:12}}><div><h3>{message}</h3><p>Every scope change is recorded in the platform audit trail.</p></div></div>}</section></div></AppShell>;
}
