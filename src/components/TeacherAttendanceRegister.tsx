"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, Clock3, Save, Search, ShieldCheck, UserX, UsersRound } from "lucide-react";

type ClassRow = { id: string; name: string; level: string | null; _count: { students: number } };
type Row = { id: string; name: string; admissionNo: string; photoUrl: string | null; status: "present" | "absent" | null; source: "device" | "teacher" | "manual" | "unmarked"; lockedPresent: boolean; isLate: boolean };
type Data = { classes: ClassRow[]; classId: string; date: string; timezone: string; schoolDays: number[]; schoolDay: boolean; calendarBlocked: boolean; rows: Row[] };

type StatusMap = Record<string, "present" | "absent" | "">;

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Request failed.");
  return body;
}

export default function TeacherAttendanceRegister() {
  const [data, setData] = useState<Data | null>(null);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(nextClass = classId, nextDate = date) {
    setError("");
    const params = new URLSearchParams();
    if (nextClass) params.set("classId", nextClass);
    if (nextDate) params.set("date", nextDate);
    const next = await json(`/api/teacher/attendance-register?${params.toString()}`) as Data;
    setData(next); setClassId(next.classId); setDate(next.date);
    setStatuses(Object.fromEntries(next.rows.map((row) => [row.id, row.status || ""])));
  }
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load attendance.")); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data) return [];
    return needle ? data.rows.filter((row) => `${row.name} ${row.admissionNo}`.toLowerCase().includes(needle)) : data.rows;
  }, [data, query]);
  const counts = useMemo(() => {
    const values = Object.values(statuses);
    return { present: values.filter((value) => value === "present").length, absent: values.filter((value) => value === "absent").length, unmarked: values.filter((value) => !value).length };
  }, [statuses]);

  function setStatus(id: string, status: "present" | "absent") {
    const row = data?.rows.find((item) => item.id === id);
    if (row?.lockedPresent && status === "absent") return;
    setStatuses((current) => ({ ...current, [id]: status })); setNotice("");
  }
  function markVisible(status: "present" | "absent") {
    setStatuses((current) => {
      const next = { ...current };
      for (const row of filtered) if (!(row.lockedPresent && status === "absent")) next[row.id] = status;
      return next;
    });
  }

  async function save() {
    if (!data || counts.unmarked) { setError(`Mark every learner before saving. ${counts.unmarked} remain.`); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await json("/api/teacher/attendance-register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, date, entries: data.rows.map((row) => ({ studentId: row.id, status: statuses[row.id] })) }),
      });
      setNotice(result.message || "Register saved."); await load(classId, date);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save register."); }
    finally { setBusy(false); }
  }

  const blocked = Boolean(data && (!data.schoolDay || data.calendarBlocked));
  return <div className="tar-page">
    <section className="tar-hero"><div><span>DAILY CLASS REGISTER</span><h1>One class. One glance. Everyone accounted for.</h1><p>Mark the full class Present or Absent, then change only the exceptions. Verified device arrivals stay protected from accidental absence marking.</p></div><div className="tar-shield"><ShieldCheck size={22}/><b>Teacher scope locked</b><small>Only classes you are authorised to register appear here.</small></div></section>
    {error ? <div className="tar-alert bad" role="alert">{error}</div> : null}{notice ? <div className="tar-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}
    <section className="tar-controls"><label><span>Class</span><select value={classId} onChange={(event) => { const value=event.target.value; setClassId(value); void load(value,date).catch((cause)=>setError(cause.message)); }}>{data?.classes.map((item)=><option key={item.id} value={item.id}>{item.level?`${item.level} · `:""}{item.name} · {item._count.students}</option>)}</select></label><label><span>Date</span><input type="date" value={date} onChange={(event)=>{const value=event.target.value;setDate(value);void load(classId,value).catch((cause)=>setError(cause.message));}}/></label><div className="tar-day-state"><CalendarDays size={17}/><div><b>{data?.schoolDay ? data.calendarBlocked ? "Calendar closed" : "School day" : "Not a school day"}</b><span>{data?.calendarBlocked ? "A school calendar event blocks attendance on this date." : data?.schoolDay ? `Timezone: ${data.timezone}` : "Attendance is disabled by the school-week configuration."}</span></div></div></section>
    <section className="tar-metrics"><article><CheckCircle2/><div><strong>{counts.present}</strong><span>Present</span></div></article><article><UserX/><div><strong>{counts.absent}</strong><span>Absent</span></div></article><article><Clock3/><div><strong>{counts.unmarked}</strong><span>Unmarked</span></div></article><article><UsersRound/><div><strong>{data?.rows.length ?? 0}</strong><span>Class total</span></div></article></section>
    <section className="tar-card"><header><div><span>REGISTER · {date}</span><h2>{data?.classes.find((item)=>item.id===classId)?.name || "Choose a class"}</h2></div><div className="tar-actions"><button type="button" disabled={blocked} onClick={()=>markVisible("present")}>Mark visible present</button><button type="button" disabled={blocked} onClick={()=>markVisible("absent")}>Mark visible absent</button><button className="primary" disabled={busy||blocked||counts.unmarked>0||!data?.rows.length} onClick={()=>void save()}><Save size={15}/>{busy?"Saving…":"Save register"}</button></div></header><div className="tar-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search learner or admission number"/><span>{filtered.length} shown</span></div>
      {blocked ? <div className="tar-blocked"><CalendarDays size={30}/><b>{data?.calendarBlocked ? "Attendance is closed for this calendar date." : "This is not a configured school day."}</b><span>School leadership controls school days and holidays. No attendance record can be changed here.</span></div> : <div className="tar-roster">{filtered.map((row,index)=><article key={row.id}><span className="tar-index">{String(index+1).padStart(2,"0")}</span><span className="tar-avatar">{row.photoUrl?<img src={row.photoUrl} alt=""/>:row.name.split(/\s+/).map((part)=>part[0]).slice(0,2).join("")}</span><div className="tar-person"><b>{row.name}</b><span>{row.admissionNo}{row.lockedPresent?" · verified by attendance device":row.source!=="unmarked"?` · ${row.source} record`:""}{row.isLate?" · late":""}</span></div><div className="tar-toggle" role="group" aria-label={`Attendance for ${row.name}`}><button type="button" className={statuses[row.id]==="present"?"yes active":"yes"} onClick={()=>setStatus(row.id,"present")}><Check size={16}/>Present</button><button type="button" disabled={row.lockedPresent} className={statuses[row.id]==="absent"?"no active":"no"} onClick={()=>setStatus(row.id,"absent")}><UserX size={16}/>Absent</button></div></article>)}</div>}
    </section>
  </div>;
}
