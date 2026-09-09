"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import "./events-settings-simple.css";

type Row=Record<string,unknown>;
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((item):item is Row=>Boolean(item)&&typeof item==="object"):[];
const text=(value:unknown,fallback="—")=>typeof value==="string"&&value.trim()?value:fallback;
const dateValue=(value:unknown)=>{const date=new Date(String(value||""));return Number.isNaN(date.getTime())?null:date;};
const dateLabel=(value:unknown)=>dateValue(value)?.toLocaleDateString("en-GH",{day:"2-digit",month:"short",year:"numeric"})??"—";

export default function EventsWorkspaceSimple(){
  const [events,setEvents]=useState<Row[]>([]);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{const response=await fetch("/api/school/communications",{cache:"no-store"});const body=await response.json().catch(()=>({}));if(response.ok)setEvents(rows(body.events));},[]);
  useEffect(()=>{void load();},[load]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const form=new FormData(event.currentTarget);
    const payload:Row={action:"create_event",audience:"guardians",channel:"sms"};
    form.forEach((value,key)=>{if(value!=="")payload[key]=String(value);});
    try{
      const response=await fetch("/api/school/communications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.message||"Could not create event.");
      event.currentTarget.reset();setOpen(false);setMessage(body.message||"Event created.");await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not create event.");}finally{setBusy(false);}
  }

  return <div className="events-simple">
    <header className="simple-work-head"><div><h2>School calendar</h2><p>See planned events. Add the operational details only when creating a new event.</p></div><button type="button" className="simple-primary" onClick={()=>setOpen(true)}><Plus size={14}/>Add event</button></header>
    {message?<div className="simple-message" role="status">{message}</div>:null}
    <section className="event-list" aria-label="School events">{events.length?events.map(item=>{const start=dateValue(item.startDate);return <article className="event-row" key={text(item.id)}><div className="event-main"><div className="event-date"><strong>{start?.getDate()??"—"}</strong><span>{start?.toLocaleDateString("en-GH",{month:"short"})??""}</span></div><div className="event-copy"><strong>{text(item.name,"School event")}</strong><span>{dateLabel(item.startDate)} → {dateLabel(item.endDate)}{text(item.location,"")?` · ${text(item.location)}`:""}</span><div className="event-meta"><span>{text(item.type,"event")}</span>{item.affectsAttendance===true?<span>Attendance affected</span>:null}{item.affectsTransport===true?<span>Transport affected</span>:null}</div></div></div><span className="simple-status">Planned</span></article>}):<div className="event-empty"><CalendarDays size={22}/><p>No school events yet.</p></div>}</section>

    <Dialog open={open} onClose={()=>setOpen(false)} title="Add school event" description="Set the date and operational impact. Notifications are optional." size="md">
      <form className="event-form" onSubmit={submit}>
        <div className="simple-form-grid"><label className="simple-field wide"><span>Event name</span><input name="name" required placeholder="PTA meeting, Sports Day, Open Day…"/></label><label className="simple-field"><span>Event type</span><select name="type" defaultValue="parent"><option value="parent">Parent / community</option><option value="academic">Academic</option><option value="operational">Operational</option><option value="sports">Sports</option><option value="trip">Trip / excursion</option><option value="meeting">Meeting</option><option value="holiday">Holiday</option><option value="vacation">Vacation</option><option value="exam_week">Exam week</option><option value="closure">Closure</option><option value="other">Other</option></select></label><label className="simple-field"><span>Location</span><input name="location" placeholder="School hall / field"/></label><label className="simple-field"><span>Starts</span><input name="startDate" type="datetime-local" required/></label><label className="simple-field"><span>Ends</span><input name="endDate" type="datetime-local" required/></label><label className="simple-field"><span>Attendance effect</span><select name="affectsAttendance" defaultValue=""><option value="">Automatic from event type</option><option value="true">No attendance expected</option><option value="false">Normal attendance</option></select></label><label className="simple-field"><span>Transport effect</span><select name="affectsTransport" defaultValue="false"><option value="false">Normal transport</option><option value="true">Transport affected</option></select></label><label className="simple-field wide"><span>Description</span><textarea name="description" rows={4} placeholder="Optional information for families and staff"/></label></div>
        <div className="simple-checks"><label><input type="checkbox" name="notifyGuardians"/>Notify parents / guardians</label><label><input type="checkbox" name="notifyStaff"/>Notify staff</label></div>
        <div className="simple-form-actions"><button type="button" className="simple-secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="simple-primary" disabled={busy}>{busy?"Creating…":"Create event"}</button></div>
      </form>
    </Dialog>
  </div>;
}
