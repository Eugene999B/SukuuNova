"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./staff-attendance.css";

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

 const load=useCallback(async()=>{
  setLoading(true); setError("");
  try{
   const params=new URLSearchParams({start,end}); if(staffId) params.set("staffId",staffId);
   const response=await fetch(`/api/phase2/staff-attendance?${params.toString()}`);
   const body=await response.json();
   if(!response.ok) throw new Error(body.error ?? "Unable to load staff attendance.");
   setData(body);
  }catch(err){ setError(err instanceof Error?err.message:"Unable to load staff attendance."); }
  finally{ setLoading(false); }
 },[start,end,staffId]);

 useEffect(()=>{ void load(); },[load]);
 const latest=data?.trends.at(-1);
 const rate=useMemo(()=>{
  const population=(data?.staff.length??0)*(data?.trends.length??0);
  return population?Math.round(((data?.totals.present??0)/population)*100):0;
 },[data]);
 return <div className="staff-attendance">
  <section className="staff-attendance__hero">
   <div><span className="module-overline">People · Attendance</span><h2>Staff Attendance</h2><p>See attendance for any date range, isolate an individual staff member, and move straight into the register or exception queue.</p></div>
   <div className="staff-attendance__actions"><Link className="staff-attendance__button secondary" href="/school/staff">Staff directory</Link><Link className="staff-attendance__button primary" href="/school/staff-attendance?action=create">Open register</Link></div>
  </section>
  <section className="staff-attendance__stats">
   <div className="staff-attendance__stat"><span>Present</span><strong>{loading?"—":data?.totals.present??0}</strong></div>
   <div className="staff-attendance__stat"><span>Late</span><strong>{loading?"—":data?.totals.late??0}</strong></div>
   <div className="staff-attendance__stat"><span>Absent</span><strong>{loading?"—":data?.totals.absent??0}</strong></div>
   <div className="staff-attendance__stat"><span>Presence rate</span><strong>{loading?"—":`${rate}%`}</strong></div>
  </section>
  <section className="staff-attendance__layout">
   <div className="staff-attendance__panel">
    <div className="staff-attendance__toolbar">
     <div className="staff-attendance__filters">
      <label>From<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label>
      <label>To<input type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      <label>Staff<select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">All staff</option>{(data?.staff??[]).map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
     </div>
     <button className="staff-attendance__refresh" onClick={()=>void load()} disabled={loading}>{loading?"Loading…":"Refresh"}</button>
    </div>
    {error&&<div className="staff-attendance__message">{error}</div>}
    <div className="staff-attendance__table-wrap"><table className="staff-attendance__table"><thead><tr><th>Date</th><th>Present</th><th>Late</th><th>Absent</th></tr></thead><tbody>{(data?.trends??[]).slice().reverse().map(row=><tr key={row.date}><td>{new Date(`${row.date}T00:00:00.000Z`).toLocaleDateString()}</td><td className="staff-attendance__number">{row.present}</td><td className="staff-attendance__number">{row.late}</td><td className="staff-attendance__number">{row.absent}</td></tr>)}{!loading&&!(data?.trends.length)&&<tr><td colSpan={4}><div className="staff-attendance__empty"><strong>No attendance records</strong><span>Choose a different period or open the register.</span></div></td></tr>}</tbody></table></div>
   </div>
   <aside className="staff-attendance__side">
    <div className="staff-attendance__side-head"><h3>Today</h3><span>{latest?.date??today()}</span></div>
    <div className="staff-attendance__list">
     <div className="staff-attendance__list-item"><span>Present</span><strong>{latest?.present??0}</strong></div>
     <div className="staff-attendance__list-item"><span>Late</span><strong>{latest?.late??0}</strong></div>
     <div className="staff-attendance__list-item"><span>Absent</span><strong>{latest?.absent??0}</strong></div>
     <Link className="staff-attendance__list-item link" href="/school/attendance/exceptions"><span>Review attendance exceptions</span><span>→</span></Link>
     <Link className="staff-attendance__list-item link" href="/school/staff"><span>Open staff records</span><span>→</span></Link>
    </div>
   </aside>
  </section>
 </div>;
}
