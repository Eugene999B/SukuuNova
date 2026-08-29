"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import "./print.css";

type Day={dayOfWeek:number;name:string;enabled:boolean;start:string;end:string};
type Config={days:Day[];periodMinutes:number;breaks:{name:string;start:string;end:string}[];periodsPerDay:number;published:boolean};
type Person={id:string;name:string};
type School={name:string;uniqueCode:string;logoUrl:string|null};
type Slot={id:string;classId:string;subjectId:string;teacherId:string;dayOfWeek:number;period:number;class:{id:string;name:string;level:string|null};subject:{id:string;name:string};teacher:{id:string;name:string}};
type Data={school:School|null;classes:(Person&{level:string|null})[];subjects:Person[];teachers:Person[];slots:Slot[];timetableConfig:Config};
type Audience="class"|"teacher"|"master";
type Design="modern"|"campus"|"classic"|"pastel"|"bold"|"mono";
type Column={kind:"lesson"|"break";period?:number;name?:string;start:string;end:string};

const designs:{id:Design;name:string;description:string}[]=[
  {id:"modern",name:"Modern School",description:"Polished and colourful"},
  {id:"campus",name:"Campus",description:"Branded wall poster"},
  {id:"classic",name:"Classic",description:"Formal school office"},
  {id:"pastel",name:"Pastel",description:"Soft and friendly"},
  {id:"bold",name:"Bold",description:"High-impact colour"},
  {id:"mono",name:"Mono",description:"Ink-saving"},
];

function mins(v:string){const [h,m]=v.split(":").map(Number);return h*60+m;}
function clock(v:number){const h=Math.floor(v/60)%24,m=v%60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function timeline(day:Day,config:Config):Column[]{
  const start=mins(day.start),end=mins(day.end);
  const breaks=config.breaks.map(b=>({...b,startMin:mins(b.start),endMin:mins(b.end)})).filter(b=>b.endMin>start&&b.startMin<end).sort((a,b)=>a.startMin-b.startMin);
  const out:Column[]=[];let cursor=start;
  for(let p=1;p<=config.periodsPerDay&&cursor<end;p++){
    const next=Math.min(cursor+config.periodMinutes,end);
    const active=breaks.find(b=>b.startMin<=cursor&&b.endMin>cursor);
    if(active){out.push({kind:"break",name:active.name,start:clock(Math.max(cursor,active.startMin)),end:clock(Math.min(end,active.endMin))});cursor=Math.min(end,active.endMin);p--;continue;}
    const upcoming=breaks.find(b=>b.startMin>cursor&&b.startMin<next);
    if(upcoming){out.push({kind:"lesson",period:p,start:clock(cursor),end:clock(upcoming.startMin)});cursor=upcoming.startMin;continue;}
    out.push({kind:"lesson",period:p,start:clock(cursor),end:clock(next)});cursor=next;
    const exact=breaks.find(b=>b.startMin===cursor);
    if(exact){out.push({kind:"break",name:exact.name,start:exact.start,end:exact.end});cursor=exact.endMin;}
  }
  return out;
}
function escHtml(v:string){return v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");}
function escRtf(v:string){return v.replaceAll("\\","\\\\").replace(/[{}]/g,"\\$&").replace(/\r?\n/g,"\\par ");}
function safeName(v:string){return v.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"timetable";}
function hashColour(value:string){let h=0;for(let i=0;i<value.length;i++)h=(h*31+value.charCodeAt(i))>>>0;const palette=["#2563eb","#7c3aed","#059669","#ea580c","#db2777","#0891b2","#ca8a04","#4f46e5"];return palette[h%palette.length];}

export default function PrintStudio({data}:{data:Data}){
  const [audience,setAudience]=useState<Audience>("class");
  const [selectedId,setSelectedId]=useState(data.classes[0]?.id??"");
  const [design,setDesign]=useState<Design>("modern");
  const days=useMemo(()=>data.timetableConfig.days.filter(d=>d.enabled&&d.dayOfWeek>=1&&d.dayOfWeek<=6),[data.timetableConfig.days]);
  const columns=useMemo(()=>{const day=days[0]??{dayOfWeek:1,name:"Monday",enabled:true,start:"08:00",end:"15:00"};return timeline(day,data.timetableConfig);},[days,data.timetableConfig]);
  const options=audience==="class"?data.classes:audience==="teacher"?data.teachers:[];
  const selectedName=audience==="class"?(data.classes.find(x=>x.id===selectedId)?.name??"Class timetable"):audience==="teacher"?(data.teachers.find(x=>x.id===selectedId)?.name??"Teacher timetable"):"Master timetable";
  const filtered=useMemo(()=>audience==="class"?data.slots.filter(s=>s.classId===selectedId):audience==="teacher"?data.slots.filter(s=>s.teacherId===selectedId):data.slots,[data.slots,audience,selectedId]);
  const title=selectedName;
  const cell=(day:Day,col:Column)=>{if(col.kind==="break")return null;const dayCols=timeline(day,data.timetableConfig);const block=dayCols.find(x=>x.kind==="lesson"&&x.period===col.period);return block?.period?filtered.find(s=>s.dayOfWeek===day.dayOfWeek&&s.period===block.period)??null:null;};
  const exportRows=useMemo(()=>filtered.map(s=>{const day=days.find(d=>d.dayOfWeek===s.dayOfWeek);const col=columns.find(c=>c.kind==="lesson"&&c.period===s.period);return {day:day?.name??"Day",time:`${col?.start??""} - ${col?.end??""}`,className:s.class.name,subject:s.subject.name,teacher:s.teacher.name};}),[filtered,days,columns]);
  const download=(name:string,content:string,type:string)=>{const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const csv=()=>{const body=[["Day","Time","Class","Subject","Teacher"],...exportRows.map(r=>[r.day,r.time,r.className,r.subject,r.teacher])].map(r=>r.map(v=>`"${v.replaceAll('"','""')}"`).join(",")).join("\n");download(`sukuunova-${safeName(title)}.csv`,body,"text/csv;charset=utf-8");};
  const word=()=>{const lines=exportRows.map(r=>`${escRtf(r.day)}\\tab ${escRtf(r.time)}\\tab ${escRtf(r.className)}\\tab ${escRtf(r.subject)}\\tab ${escRtf(r.teacher)}\\par`).join("");const body=`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Aptos;}}\\viewkind4\\fs34\\b ${escRtf(data.school?.name??"School")}\\b0\\par\\fs28 ${escRtf(title)}\\par\\fs20\\par Day\\tab Time\\tab Class\\tab Subject\\tab Teacher\\par ${lines}}`;download(`sukuunova-${safeName(title)}.rtf`,body,"application/rtf");};
  const html=()=>{const body=`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${documentStyles(design)}</style></head><body>${renderHtmlTable(data,days,columns,filtered,audience,title)}</body></html>`;download(`sukuunova-${safeName(title)}.html`,body,"text/html;charset=utf-8");};

  return <main className={`print-studio ${design}`}>
    <section className="studio-top"><div className="studio-intro"><span className="studio-kicker">ACADEMICS / PRINT TIMETABLE</span><h1>Make the timetable ready for people, paper and sharing.</h1><p>The editor controls the schedule. This workspace controls how that schedule looks when a school prints it, distributes it, edits it in Word, opens it in Excel, or shares it as HTML.</p></div><Link href="/school/timetable" className="studio-back">← Back to timetable editor</Link></section>
    <section className="studio-toolbar"><div className="toolbar-block"><label>Audience</label><div className="pill-tabs"><button type="button" className={audience==="class"?"active":""} onClick={()=>{setAudience("class");setSelectedId(data.classes[0]?.id??"")}}>Class</button><button type="button" className={audience==="teacher"?"active":""} onClick={()=>{setAudience("teacher");setSelectedId(data.teachers[0]?.id??"")}}>Teacher</button><button type="button" className={audience==="master"?"active":""} onClick={()=>{setAudience("master");setSelectedId("")}}>Master</button></div></div>{audience!=="master"?<div className="toolbar-block select-block"><label>{audience==="class"?"Class":"Teacher"}</label><select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>{options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>:null}</section>
    <section className="design-section"><div className="section-label"><span className="studio-kicker">DESIGN COLLECTION</span><h2>Choose the look before you print.</h2><p>Every style keeps the same timetable data and real bell times.</p></div><div className="design-grid">{designs.map(d=><button type="button" key={d.id} className={`design-card ${design===d.id?"selected":""} ${d.id}`} onClick={()=>setDesign(d.id)}><div className="design-mini"><div className="mini-head"/><div className="mini-grid"><i/><i/><i/><i/><i/><i/><i/><i/></div></div><b>{d.name}</b><span>{d.description}</span></button>)}</div></section>
    <section className="paper-wrap"><div className="paper-label"><span>LIVE PREVIEW</span><strong>{title}</strong><span>{filtered.length} lessons</span></div><div className="paper" id="print-paper"><header className="paper-header"><div className="school-mark">{data.school?.logoUrl?<img src={data.school.logoUrl} alt={`${data.school.name} logo`}/>:null}</div><div className="paper-heading"><small>WEEKLY TIMETABLE</small><h2>{data.school?.name??"School"}</h2><strong>{title}</strong></div><div className="paper-badge"><span>{audience.toUpperCase()}</span><b>{data.timetableConfig.published?"PUBLISHED":"DRAFT"}</b></div></header><div className="paper-rule"/><div className="paper-note"><span>School day: {days[0]?.start??""} – {days[0]?.end??""}</span><span>{designs.find(d=>d.id===design)?.name}</span></div><div className="paper-table-scroll"><table className="timetable-print-table"><thead><tr><th className="day-heading">DAY</th>{columns.map((c,i)=><th key={i} className={c.kind==="break"?"break-head":"time-head"}>{c.kind==="break"?<span>{c.name}</span>:<><b>{c.start}</b><small>{c.end}</small></>}</th>)}</tr></thead><tbody>{days.map(day=><tr key={day.dayOfWeek}><th className="day-cell"><b>{day.name.slice(0,3).toUpperCase()}</b><span>{day.name}</span></th>{columns.map((c,i)=>{if(c.kind==="break")return <td key={i} className="break-cell"><span>{c.name}</span></td>;const s=cell(day,c);return <td key={i} className={`lesson-cell ${s?"filled":""}`} style={s?{"--subject":hashColour(s.subject.name)} as React.CSSProperties:undefined}>{s?<><b>{s.subject.name}</b><span>{audience==="master"?s.class.name:s.teacher.name}</span>{audience==="master"?<small>{s.teacher.name}</small>:null}</>:null}</td>})}</tr>)}</tbody></table></div><footer className="paper-footer"><span>{data.school?.uniqueCode??""}</span><span>Generated by SukuuNova</span></footer></div></section>
    <section className="download-panel"><div><span className="studio-kicker">DISTRIBUTE & SHARE</span><h2>Use the right file for the job.</h2><p>PDF is ready for paper distribution, Word lets staff edit the schedule, CSV opens cleanly in spreadsheets, and HTML is convenient for sharing and archiving.</p></div><div className="download-actions"><button type="button" className="primary-download" onClick={()=>window.print()}>Print / Save PDF</button><button type="button" onClick={word}>Word (.rtf)</button><button type="button" onClick={csv}>Excel / CSV</button><button type="button" onClick={html}>HTML</button></div></section>
  </main>;
}

function renderHtmlTable(data:Data,days:Day[],columns:Column[],filtered:Slot[],audience:Audience,title:string){
  const cell=(day:Day,col:Column)=>{if(col.kind==="break")return null;const dayCols=timeline(day,data.timetableConfig);const block=dayCols.find(x=>x.kind==="lesson"&&x.period===col.period);return block?.period?filtered.find(s=>s.dayOfWeek===day.dayOfWeek&&s.period===block.period)??null:null;};
  return `<main class="print-doc"><header><div class="logo">${data.school?.logoUrl?`<img src="${escHtml(data.school.logoUrl)}" alt="logo">`:""}</div><div><small>WEEKLY TIMETABLE</small><h1>${escHtml(data.school?.name??"School")}</h1><h2>${escHtml(title)}</h2></div></header><table><thead><tr><th>Day</th>${columns.map(c=>`<th class="${c.kind}">${escHtml(c.kind==="break"?c.name??"Break":`${c.start} – ${c.end}`)}</th>`).join("")}</tr></thead><tbody>${days.map(day=>`<tr><th>${escHtml(day.name)}</th>${columns.map(c=>{if(c.kind==="break")return `<td class="break"><span>${escHtml(c.name??"Break")}</span></td>`;const s=cell(day,c);return `<td>${s?`<b>${escHtml(s.subject.name)}</b><span>${escHtml(audience==="master"?s.class.name:s.teacher.name)}</span>${audience==="master"?`<small>${escHtml(s.teacher.name)}</small>`:""}`:""}</td>`;}).join("")}</tr>`).join("")}</tbody></table><footer>${escHtml(data.school?.uniqueCode??"")} • Generated by SukuuNova</footer></main>`;
}

function documentStyles(design:Design){return `body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#17353a}.print-doc{max-width:1300px;margin:auto}.print-doc header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #17353a;padding-bottom:14px;margin-bottom:14px}.logo{width:54px;height:54px}.logo img{width:100%;height:100%;object-fit:contain}.print-doc h1{margin:3px 0;font-size:24px}.print-doc h2{margin:0;font-size:15px}.print-doc small{display:block;letter-spacing:.14em;font-weight:800}.print-doc table{border-collapse:collapse;width:100%;table-layout:fixed}.print-doc th,.print-doc td{border:1px solid #bccbc9;padding:8px;text-align:center;height:45px}.print-doc thead th{background:#eef3f1}.print-doc tbody th{text-align:left;background:#f8faf9}.print-doc td b,.print-doc td span,.print-doc td small{display:block}.print-doc .break{background:#f1e7e0}.print-doc .break span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.print-doc footer{margin-top:10px;padding-top:8px;border-top:1px solid #d8e1df;font-size:9px;color:#718084}${design==="campus"?".print-doc header{border-bottom:8px solid #0f766e}.print-doc thead th{background:#0f766e;color:#fff}.print-doc tbody th{background:#ecfdf5}":design==="classic"?".print-doc header{border-bottom:4px double #17353a}.print-doc h1,.print-doc h2{font-family:Georgia,serif}.print-doc td,.print-doc th{font-family:Georgia,serif}":design==="pastel"?".print-doc{color:#334155}.print-doc header{border-bottom:3px solid #a78bfa}.print-doc thead th{background:#f5f3ff}.print-doc tbody th{background:#fafaf9}.print-doc .break{background:#fef3c7}":design==="bold"?".print-doc{color:#0f172a}.print-doc header{background:#0f172a;color:#fff;padding:18px;border-bottom:0}.print-doc thead th{background:#facc15;color:#111827}.print-doc .break{background:#111827;color:#fff}":design==="mono"?"body{color:#111}.print-doc header{border-bottom:1px solid #111}.print-doc thead th{background:#fff}.print-doc .break{background:#f4f4f4}":""}`;}
