"use client";
import Link from "next/link";
import { parseMarkSheetPaste, type MarkStatus } from "@/lib/mark-sheet-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, Check, ChevronRight, ClipboardList, FilePlus2, GraduationCap, ImagePlus, Layers3, Save, Sparkles, UsersRound } from "lucide-react";

type Assignment = { classId:string; subjectId:string; class:{id:string;name:string;level:string|null}; subject:{id:string;name:string} };
type Term = { id:string; name:string; isLocked:boolean };
type Contexts = { assignments:Assignment[]; terms:Term[] };
type Student = { id:string; name:string; admissionNo:string };
type Work = { id:string; assessmentId:string|null; title:string; kind:string; workDate:string; weekNumber:number; workNumber:number; maxScore:number|string; markingMode:string; status:string; dueAt:string|null; attemptLimit:number; attemptScorePolicy:"highest"|"latest" };
type Note = { id:string; title:string; weekNumber:number|null; status:string; publishedAt:string|null; content:unknown };
type Roster = { students:Student[]; works:Work[]; assessments:Array<{id:string;name:string;type:string;maxScore:number|string;weight:number|string;scores:Array<{id:string;studentId:string;value:number|string;status:MarkStatus;enteredAt:string}>}>; notes:Note[] };
type DraftQuestion={type:string;prompt:string;points:number;options:string;answers:string};

const today = new Date().toISOString().slice(0,10);
const QUESTION_TYPES=[
  ["multiple_choice","Multiple choice"],["multiple_select","Multiple select"],["true_false","True / false"],["short_answer","Short answer"],
  ["fill_blank","Fill in the blank"],["numeric","Numeric"],["ordering","Ordering"],["long_answer","Written answer"]
] as const;
function usesOptions(type:string){return ["multiple_choice","multiple_select","ordering"].includes(type);}
function defaultOptions(type:string){return type==="ordering"?"First item\nSecond item\nThird item":"A\nB\nC\nD";}
function answerPlaceholder(type:string){
  if(type==="multiple_choice")return"Correct choice (exactly one)";
  if(type==="multiple_select")return"Correct choices, one per line";
  if(type==="true_false")return"true or false";
  if(type==="numeric")return"Accepted number(s), one per line";
  if(type==="fill_blank")return"Accepted blank answer(s), one per line";
  if(type==="ordering")return"Correct order, one item per line";
  return"Accepted answers, one per line";
}
async function api(url:string, init?:RequestInit){ const r=await fetch(url,init); const data=await r.json(); if(!r.ok) throw new Error(data?.message??data?.error??"Request failed"); return data; }

export default function TeacherAcademicWorkspace(){
  const requestId = useRef(0);
  const operation = useRef(false);
  const markInputs = useRef<Array<HTMLInputElement|null>>([]);
  const [statuses,setStatuses]=useState<Record<string,MarkStatus>>({});
  const [saving,setSaving]=useState(false);
  const [contexts,setContexts]=useState<Contexts>({assignments:[],terms:[]});
  const [classId,setClassId]=useState(""); const [subjectId,setSubjectId]=useState(""); const [termId,setTermId]=useState("");
  const [roster,setRoster]=useState<Roster|null>(null); const [loading,setLoading]=useState(false); const [notice,setNotice]=useState(""); const [error,setError]=useState("");
  const [work,setWork]=useState({kind:"Homework",title:"",instructions:"",workDate:today,weekNumber:1,workNumber:1,maxScore:10,markingMode:"manual",attemptLimit:1,attemptScorePolicy:"highest" as "highest"|"latest",dueAt:""});
  const [questionList,setQuestionList]=useState<DraftQuestion[]>([]);
  const [markWorkId,setMarkWorkId]=useState(""); const [marks,setMarks]=useState<Record<string,string>>({}); const [dirtyMarks,setDirtyMarks]=useState<Record<string,boolean>>({});
  const [note,setNote]=useState({title:"",body:"",weekNumber:1,imageUrl:""});

  useEffect(()=>{ void api("/api/school/teacher-academic-workspace").then((d)=>{ setContexts(d); if(d.terms[0]) setTermId(d.terms[0].id); const a=d.assignments[0]; if(a){setClassId(a.classId);setSubjectId(a.subjectId);} }).catch(e=>setError(e.message)); },[]);
  const assignmentsForClass=useMemo(()=>contexts.assignments.filter(a=>!classId||a.classId===classId),[contexts.assignments,classId]);
  const selectedAssignment=useMemo(()=>contexts.assignments.find(a=>a.classId===classId&&a.subjectId===subjectId),[contexts.assignments,classId,subjectId]);
  const classes=useMemo(()=>Array.from(new Map(contexts.assignments.map(a=>[a.classId,a.class])).values()),[contexts.assignments]);
  const load=async()=>{
    if(!classId||!subjectId||!termId) return;
    const version=++requestId.current;
    setLoading(true);setError("");
    try{
      const d=await api(`/api/school/teacher-academic-workspace?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}&termId=${encodeURIComponent(termId)}`);
      if(version!==requestId.current)return;
      setRoster(d);setMarkWorkId(current=>d.works.some((item:Work)=>item.id===current)?current:(d.works[0]?.id??""));
    }catch(e){if(version===requestId.current)setError(e instanceof Error?e.message:"Could not load workspace");}
    finally{if(version===requestId.current)setLoading(false);}
  };
  useEffect(()=>{setRoster(null);setMarkWorkId("");setMarks({});if(classId&&subjectId&&termId)void load();return()=>{requestId.current+=1;};},[classId,subjectId,termId]);
  const selectedWork=roster?.works.find(item=>item.id===markWorkId);
  const locked=contexts.terms.find(term=>term.id===termId)?.isLocked??false;
  useEffect(()=>{
    const assessment=roster?.assessments.find(item=>item.id===selectedWork?.assessmentId);
    setDirtyMarks({});
    setStatuses(Object.fromEntries((assessment?.scores??[]).map(score=>[score.studentId,score.status])));
    setMarks(Object.fromEntries((assessment?.scores??[]).map(score=>[score.studentId,String(score.value)])));
  },[roster,markWorkId]);
  const dirtyCount=Object.values(dirtyMarks).filter(Boolean).length;
  const recorded=(roster?.students??[]).filter(student=>(marks[student.id]??"").trim()!=="").length;
  const discardMarks=()=>!dirtyCount||window.confirm("Discard unsaved mark changes and load the selected sheet?");
  useEffect(()=>{
    if(!dirtyCount)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirtyCount]);
  const updateMark=(studentId:string,value:string,status=statuses[studentId]??"present")=>{
    setMarks(current=>({...current,[studentId]:value}));
    setStatuses(current=>({...current,[studentId]:status}));
    setDirtyMarks(current=>({...current,[studentId]:true}));setNotice("");
  };
  const pasteMarks=(text:string,startRow:number)=>{
    try{
      const students=roster?.students??[];
      const changes=parseMarkSheetPaste(text,startRow,students.length,Number(selectedWork?.maxScore??0));
      setMarks(current=>({...current,...Object.fromEntries(changes.map(change=>[students[change.row].id,change.value]))}));
      setStatuses(current=>({...current,...Object.fromEntries(changes.map(change=>[students[change.row].id,change.status]))}));
      setDirtyMarks(current=>({...current,...Object.fromEntries(changes.map(change=>[students[change.row].id,true]))}));
      setError("");setNotice(changes.length+" pasted marks ready to save. Review the learner rows before saving.");
    }catch(error){setError(error instanceof Error?error.message:"Could not paste marks.");}
  };
  const run=async(action:()=>Promise<void>)=>{
    if(operation.current)return;
    if(action!==saveMarks&&!discardMarks())return;
    operation.current=true;setSaving(true);setNotice("");setError("");
    try{await action();}finally{operation.current=false;setSaving(false);}
  };
  const publishNote=async(noteId:string)=>{try{await api("/api/school/teacher-academic-workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"publishNote",noteId})});setNotice("Note published to linked families.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not publish note");}};

  const createWork=async()=>{ setNotice("");setError(""); try{ await api("/api/school/teacher-academic-workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"createWork",termId,classId,subjectId,...work,dueAt:work.dueAt?new Date(work.dueAt).toISOString():null,questionList:questionList.map(q=>({type:q.type,prompt:q.prompt,points:q.points,options:q.options.split("\n").map(value=>value.trim()).filter(Boolean),acceptedAnswers:q.answers.split("\n").map(value=>value.trim()).filter(Boolean)}))})}); setNotice("Work saved to your class timeline."); setWork(v=>({...v,title:""}));setQuestionList([]);await load(); }catch(e){setError(e instanceof Error?e.message:"Could not create work");} };
  const publishWork=async()=>{if(!markWorkId)return;try{await api("/api/school/teacher-academic-workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"publishWork",workId:markWorkId})});setNotice("Published to the guardian/student portal flow.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not publish work");}};
  const saveMarks=async()=>{
    if(!markWorkId)return;setError("");
    try{
      const existing=new Map((roster?.assessments.find(item=>item.id===selectedWork?.assessmentId)?.scores??[]).map(score=>[score.studentId,score]));
      const payload=(roster?.students??[]).filter(student=>dirtyMarks[student.id]&&(marks[student.id]??"").trim()!=="").map(student=>{
        const before=existing.get(student.id);
        return {studentId:student.id,value:Number(marks[student.id]),status:statuses[student.id]??"present",expected:before?{id:before.id,value:Number(before.value),status:before.status,enteredAt:before.enteredAt}:null};
      });
      if(!payload.length)throw new Error("Change at least one mark. Blank cells are left untouched.");
      const maximum=Number(selectedWork?.maxScore??0);
      if(payload.some(mark=>!Number.isFinite(mark.value)||mark.value<0||mark.value>maximum))throw new Error("Every mark must be between 0 and "+maximum+".");
      if(payload.some(mark=>mark.status!=="present"&&mark.value!==0))throw new Error("Absent or excused learners must have a stored mark of zero.");
      const d=await api("/api/school/teacher-academic-workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"saveMarks",workId:markWorkId,marks:payload})});
      setDirtyMarks({});setNotice(d.result.saved+" marks saved to the gradebook. Server confirmed.");await load();
    }catch(error){setError(error instanceof Error?error.message:"Could not save marks");}
  };
  const createNote=async()=>{try{await api("/api/school/teacher-academic-workspace",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"createNote",termId,classId,subjectId,title:note.title,weekNumber:note.weekNumber,content:{blocks:[{type:"paragraph",text:note.body},{type:"image",url:note.imageUrl||null}]}})});setNotice("Note saved. You can publish it to the guardian portal when ready.");setNote(v=>({...v,title:"",body:"",imageUrl:""}));await load();}catch(e){setError(e instanceof Error?e.message:"Could not save note");}};

  return <div className="taw-page">
    <section className="taw-hero"><div><span className="taw-kicker">TEACHER ACADEMIC STUDIO</span><h1>Teach, assess, record — without fighting a spreadsheet.</h1><p>One place for your assigned classes, weekly work, fast marks, smart activities and notes.</p></div><div className="taw-hero-stat"><Sparkles size={18}/><b>{contexts.assignments.length}</b><span>assigned class · subject links</span></div></section>
    {(error||notice)&&<div role={error?"alert":"status"} className={`taw-alert ${error?"bad":"good"}`}>{error||notice}</div>}
    <section className="taw-context"><div className="taw-section-head"><div><span>01 · WORKING CONTEXT</span><h2>Pick the room you are teaching in</h2></div><div className="taw-context-chip"><UsersRound size={15}/> teacher scope enforced</div></div><div className="taw-select-grid"><label>Class<select disabled={saving} value={classId} onChange={e=>{if(!discardMarks())return;setClassId(e.target.value);const a=contexts.assignments.find(x=>x.classId===e.target.value);setSubjectId(a?.subjectId??"")}}>{classes.map(c=><option key={c.id} value={c.id}>{c.level?`${c.level} · `:""}{c.name}</option>)}</select></label><label>Subject<select disabled={saving} value={subjectId} onChange={e=>{if(discardMarks())setSubjectId(e.target.value);}}>{assignmentsForClass.map(a=><option key={`${a.classId}-${a.subjectId}`} value={a.subjectId}>{a.subject.name}</option>)}</select></label><label>Term<select disabled={saving} value={termId} onChange={e=>{if(discardMarks())setTermId(e.target.value);}}>{contexts.terms.map(t=><option key={t.id} value={t.id}>{t.name}{t.isLocked?" · locked":""}</option>)}</select></label><button className="taw-btn primary" disabled={saving||loading} onClick={()=>{if(discardMarks())void load();}}>{loading?"Loading…":"Open class"}<ChevronRight size={15}/></button></div>{selectedAssignment&&<div className="taw-context-banner"><GraduationCap size={18}/><b>{selectedAssignment.subject.name}</b><span>for</span><b>{selectedAssignment.class.name}</b><span>· {roster?.students.length??0} active learners</span></div>}</section>

    <div className="taw-main-grid">
      <section className="taw-card"><div className="taw-section-head"><div><span>02 · FAST MARKING</span><h2>Weekly mark sheet</h2></div><Layers3 size={19}/></div><p className="taw-help">Paste a mark column from Excel or Sheets, with an optional status column. A = Absent, E = Excused. Enter or ↑/↓ moves between learners; Tab moves to status. Blank clipboard rows leave marks unchanged.</p><div className="taw-inline-row"><label>Work<select disabled={saving||loading} value={markWorkId} onChange={e=>{if(discardMarks())setMarkWorkId(e.target.value);}}>{(roster?.works??[]).map(w=><option key={w.id} value={w.id}>{w.title} · W{w.weekNumber} · #{w.workNumber}{w.attemptLimit>1?` · ${w.attemptLimit} attempts`:""}</option>)}</select></label><button className="taw-btn ghost" onClick={()=>void run(publishWork)} disabled={!markWorkId||saving||loading||locked||selectedWork?.status==="published"}>Publish</button></div>{selectedWork?.status==="published"&&<Link className="taw-btn ghost" onClick={event=>{if(!discardMarks())event.preventDefault();}} href={`/school/teacher-academic/review?workId=${encodeURIComponent(selectedWork.id)}`}>Review learner submissions</Link>}<p className="taw-help" role="status">{recorded} / {roster?.students.length??0} learners recorded · {dirtyCount} changed rows{selectedWork?.attemptLimit>1?` · report keeps ${selectedWork.attemptScorePolicy} attempt`:""}{saving?" · Saving…":""}</p>
      <div className="taw-table-wrap"><table aria-label="Weekly learner marks"><thead><tr><th>Student</th><th>Mark</th><th>Status</th><th>Out of</th></tr></thead><tbody>{(roster?.students??[]).map((student,index)=><tr key={student.id}><td><b>{student.name}</b><small>{student.admissionNo}</small></td><td><input ref={element=>{markInputs.current[index]=element;}} aria-label={`Mark for ${student.name}`} disabled={saving||loading||locked} inputMode="decimal" value={marks[student.id]??""} placeholder="—" onChange={event=>updateMark(student.id,event.target.value)} onPaste={event=>{event.preventDefault();pasteMarks(event.clipboardData.getData("text"),index);}} onKeyDown={event=>{
        if(["Enter","ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();const next=index+(event.key==="ArrowUp"||(event.key==="Enter"&&event.shiftKey)?-1:1);markInputs.current[next]?.focus();markInputs.current[next]?.select();}
      }}/></td><td><select aria-label={`Status for ${student.name}`} disabled={saving||loading||locked} value={statuses[student.id]??"present"} onChange={event=>{const status=event.target.value as MarkStatus;updateMark(student.id,status==="present"?(marks[student.id]??""):"0",status);}}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td><td>{Number(selectedWork?.maxScore??0)}</td></tr>)}</tbody></table></div><button className="taw-btn primary wide" disabled={!markWorkId||saving||loading||locked||!dirtyCount} onClick={()=>void run(saveMarks)}><Save size={15}/> Save entered marks</button></section>

      <section className="taw-card"><div className="taw-section-head"><div><span>03 · CREATE A WORK</span><h2>Make classwork feel like an activity</h2></div><ClipboardList size={19}/></div><div className="taw-form-grid"><label>Type<select value={work.kind} onChange={e=>setWork(v=>({...v,kind:e.target.value}))}>{["Classwork","Homework","Exercise","Participation","Quiz","Exam"].map(x=><option key={x}>{x}</option>)}</select></label><label>Week<input type="number" min={1} max={60} value={work.weekNumber} onChange={e=>setWork(v=>({...v,weekNumber:Number(e.target.value)}))}/></label><label>Work number<input type="number" min={1} max={50} value={work.workNumber} onChange={e=>setWork(v=>({...v,workNumber:Number(e.target.value)}))}/></label><label>Date<input type="date" value={work.workDate} onChange={e=>setWork(v=>({...v,workDate:e.target.value}))}/></label><label className="span2">Title<input placeholder="e.g. Fractions practice — Work 2" value={work.title} onChange={e=>setWork(v=>({...v,title:e.target.value}))}/></label><label>Max mark<input type="number" min={1} value={work.maxScore} onChange={e=>setWork(v=>({...v,maxScore:Number(e.target.value)}))}/></label><label>Marking<select value={work.markingMode} onChange={e=>setWork(v=>({...v,markingMode:e.target.value}))}><option value="manual">I review marks</option><option value="auto">Auto-mark objective answers</option><option value="review">System suggests, I confirm</option></select></label><label>Attempts<input type="number" min={1} max={10} value={work.attemptLimit} onChange={e=>setWork(v=>({...v,attemptLimit:Number(e.target.value)}))}/></label><label>Report score<select disabled={work.attemptLimit<=1} value={work.attemptScorePolicy} onChange={e=>setWork(v=>({...v,attemptScorePolicy:e.target.value as "highest"|"latest"}))}><option value="highest">Highest graded attempt</option><option value="latest">Latest graded attempt</option></select></label><label>Close submissions<input type="datetime-local" value={work.dueAt} onChange={e=>setWork(v=>({...v,dueAt:e.target.value}))}/></label><label className="span2">Instructions<textarea rows={3} placeholder="What should learners do?" value={work.instructions} onChange={e=>setWork(v=>({...v,instructions:e.target.value}))}/></label></div>{work.attemptLimit>1&&<p className="taw-help">Learners may retry only after the previous attempt is graded. Every completed attempt is preserved; the gradebook follows the selected report-score policy.</p>}<div className="taw-questions"><div className="taw-subhead"><b>Question builder</b><span>{questionList.reduce((sum,q)=>sum+q.points,0)} / {work.maxScore} marks allocated</span><button className="taw-btn ghost" onClick={()=>setQuestionList(v=>[...v,{type:"multiple_choice",prompt:"",points:1,options:defaultOptions("multiple_choice"),answers:""}])}><FilePlus2 size={15}/> Add question</button></div><p className="taw-help">Objective activities support multiple choice, multiple select, true/false, numeric, fill-in-the-blank and ordering. For fill-in-the-blank prompts, include <b>___</b> where the learner should answer.</p>{questionList.map((q,i)=><div className="taw-question" key={i}><div className="taw-qnum">{i+1}<button type="button" aria-label={`Remove question ${i+1}`} onClick={()=>setQuestionList(v=>v.filter((_,index)=>index!==i))}>×</button></div><div className="taw-qbody"><input placeholder={q.type==="fill_blank"?"Question prompt with ___ for the blank":"Question prompt"} value={q.prompt} onChange={e=>setQuestionList(v=>v.map((x,j)=>j===i?{...x,prompt:e.target.value}:x))}/><div className="taw-qgrid"><select aria-label={`Question ${i+1} type`} value={q.type} onChange={e=>{const next=e.target.value;setQuestionList(v=>v.map((x,j)=>{if(j!==i)return x;return{...x,type:next,options:usesOptions(next)?(x.options.trim()?x.options:defaultOptions(next)):"",answers:next==="long_answer"||next==="true_false"?"":x.answers};}));}}>{QUESTION_TYPES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input type="number" min={1} value={q.points} onChange={e=>setQuestionList(v=>v.map((x,j)=>j===i?{...x,points:Number(e.target.value)}:x))}/>{usesOptions(q.type)?<textarea placeholder={q.type==="ordering"?"Items to order, one per line":"Options, one per line"} value={q.options} onChange={e=>setQuestionList(v=>v.map((x,j)=>j===i?{...x,options:e.target.value}:x))}/>:<div className="taw-help">{q.type==="true_false"?"Learners choose true or false.":q.type==="numeric"?"Learners enter a number.":q.type==="fill_blank"?"Learners type the missing text.":q.type==="long_answer"?"Teacher review is required.":"Learners type an answer."}</div>}{q.type!=="long_answer"?<textarea placeholder={answerPlaceholder(q.type)} value={q.answers} onChange={e=>setQuestionList(v=>v.map((x,j)=>j===i?{...x,answers:e.target.value}:x))}/>:<div className="taw-help">Written answers are reviewed by the teacher.</div>}</div></div></div>)}</div><button className="taw-btn primary wide" disabled={saving||loading||locked||!classId||!subjectId||!termId} onClick={()=>void run(createWork)}><Check size={15}/> Save work structure</button></section>
    </div>

    <section className="taw-card"><div className="taw-section-head"><div><span>04 · CLASS NOTES</span><h2>Replace loose sheets with a living subject notebook</h2></div><BookOpenCheck size={19}/></div><div className="taw-note-grid"><div><label>Title<input placeholder="Lesson note title" value={note.title} onChange={e=>setNote(v=>({...v,title:e.target.value}))}/></label><label>Week<input type="number" min={1} max={60} value={note.weekNumber} onChange={e=>setNote(v=>({...v,weekNumber:Number(e.target.value)}))}/></label><label>Body<textarea rows={8} placeholder="Write the lesson in clear sections…" value={note.body} onChange={e=>setNote(v=>({...v,body:e.target.value}))}/></label><label>Illustration URL<input placeholder="Optional image URL" value={note.imageUrl} onChange={e=>setNote(v=>({...v,imageUrl:e.target.value}))}/></label><button className="taw-btn primary" disabled={saving||loading||locked||!classId||!subjectId||!termId} onClick={()=>void run(createNote)}><Save size={15}/> Save note</button></div><div className="taw-note-preview"><div className="taw-preview-chrome"><span>Preview</span><ImagePlus size={15}/></div><article><span className="taw-note-tag">{selectedAssignment?.subject.name??"Subject"}</span><h3>{note.title||"Your lesson title"}</h3><p>{note.body||"Write a clear, learner-friendly note. The guardian will see the published version inside the selected child’s subject space."}</p>{note.imageUrl?<img src={note.imageUrl} alt="Note illustration preview"/>:<div className="taw-image-placeholder">Add an illustration to make this note easier to understand.</div>}</article></div></div></section>

    <section className="taw-card"><div className="taw-section-head"><div><span>05 · SHARED NOTES</span><h2>Publish your class notebook</h2></div></div>{roster?.notes.length?roster.notes.map(item=><article key={item.id} className="taw-inline-row"><div><strong>{item.title}</strong><p className="taw-help">Week {item.weekNumber??"—"} · {item.status}</p></div><button className="taw-btn ghost" disabled={saving||loading||locked||item.status==="published"} onClick={()=>void run(()=>publishNote(item.id))}>{item.status==="published"?"Published":"Publish note"}</button></article>):<p className="taw-help">Saved notes appear here. Publishing makes them available to linked families.</p>}</section>
    {locked&&<p role="status" className="taw-help">This term is locked. You can view existing work and marks.</p>}
    {!contexts.assignments.length&&<p className="taw-help">No class–subject teaching contexts are available. Ask school leadership to configure teaching assignments.</p>}

  </div>;
}
