"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Search, Plus, ArrowRight, X, Users, School, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { createClass, createHouse, assignHouse, autoBalanceHouses, type ActionResult } from "./actions";
import "./classes-houses-simple.css";

type ClassRow = { id:string; name:string; level:string|null; teacher:{id:string;name:string}|null; students:number; subjects:number; timetable:number };
type Teacher = { id:string; name:string; currentClass:string|null };
type House = { id:string; name:string; code:string; color:string|null; description:string|null; active:boolean; students:number };
type Learner = { id:string; name:string; admissionNo:string; className:string|null; classLevel:string|null; houseId:string|null; houseName:string|null };

export function ClassesHousesWorkspace({ classes, teachers, houses, learners, schoolName }: { classes:ClassRow[]; teachers:Teacher[]; houses:House[]; learners:Learner[]; schoolName:string }) {
  const [tab,setTab]=useState<"classes"|"houses">("classes");
  const [classOpen,setClassOpen]=useState(false);
  const [houseOpen,setHouseOpen]=useState(false);
  const [classStep,setClassStep]=useState<1|2>(1);
  const [q,setQ]=useState("");
  const [level,setLevel]=useState("all");
  const [message,setMessage]=useState<ActionResult|null>(null);
  const [pending,startTransition]=useTransition();
  const [selectedClass,setSelectedClass]=useState<ClassRow|null>(null);
  const [selectedHouse,setSelectedHouse]=useState<House|null>(null);
  const [houseLearnerQuery,setHouseLearnerQuery]=useState("");
  const [classForm,setClassForm]=useState({level:"",name:"",teacherId:""});
  const levels=[...new Set(classes.map(c=>c.level).filter(Boolean) as string[])];
  const filtered=classes.filter(c=>(level==="all"||c.level===level)&&(!q.trim()||`${c.name} ${c.level??""} ${c.teacher?.name??""}`.toLowerCase().includes(q.toLowerCase())));
  const assigned=learners.filter(l=>l.houseId).length;
  const selectedLearners=useMemo(()=>{
    if(!selectedHouse) return [];
    const query=houseLearnerQuery.trim().toLowerCase();
    return learners.filter(learner=>!query||`${learner.name} ${learner.admissionNo} ${learner.className??""} ${learner.houseName??""}`.toLowerCase().includes(query));
  },[houseLearnerQuery,learners,selectedHouse]);
  const resetClass=()=>{setClassStep(1);setClassForm({level:"",name:"",teacherId:""});};
  const continueClass=()=>{if(!classForm.level.trim()||!classForm.name.trim()){setMessage({ok:false,message:"Enter the grade level and class group name before continuing."});return;}setMessage(null);setClassStep(2);};
  const submitClass=()=>startTransition(async()=>{const r=await createClass(classForm);setMessage(r);if(r.ok){setClassOpen(false);resetClass();setTimeout(()=>window.location.reload(),500);}});
  const onHouseSubmit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);startTransition(async()=>{const r=await createHouse({name:String(form.get("name")??""),code:String(form.get("code")??""),color:String(form.get("color")??"#2563eb"),description:String(form.get("description")??"")});setMessage(r);if(r.ok){setHouseOpen(false);setTimeout(()=>window.location.reload(),500);}})};
  const onBalance=()=>startTransition(async()=>{const r=await autoBalanceHouses();setMessage(r);if(r.ok)setTimeout(()=>window.location.reload(),500);});
  const onAssign=(studentId:string,houseId:string)=>startTransition(async()=>{const r=await assignHouse({studentId,houseId});setMessage(r);if(r.ok)setTimeout(()=>window.location.reload(),400);});

  return <div className="classroom-page classroom-simple">
    <header className="classroom-hero">
      <div><div className="eyebrow">{schoolName} · Structure</div><h2>Classes & houses</h2></div>
      <div className="hero-stats"><div><strong>{classes.length}</strong><span>Classes</span></div><div><strong>{learners.length}</strong><span>Learners</span></div><div><strong>{teachers.length}</strong><span>Teachers</span></div><div><strong>{houses.length}</strong><span>Houses</span></div></div>
    </header>

    <div className="workspace-tabs" role="tablist"><button type="button" className={tab==="classes"?"active":""} onClick={()=>setTab("classes")}>Classes</button><button type="button" className={tab==="houses"?"active":""} onClick={()=>setTab("houses")}>Houses</button></div>
    {message&&<div className={`inline-result ${message.ok?"success":"error"}`} role="alert"><span>{message.message}</span><button type="button" onClick={()=>setMessage(null)} aria-label="Dismiss message"><X size={15} aria-hidden="true" /></button></div>}

    {tab==="classes"?<>
      <section className="control-bar"><div className="search-wrap"><Search size={15} aria-hidden="true" /><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search class or teacher" /></div><select value={level} onChange={e=>setLevel(e.target.value)} aria-label="Filter by grade"><option value="all">All grade levels</option>{levels.map(x=><option key={x}>{x}</option>)}</select><button className="primary" type="button" onClick={()=>{resetClass();setMessage(null);setClassOpen(true)}}><Plus size={15} aria-hidden="true" /> Create class</button></section>
      <section className="class-simple-panel">
        <div className="class-simple-head"><h3>Class directory</h3><span>{filtered.length} shown</span></div>
        {filtered.length?<div className="class-simple-list">{filtered.map(c=><div className="class-simple-row" key={c.id}>
          <span className="class-simple-name"><strong>{c.name}</strong><small>{c.level||"Grade not set"}</small></span>
          <span className="class-simple-teacher"><strong>{c.teacher?.name||"Teacher not assigned"}</strong><small>Class teacher</small></span>
          <span className="class-simple-count"><strong>{c.students}</strong> learners</span>
          <span className="class-simple-actions"><Link href={`/school/classes/${c.id}`}>Open</Link><button type="button" onClick={()=>setSelectedClass(c)}>•••</button></span>
        </div>)}</div>:<div className="empty-panel"><div className="empty-icon"><School size={20} aria-hidden="true" /></div><h4>No matching classes</h4><p>Adjust the search or create a new class.</p><button className="primary" type="button" onClick={()=>setClassOpen(true)}><Plus size={15} aria-hidden="true" /> Create class</button></div>}
      </section>
    </>:<>
      <section className="house-simple-head"><div><h3>House system</h3><p>Cross-class groups for activities, leadership and school identity.</p></div><div className="house-simple-actions"><span>{assigned} / {learners.length} learners assigned</span><button className="secondary" type="button" disabled={pending||!houses.length} onClick={onBalance}><Users size={15} aria-hidden="true" /> Auto-assign</button><button className="primary" type="button" onClick={()=>setHouseOpen(true)}><Plus size={15} aria-hidden="true" /> Add house</button></div></section>
      <section className="house-simple-grid">{houses.map(h=><article className="house-simple-card" key={h.id}><span className="house-simple-strip" style={{background:h.color||"var(--sn-primary)"}}/><div className="house-simple-title"><span className="house-simple-mark" style={{background:h.color||"var(--sn-primary)"}}>{h.code}</span><div><span>HOUSE</span><strong>{h.name}</strong></div><b>{h.students}</b></div><div className="house-simple-foot"><span>{h.active?"Active":"Inactive"} · {h.students} learners</span><div><Link href={`/school/houses/${h.id}`}>Open</Link><button type="button" onClick={()=>{setSelectedHouse(h);setHouseLearnerQuery("")}}>Assign</button></div></div></article>)}{houses.length===0&&<div className="empty-panel"><div className="empty-icon"><Users size={20} aria-hidden="true" /></div><h4>No houses yet</h4><p>Create the first house, then distribute learners.</p><button className="primary" type="button" onClick={()=>setHouseOpen(true)}><Plus size={15} aria-hidden="true" /> Create house</button></div>}</section>
    </>}

    <Dialog open={Boolean(selectedClass)} onClose={()=>setSelectedClass(null)} title={selectedClass?.name??"Class tools"} description={selectedClass ? `${selectedClass.level??"Grade not set"} · ${selectedClass.teacher?.name??"No class teacher"}` : undefined} size="sm">
      {selectedClass?<div className="class-tools-dialog"><div className="class-tools-summary"><div><span>Learners</span><strong>{selectedClass.students}</strong></div><div><span>Subjects</span><strong>{selectedClass.subjects}</strong></div><div><span>Timetable</span><strong>{selectedClass.timetable}</strong></div></div><div className="class-tools-links"><Link href={`/school/classes/${selectedClass.id}`}>Open class workspace →</Link><Link href={`/school/students?classId=${selectedClass.id}`}>View learners →</Link><Link href={`/school/attendance/register?classId=${encodeURIComponent(selectedClass.id)}`}>Take attendance →</Link><Link href="/school/gradebook">Open gradebook →</Link><Link href="/school/timetable">Open timetable →</Link></div></div>:null}
    </Dialog>

    <Dialog open={Boolean(selectedHouse)} onClose={()=>setSelectedHouse(null)} title={selectedHouse ? `Assign learners · ${selectedHouse.name}` : "Assign learners"} description="Search for a learner, then assign them to this house." size="md">
      {selectedHouse?<div className="house-assign-dialog"><input className="house-assign-search" value={houseLearnerQuery} onChange={event=>setHouseLearnerQuery(event.target.value)} placeholder="Search learner, index or class" /><div className="house-assign-list">{selectedLearners.slice(0,100).map(learner=><div className="house-assign-row" key={learner.id}><div><strong>{learner.name}</strong><small>{learner.admissionNo} · {learner.className||"No class"}{learner.houseName?` · ${learner.houseName}`:""}</small></div><button type="button" disabled={pending||learner.houseId===selectedHouse.id} onClick={()=>onAssign(learner.id,selectedHouse.id)}>{learner.houseId===selectedHouse.id?<><CheckCircle2 size={12} aria-hidden="true" /> Assigned</>:"Assign"}</button></div>)}{selectedLearners.length===0?<div className="empty-panel"><strong>No learners match this search.</strong></div>:null}</div></div>:null}
    </Dialog>

    {classOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setClassOpen(false)}><section className="wizard" role="dialog" aria-modal="true"><div className="modal-head"><div><span>CLASS SETUP · STEP {classStep} OF 2</span><h3>{classStep===1?"Class identity":"Class teacher"}</h3><p>{classStep===1?"Start with the academic grade and group name.":"Assign one eligible teacher to lead this class."}</p></div><button type="button" onClick={()=>setClassOpen(false)} aria-label="Close"><X size={16} aria-hidden="true" /></button></div><div className="wizard-steps"><span className={classStep===1?"current":"done"}>1 · Class identity</span><span className={classStep===2?"current":""}>2 · Teacher</span></div>{classStep===1?<div className="form-grid"><label>Grade level<input value={classForm.level} onChange={e=>setClassForm(v=>({...v,level:e.target.value}))} placeholder="e.g. Primary 4" autoFocus /></label><label>Class group name<input value={classForm.name} onChange={e=>setClassForm(v=>({...v,name:e.target.value}))} placeholder="e.g. Gold" /></label><div className="next-note wide">Nothing is created on this step.</div></div>:<div className="form-grid"><label className="wide">Class teacher<select value={classForm.teacherId} onChange={e=>setClassForm(v=>({...v,teacherId:e.target.value}))}><option value="">Create class without a teacher</option>{teachers.map(t=><option key={t.id} value={t.id} disabled={Boolean(t.currentClass)}>{t.name}{t.currentClass?` · already leads ${t.currentClass}`:""}</option>)}</select></label><div className="teacher-note wide">Only active teaching staff are shown. A teacher already leading another class is disabled.</div></div>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>classStep===1?setClassOpen(false):setClassStep(1)}>{classStep===1?"Cancel":"Back"}</button>{classStep===1?<button type="button" className="primary" onClick={continueClass}>Continue <ArrowRight size={14} aria-hidden="true" /></button>:<button type="button" className="primary" disabled={pending} onClick={submitClass}>{pending?"Creating…":"Create class"}</button>}</div></section></div>}

    {houseOpen&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setHouseOpen(false)}><form className="wizard" onSubmit={onHouseSubmit}><div className="modal-head"><div><span>HOUSE SETUP</span><h3>Create a house</h3><p>Set the house identity used across activities and learner groups.</p></div><button type="button" onClick={()=>setHouseOpen(false)} aria-label="Close"><X size={16} aria-hidden="true" /></button></div><div className="form-grid"><label>House name<input name="name" required placeholder="e.g. Eagles" /></label><label>House code<input name="code" required maxLength={8} placeholder="EAG" /></label><label>Colour<input name="color" type="color" defaultValue="#2563eb" /></label><label className="wide">Description<textarea name="description" rows={3} placeholder="Optional description" /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setHouseOpen(false)}>Cancel</button><button className="primary" disabled={pending}>{pending?"Creating…":"Create house"}</button></div></form></div>}
  </div>;
}
