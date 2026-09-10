"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Check, Clock3, MessageSquare, Paperclip, RefreshCw, Send, Smartphone, X } from "lucide-react";
import "./communications-simple.css";

type Person={id:string;name:string;email?:string|null;phone?:string|null;roles?:string[];isGuardian?:boolean};
type Attachment={name:string;type:string;size:number;dataUrl:string};
type Message={id:string;body:string;status:string;createdAt:string;sentAt?:string|null;lastError?:string|null;templateVariables?:unknown;mediaUrl?:string|null;channel?:string;recipientType?:string;recipientId?:string;title?:string;senderName?:string;senderId?:string|null;attachments?:Attachment[];readAt?:string|null};
type Props={schoolName:string;mode?:"all"|"external"};
type Tab="compose"|"inbox"|"sent";
type Channel="in_app"|"sms"|"whatsapp";

const channels:Record<Channel,{label:string;detail:string;icon:typeof Bell}>={
  in_app:{label:"SukuuNova inbox",detail:"Delivered inside the portal with read and reply history.",icon:Bell},
  sms:{label:"SMS",detail:"Delivered to the phone number held by the school.",icon:Smartphone},
  whatsapp:{label:"WhatsApp",detail:"Delivered through the school WhatsApp business sender.",icon:MessageSquare},
};

function meta(value:unknown){return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function formatDate(value:unknown){const d=new Date(String(value||""));return Number.isNaN(d.getTime())?"—":d.toLocaleString("en-GH",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});}
function titleOf(message:Message){return message.title||String(meta(message.templateVariables).title||message.body.split("\n")[0]||"Message");}
function senderOf(message:Message){return message.senderName||String(meta(message.templateVariables).senderName||"School communication");}
function attachmentsOf(message:Message){return message.attachments||([] as Attachment[]);}

export default function UnifiedCommunicationsDesk({schoolName,mode="all"}:Props){
  const [tab,setTab]=useState<Tab>("compose");
  const [channel,setChannel]=useState<Channel>(mode==="external"?"sms":"in_app");
  const [audience,setAudience]=useState("individual");
  const [title,setTitle]=useState("");
  const [body,setBody]=useState("");
  const [userId,setUserId]=useState("");
  const [mediaUrl,setMediaUrl]=useState("");
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [data,setData]=useState<{inbox:Message[];sent:Message[];recipients:Person[];unreadCount:number}>({inbox:[],sent:[],recipients:[],unreadCount:0});
  const [selectedInboxId,setSelectedInboxId]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const response=await fetch("/api/school/communications/unified",{cache:"no-store"});
    const payload=await response.json().catch(()=>({}));
    if(response.ok)setData(payload);
  }

  useEffect(()=>{void load();const id=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(id);},[]);
  useEffect(()=>{if(!data.inbox.length){setSelectedInboxId("");return;}setSelectedInboxId(current=>data.inbox.some(message=>message.id===current)?current:data.inbox[0].id);},[data.inbox]);

  const counts=useMemo(()=>({
    guardians:data.recipients.filter(person=>person.isGuardian).length,
    teachers:data.recipients.filter(person=>person.roles?.some(role=>/teacher/i.test(role))).length,
    staff:data.recipients.filter(person=>!person.isGuardian).length,
  }),[data.recipients]);
  const selectedInbox=data.inbox.find(message=>message.id===selectedInboxId)??null;

  async function files(event:React.ChangeEvent<HTMLInputElement>){
    const next:Attachment[]=[];
    for(const file of [...(event.target.files||[])]){
      if(file.size>1500000){setError(`${file.name} is larger than 1.5 MB.`);continue;}
      const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      next.push({name:file.name,type:file.type||"application/octet-stream",size:file.size,dataUrl});
    }
    const merged=[...attachments,...next].slice(0,3);
    if(merged.reduce((sum,item)=>sum+item.size,0)>3000000){setError("Keep attachments under 3 MB total.");return;}
    setAttachments(merged);setError("");event.target.value="";
  }

  async function markRead(id:string){
    await fetch("/api/school/communications/unified",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mark_read",messageId:id})});
    await load();
  }

  function openInbox(message:Message){
    setSelectedInboxId(message.id);
    if(!message.readAt)void markRead(message.id);
  }

  function reply(message:Message){
    const senderId=message.senderId||String(meta(message.templateVariables).senderId||"");
    if(!senderId)return;
    setAudience("individual");setUserId(senderId);setChannel("in_app");setTitle(`Re: ${titleOf(message)}`);setBody("");setTab("compose");
  }

  async function submit(event:React.FormEvent){
    event.preventDefault();setBusy(true);setNotice("");setError("");
    const response=await fetch("/api/school/communications/unified",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"send",title,body,channel,audience,userId:userId||undefined,mediaUrl:mediaUrl||undefined,attachments})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)setError(payload.message||"Message could not be sent.");
    else{setNotice(payload.message||"Message sent.");setTitle("");setBody("");setUserId("");setMediaUrl("");setAttachments([]);setTab("sent");await load();}
    setBusy(false);
  }

  const availableChannels=(Object.keys(channels) as Channel[]).filter(item=>mode!=="external"||item!=="in_app");
  const audienceOptions=[["individual","One person",data.recipients.length],["guardians","Parents / guardians",counts.guardians],["teachers","Teachers",counts.teachers],["staff","Staff",counts.staff]] as const;
  const ChannelIcon=channels[channel].icon;

  return <div className="comm-desk">
    <div className="comm-top">
      <div className="comm-top-copy"><strong>{schoolName} communications</strong><span>Write, read and check delivery without leaving this workspace.</span></div>
      <button type="button" className="comm-refresh" onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button>
    </div>

    <nav className="comm-tabs" aria-label="Communication workspace">
      <button type="button" className={tab==="compose"?"is-active":""} onClick={()=>setTab("compose")}>Compose</button>
      {mode!=="external"?<button type="button" className={tab==="inbox"?"is-active":""} onClick={()=>setTab("inbox")}>Inbox{data.unreadCount?<span className="comm-badge">{data.unreadCount}</span>:null}</button>:null}
      <button type="button" className={tab==="sent"?"is-active":""} onClick={()=>setTab("sent")}>Sent & delivery</button>
    </nav>

    {tab==="compose"?<section className="comm-panel">
      <div className="comm-panel-head"><div><h2>New message</h2><p>Choose the recipient and channel, write the message, then send.</p></div></div>
      <form className="comm-form" onSubmit={submit}>
        <div className="comm-form-grid">
          <label className="comm-field"><span>Subject</span><input required value={title} onChange={event=>setTitle(event.target.value)} maxLength={160} placeholder="PTA reminder, fee notice, school update…"/></label>
          <label className="comm-field"><span>Channel</span><select value={channel} onChange={event=>setChannel(event.target.value as Channel)}>{availableChannels.map(item=><option key={item} value={item}>{channels[item].label}</option>)}</select></label>
        </div>
        <div className="comm-channel-note"><ChannelIcon size={14}/> <strong>{channels[channel].label}:</strong> {channels[channel].detail}</div>

        <div><span className="comm-label">Audience</span><div className="comm-audience">{audienceOptions.map(([value,label,count])=><button type="button" key={value} className={audience===value?"is-active":""} onClick={()=>setAudience(value)}><strong>{label}</strong><small>{count} account{count===1?"":"s"}</small></button>)}</div></div>
        {audience==="individual"?<label className="comm-field"><span>Person</span><select value={userId} onChange={event=>setUserId(event.target.value)} required><option value="">Choose recipient</option>{data.recipients.map(person=><option key={person.id} value={person.id}>{person.name} · {person.roles?.slice(0,2).join(" · ")||"School user"}{person.phone?` · ${person.phone}`:""}</option>)}</select></label>:null}

        <label className="comm-field"><span>Message</span><textarea required value={body} onChange={event=>setBody(event.target.value)} rows={7} maxLength={5000} placeholder="Write the message exactly as the recipient should receive it…"/></label>

        <details className="comm-advanced">
          <summary><Paperclip size={14}/>Attachments & media</summary>
          <div className="comm-advanced-body">
            {channel==="in_app"?<><span className="comm-channel-note">Portal messages can include up to 3 files, 3 MB total.</span><input type="file" multiple onChange={files}/>{attachments.map((attachment,index)=><div className="comm-file-row" key={`${attachment.name}-${index}`}><span>{attachment.name}</span><button type="button" onClick={()=>setAttachments(current=>current.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remove ${attachment.name}`}><X size={14}/></button></div>)}</>:<label className="comm-field"><span>Public media URL (optional)</span><input type="url" value={mediaUrl} onChange={event=>setMediaUrl(event.target.value)} placeholder="https://…"/></label>}
          </div>
        </details>

        <div className="comm-actions">
          <button className="comm-send" disabled={busy}><Send size={14}/>{busy?"Sending…":`Send via ${channels[channel].label}`}</button>
          {notice?<span className="comm-status ok"><Check size={14}/>{notice}</span>:null}
          {error?<span className="comm-status error"><AlertTriangle size={14}/>{error}</span>:null}
        </div>
      </form>
    </section>:null}

    {tab==="inbox"&&mode!=="external"?<section className="comm-split">
      <div className="comm-list"><div className="comm-list-head">Inbox · {data.inbox.length}</div>{data.inbox.length?data.inbox.map(message=><button type="button" key={message.id} className={`comm-message-row ${selectedInboxId===message.id?"is-active":""} ${message.readAt?"":"is-unread"}`} onClick={()=>openInbox(message)}><strong>{titleOf(message)}</strong><span>{senderOf(message)} · {formatDate(message.createdAt)}</span></button>):<div className="comm-empty">Your inbox is clear.</div>}</div>
      <div className="comm-reader">{selectedInbox?<><div className="comm-reader-head"><div><strong>{titleOf(selectedInbox)}</strong><span>From {senderOf(selectedInbox)} · {formatDate(selectedInbox.createdAt)}</span></div><span>{selectedInbox.readAt?"Read":"Unread"}</span></div><div className="comm-reader-body">{selectedInbox.body}</div><div className="comm-reader-actions"><button type="button" onClick={()=>reply(selectedInbox)}>Reply</button>{attachmentsOf(selectedInbox).map(attachment=><a key={attachment.name} href={attachment.dataUrl} download={attachment.name}><Paperclip size={13}/>{attachment.name}</a>)}</div></>:<div className="comm-empty">Choose a message to read it.</div>}</div>
    </section>:null}

    {tab==="sent"?<section className="comm-panel">
      <div className="comm-panel-head"><div><h2>Sent & delivery</h2><p>Recent messages with their current delivery state.</p></div></div>
      {data.sent.length?<div className="comm-sent-list">{data.sent.map(message=>{const status=message.status||"sent";return <div className="comm-sent-row" key={message.id}><div><strong>{titleOf(message)}</strong><small>{message.channel||"in_app"} · {message.recipientType||"recipient"} · {formatDate(message.createdAt)}{message.lastError?` · ${message.lastError}`:""}</small></div><span className={`comm-delivery ${status}`}>{status==="failed"?<AlertTriangle size={12}/>:status==="queued"?<Clock3 size={12}/>:<Check size={12}/>} {status}</span></div>;})}</div>:<div className="comm-empty">Nothing has been sent yet.</div>}
    </section>:null}
  </div>;
}
