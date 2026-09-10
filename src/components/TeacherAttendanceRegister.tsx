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
  const [savedStatuses, setSavedStatuses] = useState<StatusMap>({});
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
    const map = Object.fromEntries(next.rows.map((row) => [row.id, row.status || ""])) as StatusMap;
    setData(next);
    setClassId(next.classId);
    setDate(next.date);
    setStatuses(map);
    setSavedStatuses(map);
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
  const changed = useMemo(() => Object.keys(statuses).filter((id) => statuses[id] !== savedStatuses[id]).length, [statuses, savedStatuses]);
  const verifiedCount = useMemo(() => data?.rows.filter((row) => row.lockedPresent).length ?? 0, [data]);

  function setStatus(id: string, status: "present" | "absent") {
    const row = data?.rows.find((item) => item.id === id);
    if (row?.lockedPresent && status === "absent") return;
    setStatuses((current) => ({ ...current, [id]: status }));
    setNotice("");
  }
  function markVisible(status: "present" | "absent") {
    setStatuses((current) => {
      const next = { ...current };
      for (const row of filtered) if (!(row.lockedPresent && status === "absent")) next[row.id] = status;
      return next;
    });
    setNotice("");
  }

  async function save() {
    if (!data || counts.unmarked) { setError(`Mark every learner before submitting. ${counts.unmarked} remain.`); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await json("/api/teacher/attendance-register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, date, entries: data.rows.map((row) => ({ studentId: row.id, status: statuses[row.id] })) }),
      });
      setNotice(result.message || "Attendance submitted and recorded.");
      await load(classId, date);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit register."); }
    finally { setBusy(false); }
  }

  const blocked = Boolean(data && (!data.schoolDay || data.calendarBlocked));
  const canSubmit = Boolean(data?.rows.length) && !blocked && counts.unmarked === 0 && !busy;

  return <div className="tar-page">
    <section className="tar-hero"><div><span>DAILY CLASS ATTENDANCE</span><h1>Tick Present or Absent. Submit once.</h1><p>Device-verified arrivals appear automatically as Present. If no attendance device is installed, use this same class list as the official daily register.</p></div><div className="tar-shield"><ShieldCheck size={22}/><b>{verifiedCount} device-verified today</b><small>Verified arrivals are locked as Present so a manual register cannot accidentally turn them into absences.</small></div></section>
    {error ? <div className="tar-alert bad" role="alert">{error}</div> : null}{notice ? <div className="tar-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}

    <section className="tar-controls"><label><span>Class</span><select value={classId} onChange={(event) => { const value = event.target.value; setClassId(value); void load(value, date).catch((cause) => setError(cause.message)); }}>{data?.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name} · {item._count.students}</option>)}</select></label><label><span>Date</span><input type="date" value={date} onChange={(event) => { const value = event.target.value; setDate(value); void load(classId, value).catch((cause) => setError(cause.message)); }}/></label><div className="tar-day-state"><CalendarDays size={17}/><div><b>{data?.schoolDay ? data.calendarBlocked ? "School closed" : "School day" : "Not a school day"}</b><span>{data?.calendarBlocked ? "A holiday or school-calendar closure blocks attendance on this date." : data?.schoolDay ? `School timezone: ${data.timezone}` : "Saturday/Sunday or another disabled school day cannot receive attendance."}</span></div></div></section>

    <section className="tar-metrics"><article><CheckCircle2/><div><strong>{counts.present}</strong><span>Present</span></div></article><article><UserX/><div><strong>{counts.absent}</strong><span>Absent</span></div></article><article><Clock3/><div><strong>{counts.unmarked}</strong><span>Still to mark</span></div></article><article><UsersRound/><div><strong>{data?.rows.length ?? 0}</strong><span>Class total</span></div></article></section>

    <section className="tar-card"><header><div><span>REGISTER · {date}</span><h2>{data?.classes.find((item) => item.id === classId)?.name || "Choose a class"}</h2></div><div className="tar-actions"><button type="button" disabled={blocked} onClick={() => markVisible("present")}><Check size={15}/>Mark visible Present</button><button type="button" disabled={blocked} onClick={() => markVisible("absent")}><UserX size={15}/>Mark visible Absent</button></div></header>
      <div className="tar-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner or admission number"/><span>{filtered.length} shown</span></div>
      {blocked ? <div className="tar-blocked"><CalendarDays size={30}/><b>{data?.calendarBlocked ? "Attendance is closed for this calendar date." : "This is not a configured school day."}</b><span>School leadership controls school days and holidays. No attendance record can be changed here.</span></div> : <div className="tar-roster">{filtered.map((row, index) => <article key={row.id}><span className="tar-index">{String(index + 1).padStart(2, "0")}</span><span className="tar-avatar">{row.photoUrl ? <img src={row.photoUrl} alt=""/> : row.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span><div className="tar-person"><b>{row.name}</b><span>{row.admissionNo}{row.lockedPresent ? " · device verified" : row.source !== "unmarked" ? ` · ${row.source} record` : ""}{row.isLate ? " · late" : ""}</span></div><div className="tar-toggle" role="group" aria-label={`Attendance for ${row.name}`}><button type="button" className={statuses[row.id] === "present" ? "yes active" : "yes"} onClick={() => setStatus(row.id, "present")}><Check size={16}/>Present</button><button type="button" disabled={row.lockedPresent} className={statuses[row.id] === "absent" ? "no active" : "no"} onClick={() => setStatus(row.id, "absent")}><UserX size={16}/>Absent</button></div></article>)}</div>}

      {!blocked ? <div className="tar-submit-bar"><div><span>{counts.unmarked ? `${counts.unmarked} learner${counts.unmarked === 1 ? "" : "s"} still need a decision.` : changed ? `${changed} attendance change${changed === 1 ? "" : "s"} ready to submit.` : "The register is complete."}</span><small>{verifiedCount ? `${verifiedCount} verified device arrival${verifiedCount === 1 ? "" : "s"} will remain protected.` : "No device verification is required to use this manual register."}</small></div><button type="button" disabled={!canSubmit} onClick={() => void save()}><Save size={16}/>{busy ? "Submitting…" : "Submit attendance"}</button></div> : null}
    </section>
  </div>;
}
