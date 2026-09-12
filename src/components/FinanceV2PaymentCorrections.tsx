"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

type Payment={id:string;studentName:string;amount:number|string;reversedAmount:number|string;method:string;reference:string|null;createdAt:string};
type Snapshot={recentPayments:Payment[];capabilities:{canReversePayment?:boolean}};
const money=(value:unknown)=>`GH₵${Number(value||0).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const shortDate=(value:string)=>new Intl.DateTimeFormat("en-GH",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value));

export default function FinanceV2PaymentCorrections(){
  const[data,setData]=useState<Snapshot|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[notice,setNotice]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/school/finance-v2",{cache:"no-store"});const json=await response.json();if(!response.ok)throw new Error(json.message||json.error||"Payment history could not be loaded.");setData(json);}catch(error){setError(error instanceof Error?error.message:"Payment history could not be loaded.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  async function reverse(payment:Payment){
    const available=Math.max(0,Number(payment.amount)-Number(payment.reversedAmount||0));
    const amountText=window.prompt(`Amount to reverse (maximum ${money(available)})`,available.toFixed(2));if(!amountText)return;
    const amount=Number(amountText);if(!Number.isFinite(amount)||amount<=0||amount>available){setError("Enter a reversal amount greater than zero and not above the unreversed receipt value.");return;}
    const reason=window.prompt("Reason for this payment correction / reversal?");if(!reason?.trim())return;
    setError("");setNotice("");const response=await fetch("/api/school/finance-v2",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"payment.reverse",paymentId:payment.id,amount,reason:reason.trim()})});const json=await response.json();if(!response.ok){setError(json.message||json.error||"Payment could not be reversed.");return;}setNotice("Payment correction recorded. The original receipt remains in the audit trail.");await load();
  }
  return <section className="fv2-card"><header><h3>Payment controls</h3><p>Every new payment needs a receipt or transaction reference. Posted payments are corrected by reversal, never by silently editing or deleting cash history.</p></header>
    <div className="fv2-alert"><ShieldCheck size={16}/> Use a unique reference such as a MoMo transaction ID, bank reference, cheque number or cashier receipt number. Retrying the same payment with the same details is safe.</div>
    {notice?<div className="fv2-alert success">{notice}</div>:null}{error?<div className="fv2-alert danger">{error}</div>:null}
    {loading?<div className="fv2-loading"><RefreshCw size={16}/> Loading payment controls…</div>:null}
    {!loading&&data?<div className="fv2-table-wrap"><table><thead><tr><th>Learner</th><th>Receipt / reference</th><th>Date</th><th>Original</th><th>Reversed</th><th>Net</th><th>Correction</th></tr></thead><tbody>{data.recentPayments.slice(0,40).map(payment=>{const original=Number(payment.amount);const reversed=Number(payment.reversedAmount||0);const available=Math.max(0,original-reversed);return <tr key={payment.id}><td>{payment.studentName}</td><td>{payment.reference||payment.id.slice(-8).toUpperCase()}</td><td>{shortDate(payment.createdAt)}</td><td>{money(original)}</td><td>{money(reversed)}</td><td>{money(available)}</td><td>{available>0&&data.capabilities.canReversePayment?<button className="button secondary" type="button" onClick={()=>void reverse(payment)}><RotateCcw size={14}/>Reverse / correct</button>:available<=0?"Fully reversed":"No reversal permission"}</td></tr>})}</tbody></table></div>:null}
  </section>;
}
