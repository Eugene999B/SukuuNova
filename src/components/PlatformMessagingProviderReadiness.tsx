"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, RefreshCw, ServerCog, ShieldAlert } from "lucide-react";

type SmsProviderKey="arkesel"|"sailup"|"hubtel"|"generic";
type SmsProvider={key:SmsProviderKey;label:string;configured:boolean;default:boolean;detail:string};
type Status={checkedAt:string;sms:{activeProvider:SmsProviderKey;providers:SmsProvider[];senderConfigured:boolean};whatsapp:{configured:boolean;senderConfigured:boolean}};
function State({configured}:{configured:boolean}){return <span className={`platform-status ${configured?"platform-status-healthy":"platform-status-watch"}`}>{configured?"Ready":"Needs credentials"}</span>}

export default function PlatformMessagingProviderReadiness(){
 const[data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function load(){setBusy(true);try{const response=await fetch("/api/platform/messaging-provider",{cache:"no-store"});if(response.ok)setData(await response.json() as Status)}finally{setBusy(false)}}
 async function activate(provider:SmsProviderKey){setBusy(true);setMessage("");try{const response=await fetch("/api/platform/messaging-provider",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider})});const body=await response.json() as Status&{message?:string;error?:string};if(!response.ok){setMessage(body.message??body.error??"Unable to switch SMS provider.");return}setData({...body,checkedAt:new Date().toISOString()});setMessage(`Active SMS provider switched to ${body.sms.providers.find(item=>item.key===provider)?.label??provider}.`)}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 if(!data)return <section className="app-card app-panel platform-empty"><strong>Checking provider readiness…</strong><span>Provider credentials are never returned to the browser.</span></section>;
 const active=data.sms.providers.find(item=>item.key===data.sms.activeProvider);
 return <section className="app-card app-panel">
  <div className="app-card-head"><div><span className="app-eyebrow">SMS PROVIDER ROUTING</span><h2>Switch gateways without rewriting communications</h2><p>Arkesel is the SukuuNova default. Configure alternatives once, then switch routing here while every school continues using the same outbox, credit wallet and delivery history.</p></div><ServerCog size={21}/></div>
  {message&&<div className="app-banner" role="status"><div><h3>{message}</h3><p>The switch is platform-audited; API keys remain server-only.</p></div><span className="app-pill">Audited</span></div>}
  <div className="platform-choice-grid">{data.sms.providers.map(provider=><div key={provider.key} className={data.sms.activeProvider===provider.key?"is-selected":""} style={{cursor:"default"}}><MessageCircle size={17}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><strong>{provider.label}{provider.default?" · default":""}</strong><State configured={provider.configured}/></div><span>{provider.detail}</span><small>{data.sms.activeProvider===provider.key?"Currently routing SukuuNova SMS.":provider.configured?"Ready to switch.":"Add its server credentials before switching."}</small><button type="button" className="app-pill" disabled={busy||!provider.configured||data.sms.activeProvider===provider.key} onClick={()=>void activate(provider.key)}>{data.sms.activeProvider===provider.key?"Active":"Use provider"}</button></div>)}</div>
  <div className="platform-choice-grid" style={{marginTop:16}}><div className="is-selected" style={{cursor:"default"}}><MessageCircle size={17}/><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><strong>Twilio WhatsApp</strong><State configured={data.whatsapp.configured}/></div><span>{data.whatsapp.configured?"Account, authentication and WhatsApp sender are available.":"Configure the Twilio WhatsApp credentials to enable this channel."}</span><small>{data.whatsapp.senderConfigured?"WhatsApp sender configured.":"WhatsApp sender is missing."}</small></div></div>
  <div className="platform-calculation-card"><div><span className="platform-calculation-label">Active SMS route</span><strong>{active?.label??data.sms.activeProvider}</strong><small>Platform inventory and school resale balances are provider-independent, so changing gateways never gives a school extra credits.</small></div>{active?.configured?<CheckCircle2 size={22}/>:<ShieldAlert size={22}/>}</div>
  <button type="button" className="app-pill" onClick={()=>void load()} disabled={busy}><RefreshCw size={13}/>Refresh readiness</button><small style={{display:"block",marginTop:8,color:"var(--sn-muted)",fontSize:9}}>Last checked {new Date(data.checkedAt).toLocaleString()}</small>
 </section>;
}
