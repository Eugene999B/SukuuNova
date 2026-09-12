"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

type Row={id:string;studentName:string;programName:string;categoryName:string|null;mode:string;value:number|string;status:string;createdAt:string;createdByName:string;reduction:number|string;adjustmentStatus:string};
type Data={rows:Row[];canApprove:boolean};
const money=(value:unknown)=>`GH₵${Number(value||0).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(value:string)=>new Intl.DateTimeFormat("en-GH",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));

export default function FinanceV2ScholarshipApprovals(){
  const[data,setData]=useState<Data|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[notice,setNotice]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/school/finance-v2/scholarships",{cache:"no-store"});const json=await response.json();if(!response.ok)throw new Error(json.message||json.error||"Scholarship requests could not be loaded.");setData(json);}catch(error){setError(error instanceof Error?error.message:"Scholarship requests could not be loaded.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  async function decide(id:string,decision:"approve"|"reject"){
    const verb=decision==="approve"?"approve":"reject";
    if(!window.confirm(`Are you sure you want to ${verb} this scholarship request?`))return;
    setError("");setNotice("");
    const response=await fetch("/api/school/finance-v2/scholarships",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({awardId:id,decision})});
    const json=await response.json();
    if(!response.ok){setError(json.message||json.error||"Scholarship decision could not be recorded.");return;}
    setNotice(decision==="approve"?"Scholarship approved and the learner balance has been reduced.":"Scholarship request rejected. No learner fee was changed.");
    await load();
  }
  return <section className="fv2-card"><header><h3>Scholarship approval control</h3><p>Scholarship requests do not change a learner&apos;s balance until a different authorized person approves them.</p></header>
    <div className="fv2-alert"><ShieldCheck size={16}/> Accounts can prepare requests. An Owner, Administrator or Principal with approval access must independently approve them; nobody can approve their own request.</div>
    {notice?<div className="fv2-alert success">{notice}</div>:null}{error?<div className="fv2-alert danger">{error}</div>:null}
    {loading?<div className="fv2-loading"><RefreshCw size={16}/> Loading scholarship approvals…</div>:null}
    {!loading&&data?<div className="fv2-table-wrap"><table><thead><tr><th>Learner</th><th>Programme</th><th>Scope</th><th>Requested by</th><th>Relief</th><th>Status</th><th>Decision</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{row.studentName}</td><td>{row.programName}<br/><small>{date(row.createdAt)}</small></td><td>{row.categoryName||"All categories"}</td><td>{row.createdByName}</td><td>{money(row.reduction)}</td><td><span className={`fv2-status ${row.status}`}>{row.status}</span></td><td>{row.status==="pending"&&data.canApprove?<div className="fv2-row-actions"><button className="button primary" type="button" onClick={()=>void decide(row.id,"approve")}><CheckCircle2 size={14}/>Approve</button><button className="button secondary" type="button" onClick={()=>void decide(row.id,"reject")}><XCircle size={14}/>Reject</button></div>:row.status==="pending"?"Awaiting independent approval":"Decision recorded"}</td></tr>)}</tbody></table></div>:null}
  </section>;
}
