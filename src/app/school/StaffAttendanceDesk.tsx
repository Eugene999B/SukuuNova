"use client";

import { useEffect, useMemo, useState } from "react";

type Staff = { id:string; name:string };
type Trend = { date:string; present:number; late:number; absent:number };
type Dashboard = { staff:Staff[]; totals:{present:number;late:number;absent:number}; trends:Trend[] };

function today(){ return new Date().toISOString().slice(0,10); }
function daysAgo(value:string,days:number){ const date=new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate()-days); return date.toISOString().slice(0,10); }

export default function StaffAttendanceDesk(){
 const endDefault=today();
 const [start,setStart]=useState(daysAgo(endDefault,6));
 const [end,setEnd]=useState(endDefault);
 const [staffId,setStaffId]=useState("");
 const [data,setData]=useState<Dashboard|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 async function load(){
  setLoading(true); setError("");
  try{
   const params=new URLSearchParams({start,end}); if(staffId) params.set("staffId",staffId);
   const response=await fetch(`/api/phase2/staff-attendance?${params.toString()}`);
   const body=await response.json();
   if(!response.ok) throw new Error(body.error ?? "Unable to load staff attendance.");
   setData(body);
  }catch(err){ setError(err instanceof Error?err.message:"Unable to load staff attendance."); }
  finally{ setLoading(false); }
 }

 useEffect(()=>{ void load(); },[start,end,staffId]);
 const latest=data?.trends.at(-1);
 const rate=useMemo(()=>{
  const population=(data?.staff.length??0)*(data?.trends.length??0);
  return population?Math.round(((data?.totals.present??0)/population)*100):0;
 },[data]);
 return <div className="module-shell">
  <section className="module-hero">
   <div><span className="eyebrow">People · Attendance</span><h2>Staff Attendance</h2><p>Record visibility for the selected period. Filter staff, inspect trends and follow exceptions.</p></div>
   <div className="module-actions"><a className="button secondary" href="/school/staff">Staff directory</a><a className="button primary" href="/school/staff-attendance?action=create">Open register</a></div>
  </section>
  <section className="module-stats">
   <div className="module-stat"><span>Present</span><strong>{loading?"—":data?.totals.present??0}</strong></div>
   <div className="module-stat"><span>Late</span><strong>{loading?"—":data?.totals.late??0}</strong></div>
   <div className="module-stat"><span>Absent</span><strong>{loading?"—":data?.totals.absent??0}</strong></div>
   <div className="module-stat"><span>Presence rate</span><strong>{loading?"—":`${rate}%`}</strong></div>
  </section>
  <section className="module-layout">
   <div className="module-panel">
    <div className="module-toolbar">
     <div className="module-filters">
      <label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label>
      <label>To<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      <label>Staff<select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All staff</option>{(data?.staff??[]).map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
     </div>
     <button className="button secondary" onClick={()=>void load()} disabled={loading}>Refresh</button>
    </div>
    {error&&<div className="module-message error">{error}</div>}
    <div className="module-table-wrap"><table className="module-table"><thead><tr><th>Date</th><th>Present</th><th>Late</th><th>Absent</th></tr></thead><tbody>{(data?.trends??[]).slice().reverse().map(row=><tr key={row.date}><td>{new Date(`${row.date}T00:00:00.000Z`).toLocaleDateString()}</td><td>{row.present}</td><td>{row.late}</td><td>{row.absent}</td></tr>)}{!loading&&!(data?.trends.length)&&<tr><td colSpan={4}><div className="module-empty"><strong>No attendance records</strong><span>Choose another period or open the register.</span></div></td></tr>}</tbody></table></div>
   </div>
   <aside className="module-side-card">
    <div className="module-side-card-head"><h3>Today</h3><span>{latest?.date??today()}</span></div>
    <div className="module-list">
     <div className="module-list-item"><span>Present</span><strong>{latest?.present??0}</strong></div>
     <div className="module-list-item"><span>Late</span><strong>{latest?.late??0}</strong></div>
     <div className="module-list-item"><span>Absent</span><strong>{latest?.absent??0}</strong></div>
     <a className="module-list-item" href="/school/attendance/exceptions"><span>Attendance exceptions</span><span>→</span></a>
     <a className="module-list-item" href="/school/staff"><span>Open staff records</span><span>→</span></a>
    </div>
   </aside>
  </section>
 </div>;
}
