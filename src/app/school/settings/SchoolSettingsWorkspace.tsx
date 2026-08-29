"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Settings = { expectedResumptionTime:string; attendanceGraceMinutes:number; timezone:string; gradeCaWeight:number|string; gradeExamWeight:number|string; allowPartialReportCards:boolean; smsSenderId?:string|null };
type Term = { id:string; name:string; startDate:string; endDate:string; status:"upcoming"|"current"|"completed"; academicYear:{id:string;name:string;startDate:string;endDate:string} };
type Data = { school:{id:string;name:string;uniqueCode:string;status:string}; settings:Settings|null; academicYears:{id:string;name:string;startDate:string;endDate:string}[]; terms:Term[] };

const emptySettings:Settings={expectedResumptionTime:"07:30",attendanceGraceMinutes:15,timezone:"Africa/Accra",gradeCaWeight:40,gradeExamWeight:60,allowPartialReportCards:false,smsSenderId:""};
const iso=(value:string)=>new Date(value).toISOString().slice(0,10);

export default function SchoolSettingsWorkspace({initial,dataSession}:{initial:Data;dataSession:{name:string}}){
 const [data,setData]=useState(initial); const [tab,setTab]=useState<"general"|"academic"|"terms">("general"); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 const [school,setSchool]=useState(initial.school); const [settings,setSettings]=useState<Settings>(initial.settings??emptySettings);
 const [year,setYear]=useState({name:"",startDate:"",endDate:""}); const [term,setTerm]=useState({yearName:"",name:"",startDate:"",endDate:""});
 const current=useMemo(()=>data.terms.find(t=>t.status==="current")??data.terms.find(t=>t.status==="upcoming")??data.terms[0], [data.terms]);
 useEffect(()=>{if(!term.yearName&&current)setTerm(v=>({...v,yearName:current.academicYear.name}));},[current,term.yearName]);
 async function saveGeneral(){setBusy(true);setMessage("");try{const r=await fetch("/api/school/settings",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({school,settings})});const j=await r.json();if(!r.ok)throw new Error(j.error??"Unable to save settings");setMessage("Settings saved");}catch(e){setMessage(e instanceof Error?e.message:"Unable to save settings");}finally{setBusy(false);}}
 async function createTerm(){setBusy(true);setMessage("");try{const chosenYear=data.academicYears.find(y=>y.name===term.yearName);const yearPayload=chosenYear?{name:chosenYear.name,startDate:chosenYear.startDate,endDate:chosenYear.endDate}:{name:term.yearName,startDate:year.startDate,endDate:year.endDate};if(!yearPayload.name||!yearPayload.startDate||!yearPayload.endDate)throw new Error("Choose an existing academic year or enter its dates first.");const r=await fetch("/api/school/terms",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({academicYearName:yearPayload.name,academicYearStart:yearPayload.startDate,academicYearEnd:yearPayload.endDate,name:term.name,startDate:term.startDate,endDate:term.endDate})});const j=await r.json();if(!r.ok)throw new Error(j.error??"Unable to create term");setData(d=>({...d,academicYears:d.academicYears.some(y=>y.id===j.year.id)?d.academicYears:d.academicYears.concat(j.year),terms:[j.term,...d.terms].map((t: Term)=>({...t,status:new Date()<new Date(t.startDate)?"upcoming":new Date()>new Date(t.endDate)?"completed":"current"}))}));setTerm(t=>({...t,name:"",startDate:"",endDate:""}));setMessage("Term created. It will become current automatically on its start date and remain in history after it ends.");}catch(e){setMessage(e instanceof Error?e.message:"Unable to create term");}finally{setBusy(false);}}
 return <div className="settings-workspace">
   <div className="settings-hero">
    <div><span className="eyebrow">School control centre</span><h2>Make the workspace work for your school.</h2><p>{dataSession.name}, configure the school once, then let the dates and term context drive academics, attendance, finance and reporting.</p></div>
    <div className="settings-hero-actions"><Link href="/school/terms" className="button secondary">Open Terms & Calendar</Link><button className="button primary" onClick={saveGeneral} disabled={busy}>{busy?"Saving…":"Save changes"}</button></div>
   </div>
   <div className="settings-tabs">{([['general','General & identity'],['academic','Academic rules'],['terms','Academic years & terms']] as const).map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</div>
   {message&&<div className="settings-message">{message}</div>}
   {tab==="general"&&<section className="settings-grid">
     <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">School identity</span><h3>The details people should actually use</h3></div><span className="status-pill good">{school.status}</span></div>
       <label>School name<input value={school.name} onChange={e=>setSchool({...school,name:e.target.value})}/></label>
       <label>School code<input value={school.uniqueCode} onChange={e=>setSchool({...school,uniqueCode:e.target.value.toUpperCase()})}/><small>This is the doorway code used before staff or guardian sign-in.</small></label>
       <div className="inline-note"><b>Access model</b><span>School-scoped sessions keep staff inside this school workspace. Roles and permissions remain the authority for what each user can change.</span></div>
     </div>
     <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Daily operating rules</span><h3>Default school behaviour</h3></div></div>
       <label>Timezone<select value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})}><option>Africa/Accra</option><option>Africa/Lagos</option><option>Africa/Nairobi</option><option>UTC</option></select></label>
       <label>Expected resumption time<input type="time" value={settings.expectedResumptionTime} onChange={e=>setSettings({...settings,expectedResumptionTime:e.target.value})}/></label>
       <label>Attendance grace period (minutes)<input type="number" min="0" max="180" value={settings.attendanceGraceMinutes} onChange={e=>setSettings({...settings,attendanceGraceMinutes:Number(e.target.value)})}/></label>
       <label>SMS sender ID<input value={settings.smsSenderId??""} onChange={e=>setSettings({...settings,smsSenderId:e.target.value})}/></label>
     </div>
   </section>}
   {tab==="academic"&&<section className="settings-grid">
     <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Assessment engine</span><h3>How a term result is calculated</h3></div><span className="metric-badge">{Number(settings.gradeCaWeight)+Number(settings.gradeExamWeight)}%</span></div>
       <div className="weight-row"><label>Continuous assessment<input type="number" min="0" max="100" value={settings.gradeCaWeight} onChange={e=>setSettings({...settings,gradeCaWeight:Number(e.target.value)})}/></label><label>Exam<input type="number" min="0" max="100" value={settings.gradeExamWeight} onChange={e=>setSettings({...settings,gradeExamWeight:Number(e.target.value)})}/></label></div>
       <div className="progress-track"><span style={{width:`${Math.min(Math.max(Number(settings.gradeCaWeight),0),100)}%`}}/></div>
       <div className="inline-note"><b>Rule</b><span>Weights must total 100%. Term-specific assessments, score history and report cards remain connected to the term they belong to.</span></div>
     </div>
     <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Report cards</span><h3>Publication safeguards</h3></div></div>
       <label className="toggle"><input type="checkbox" checked={settings.allowPartialReportCards} onChange={e=>setSettings({...settings,allowPartialReportCards:e.target.checked})}/><span><b>Allow partial report cards</b><small>Permit reports when some eligible results are still missing.</small></span></label>
       <div className="action-list"><Link href="/school/academics/setup">Open academic setup <span>→</span></Link><Link href="/school/gradebook">Open gradebook <span>→</span></Link><Link href="/school/report-cards">Open report cards <span>→</span></Link></div>
     </div>
   </section>}
   {tab==="terms"&&<section className="terms-layout">
     <div className="settings-card term-create"><div className="card-heading"><div><span className="eyebrow">Academic control</span><h3>Create a year and its term timeline</h3><p>Never “finish” a term by deleting it. Its dates determine whether it is upcoming, current or completed.</p></div></div>
       <label>Academic year<select value={term.yearName} onChange={e=>setTerm({...term,yearName:e.target.value})}><option value="">Choose or use new year below</option>{data.academicYears.map(y=><option key={y.id} value={y.name}>{y.name} · {iso(y.startDate)} → {iso(y.endDate)}</option>)}</select></label>
       <div className="year-builder"><label>New year name<input value={year.name} onChange={e=>{setYear({...year,name:e.target.value});setTerm({...term,yearName:e.target.value})}} placeholder="2026 / 2027"/></label><label>Year starts<input type="date" value={year.startDate} onChange={e=>setYear({...year,startDate:e.target.value})}/></label><label>Year ends<input type="date" value={year.endDate} onChange={e=>setYear({...year,endDate:e.target.value})}/></label></div>
       <div className="year-builder"><label>Term name<input value={term.name} onChange={e=>setTerm({...term,name:e.target.value})} placeholder="First Term"/></label><label>Term starts<input type="date" value={term.startDate} onChange={e=>setTerm({...term,startDate:e.target.value})}/></label><label>Term ends<input type="date" value={term.endDate} onChange={e=>setTerm({...term,endDate:e.target.value})}/></label></div>
       <button className="button primary" onClick={createTerm} disabled={busy}>{busy?"Creating…":"Create term"}</button>
     </div>
     <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Live academic timeline</span><h3>{current?current.name:"No term yet"}</h3></div></div>
       <div className="term-strip">{data.terms.slice(0,4).map(t=><div className={`term-item ${t.status}`} key={t.id}><span className="term-dot"/><div><b>{t.name}</b><small>{t.academicYear.name}</small><small>{iso(t.startDate)} → {iso(t.endDate)}</small></div><span className="status-pill">{t.status}</span></div>)}</div>
       <div className="inline-note"><b>Automatic term intelligence</b><span>On every visit SukuuNova evaluates today against the term dates. Completed terms remain queryable and reportable forever, while the next dated term naturally becomes current.</span></div>
       <Link className="button secondary full" href="/school/terms">View term summaries & history</Link>
     </div>
   </section>}
 </div>;
}
