"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import "../settings/settings.css";

type Term={id:string;name:string;startDate:string;endDate:string;status:"upcoming"|"current"|"completed";academicYear:{id:string;name:string;startDate:string;endDate:string}};
type Summary={students:number;assessments:number;scores:number;scorePct:number|null;reportCards:number;attendance:{records:number;present:number;late:number;absent:number};finance:{invoiceCount:number;invoiced:number;collected:number;outstanding:number}};
const date=(s:string)=>new Date(s).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

export default function TermsPage(){
 const [terms,setTerms]=useState<Term[]>([]);const [selected,setSelected]=useState("");const [summary,setSummary]=useState<Summary|null>(null);const [error,setError]=useState("");
 useEffect(()=>{fetch("/api/school/terms").then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error??"Unable to load terms");setTerms(j.terms);setSelected(j.terms.find((t:Term)=>t.status==="current")?.id??j.terms[0]?.id??"");}).catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(!selected)return;fetch(`/api/school/terms/${selected}`).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error??"Unable to load term summary");setSummary(j);}).catch(e=>setError(e.message));},[selected]);
 const active=useMemo(()=>terms.find(t=>t.id===selected),[terms,selected]);
 return <AppShell universe="school" title="Terms & Academic Calendar" subtitle="Every term is a real time window. Old terms stay available for review, comparison and reporting." active="Academic Setup">
   <div className="settings-workspace">
    <div className="settings-hero"><div><span className="eyebrow">Academic timeline</span><h2>{active?active.name:"Set up your first term"}</h2><p>{active?`${active.academicYear.name} · ${date(active.startDate)} to ${date(active.endDate)}.`:"Create terms from School Settings to unlock term-aware summaries."}</p></div><div className="settings-hero-actions"><Link href="/school/settings" className="button secondary">Manage settings</Link></div></div>
    {error&&<div className="settings-message">{error}</div>}
    <section className="terms-layout">
      <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Term history</span><h3>Choose the period</h3></div></div><div className="term-strip">{terms.map(t=><button key={t.id} onClick={()=>setSelected(t.id)} className={`term-item ${t.status} ${selected===t.id?"selected":""}`}><span className="term-dot"/><div><b>{t.name}</b><small>{t.academicYear.name}</small><small>{date(t.startDate)} → {date(t.endDate)}</small></div><span className="status-pill">{t.status}</span></button>)}</div></div>
      <div className="settings-card"><div className="card-heading"><div><span className="eyebrow">Term intelligence</span><h3>{active?.status??"No term"}</h3></div></div>
        {summary?<div className="summary-grid"><div className="summary-box"><b>{summary.students}</b><span>Active students</span></div><div className="summary-box"><b>{summary.attendance.records}</b><span>Attendance records</span></div><div className="summary-box"><b>{summary.scorePct==null?"—":`${summary.scorePct.toFixed(1)}%`}</b><span>Average score</span></div><div className="summary-box"><b>{summary.reportCards}</b><span>Report cards</span></div><div className="summary-box"><b>₵{summary.finance.invoiced.toFixed(2)}</b><span>Invoiced</span></div><div className="summary-box"><b>₵{summary.finance.collected.toFixed(2)}</b><span>Collected</span></div></div>:<p className="empty-state">No term selected.</p>}
        {active&&<div className="inline-note"><b>Keep the record</b><span>{active.status==="completed"?"This term has ended by date. Its assessments, attendance, finance and report-card records remain connected and queryable.":active.status==="current"?"This is the current operating period. Term-aware pages should use it as their default context.":"This term is scheduled. It will become current automatically when its start date arrives."}</span></div>}
        <div className="action-list"><Link href="/school/gradebook">Work with results <span>→</span></Link><Link href="/school/attendance">Review attendance <span>→</span></Link><Link href="/school/fees">Open term finance <span>→</span></Link><Link href="/school/report-cards">Review report cards <span>→</span></Link></div>
      </div>
    </section>
   </div>
 </AppShell>;
}
