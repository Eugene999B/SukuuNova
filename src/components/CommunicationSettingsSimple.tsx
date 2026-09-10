"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import "./events-settings-simple.css";

type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const text=(value:unknown,fallback="—")=>typeof value==="string"&&value.trim()?value:fallback;
const numberValue=(value:unknown,fallback=0)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;};

const automations=[
  ["payment_received","Payment received","Notify a family when a payment is recorded."],
  ["report_card_ready","Report card ready","Notify the linked family when an approved report is ready."],
  ["student_absence","Student absence","Notify the linked guardian from attendance events."],
  ["staff_late","Staff late","Create the configured staff lateness notification."],
  ["transport_boarding","Transport boarding","Notify families from transport boarding events."],
  ["emergency_broadcast","Emergency broadcast","Allow authorised priority communication."],
] as const;

export default function CommunicationSettingsSimple(){
  const [settings,setSettings]=useState<Row>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{const response=await fetch("/api/school/communications",{cache:"no-store"});const body=await response.json().catch(()=>({}));if(response.ok)setSettings(object(body.settings));},[]);
  useEffect(()=>{void load();},[load]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=new FormData(event.currentTarget);
    const payload:Row={action:"save_settings",audience:"guardians",channel:"sms"};
    form.forEach((value,key)=>{if(value!=="")payload[key]=String(value);});
    try{
      const response=await fetch("/api/school/communications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||"Could not save communication settings.");
      setMessage(body.message||"Communication settings saved.");await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save communication settings.");}finally{setBusy(false);}
  }

  const channels=strings(settings.channels);
  const whatsapp=object(settings.whatsapp);
  const automation=object(settings.automation);
  const smsCredits=numberValue(settings.smsCredits);

  return <div className="comm-settings-simple">
    <header className="simple-work-head"><div><h2>Communication settings</h2><p>Check channel readiness first. Open advanced controls only when something needs changing.</p></div></header>
    {message?<div className="simple-message" role="status">{message}</div>:null}

    <div className="settings-channel-strip">
      <div className="settings-channel-card"><span>SMS</span><strong>{channels.includes("sms")?"Enabled":"Off"}</strong><small>{smsCredits.toLocaleString()} credits available</small></div>
      <div className="settings-channel-card"><span>WhatsApp</span><strong>{channels.includes("whatsapp")?"Enabled":"Off"}</strong><small>{text(whatsapp.from,"No sender configured")}</small></div>
      <div className="settings-channel-card"><span>Sender ID</span><strong>{text(settings.smsSenderId,"Not set")}</strong><small>Shown where the provider supports it</small></div>
    </div>

    <form className="comm-settings-form" onSubmit={submit}>
      <details className="sn-progressive"><summary>Channels & sender identity</summary><div className="sn-progressive-body"><div className="simple-form-grid"><label className="simple-field"><span>SMS sender ID</span><input name="smsSenderId" defaultValue={text(settings.smsSenderId,"")} maxLength={20} placeholder="Your School"/></label><label className="simple-field"><span>WhatsApp business sender</span><input name="whatsappFrom" defaultValue={text(whatsapp.from,"")} placeholder="Configured business sender"/></label></div><div className="settings-toggle-grid"><label className="settings-toggle"><input type="checkbox" name="sms_enabled" defaultChecked={channels.includes("sms")}/><span><strong>Enable SMS</strong><small>Uses the school&apos;s prepaid SukuuNova SMS allocation.</small></span></label><label className="settings-toggle"><input type="checkbox" name="whatsapp_enabled" defaultChecked={channels.includes("whatsapp")}/><span><strong>Enable WhatsApp</strong><small>Uses the configured business sender and approved delivery path.</small></span></label></div></div></details>

      <details className="sn-progressive"><summary>Automatic notifications</summary><div className="sn-progressive-body"><div className="settings-toggle-grid">{automations.map(([key,label,detail])=><label className="settings-toggle" key={key}><input type="checkbox" name={key} defaultChecked={Boolean(automation[key])}/><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div></div></details>

      <div className="simple-form-actions"><button className="simple-primary" disabled={busy}>{busy?"Saving…":"Save communication settings"}</button></div>
    </form>
  </div>;
}
