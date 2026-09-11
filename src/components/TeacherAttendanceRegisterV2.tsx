"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, Save, Search, ShieldCheck, UserX, UsersRound, Wifi } from "lucide-react";

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

export default function TeacherAttendanceRegisterV2() {
  const [data, setData] = useState<Data | null>(null);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  async function load(nextClass = classId, nextDate = date) {
    setError("");
    const params = new URLSearchParams();
    if (nextClass) params.set("classId", nextClass);
    if (nextDate) params.set("date", nextDate);
    const next = await json(`/api/teacher/attendance-register?${params.toString()}`) as Data;
    setData(next);
    setClassId(next.classId);
    setDate(next.date);
    setStatuses(Object.fromEntries(next.rows.map((row) => [row.id, row.status || ""])));
    setDirty(false);
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load attendance.")); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!data) return [];
    return needle ? data.rows.filter((row) => `${row.name} ${row.admissionNo}`.toLowerCase().includes(needle)) : data.rows;
  }, [data, query]);

  const counts = useMemo(() => {
    const rows = data?.rows || [];
    return {
      present: rows.filter((row) => statuses[row.id] === "present").length,
      absent: rows.filter((row) => statuses[row.id] === "absent").length,
      unmarked: rows.filter((row) => !statuses[row.id]).length,
      verified: rows.filter((row) => row.lockedPresent).length,
    };
  }, [data, statuses]);

  const blocked = Boolean(data && (!data.schoolDay || data.calendarBlocked));

  function setStatus(row: Row, status: "present" | "absent") {
    if (row.lockedPresent && status === "absent") return;
    setStatuses((current) => ({ ...current, [row.id]: status }));
    setDirty(true);
    setNotice("");
  }

  function markRemainingPresent() {
    if (!data) return;
    setStatuses((current) => {
      const next = { ...current };
      data.rows.forEach((row) => { if (!next[row.id]) next[row.id] = "present"; });
      return next;
    });
    setDirty(true);
  }

  function markVisible(status: "present" | "absent") {
    setStatuses((current) => {
      const next = { ...current };
      filtered.forEach((row) => { if (!(row.lockedPresent && status === "absent")) next[row.id] = status; });
      return next;
    });
    setDirty(true);
  }

  async function submitRegister() {
    if (!data) return;
    if (counts.unmarked) { setError(`${counts.unmarked} learner${counts.unmarked === 1 ? " is" : "s are"} still unanswered. Choose Yes or No for everyone, or use “Mark remaining Yes”.`); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await json("/api/teacher/attendance-register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, date, entries: data.rows.map((row) => ({ studentId: row.id, status: statuses[row.id] })) }),
      });
      setNotice(result.message || "Attendance submitted successfully.");
      await load(classId, date);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit attendance."); }
    finally { setBusy(false); }
  }

  return <main className="tar2-page">
    <section className="tar2-hero">
      <div><span>DAILY CLASS ATTENDANCE</span><h1>Was each learner in school today?</h1><p>Choose <b>Yes</b> or <b>No</b> beside each learner, then press <b>Submit attendance</b>. If an attendance device has already verified a learner, SukuuNova records that automatically and protects the verified result.</p></div>
      <aside><ShieldCheck size={22}/><strong>One final submission</strong><small>Your choices stay on screen until you submit the full register.</small></aside>
    </section>

    {error ? <div className="tar2-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="tar2-alert good" role="status"><CheckCircle2 size={17}/>{notice}</div> : null}

    <section className="tar2-controls">
      <label>Class<select value={classId} onChange={(event) => { const value = event.target.value; setClassId(value); void load(value, date).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not change class.")); }}>{data?.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name} · {item._count.students} learners</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={(event) => { const value = event.target.value; setDate(value); void load(classId, value).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not change date.")); }}/></label>
      <div className="tar2-day"><CalendarDays size={18}/><div><strong>{data?.calendarBlocked ? "School calendar closed" : data?.schoolDay ? "School day" : "Not a school day"}</strong><small>{data?.calendarBlocked ? "Leadership has marked this date as a holiday or closure." : data?.schoolDay ? `Working calendar · ${data.timezone}` : "Attendance is disabled by the school's working-week settings."}</small></div></div>
    </section>

    <section className="tar2-summary">
      <article className="yes"><CheckCircle2/><div><strong>{counts.present}</strong><span>Yes · present</span></div></article>
      <article className="no"><UserX/><div><strong>{counts.absent}</strong><span>No · absent</span></div></article>
      <article><UsersRound/><div><strong>{counts.unmarked}</strong><span>Not answered</span></div></article>
      <article><Wifi/><div><strong>{counts.verified}</strong><span>Device verified</span></div></article>
    </section>

    <section className="tar2-register">
      <header><div><span>CLASS LIST · {date}</span><h2>{data?.classes.find((item) => item.id === classId)?.name || "Choose a class"}</h2><p>Question for every learner: <b>Present today?</b></p></div><div className="tar2-quick"><button disabled={blocked} onClick={markRemainingPresent}><Check size={15}/>Mark remaining Yes</button><button disabled={blocked} onClick={() => markVisible("present")}>Visible Yes</button><button disabled={blocked} onClick={() => markVisible("absent")}>Visible No</button></div></header>
      <div className="tar2-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner or admission number"/><span>{filtered.length} shown</span></div>
      {blocked ? <div className="tar2-blocked"><CalendarDays size={31}/><strong>{data?.calendarBlocked ? "Attendance is closed for this date." : "This is not a configured school day."}</strong><span>School leadership controls working days and holidays. No manual register can be submitted here.</span></div> : <div className="tar2-list">{filtered.map((row, index) => <article key={row.id}>
        <span className="tar2-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="tar2-avatar">{row.photoUrl ? <img src={row.photoUrl} alt=""/> : row.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
        <div className="tar2-person"><strong>{row.name}</strong><span>{row.admissionNo}{row.isLate ? " · late" : ""}</span>{row.lockedPresent ? <small><Wifi size={12}/>Verified automatically by attendance device</small> : row.source !== "unmarked" ? <small>Existing {row.source} record</small> : null}</div>
        <div className="tar2-question"><span>Present today?</span><div role="group" aria-label={`Present today: ${row.name}`}><button className={statuses[row.id] === "present" ? "yes active" : "yes"} onClick={() => setStatus(row, "present")}><Check size={17}/>Yes</button><button disabled={row.lockedPresent} className={statuses[row.id] === "absent" ? "no active" : "no"} onClick={() => setStatus(row, "absent")}><UserX size={17}/>No</button></div></div>
      </article>)}</div>}
    </section>

    {!blocked && data?.rows.length ? <div className="tar2-submitbar"><div><strong>{counts.unmarked ? `${counts.unmarked} learner${counts.unmarked === 1 ? "" : "s"} still need Yes or No` : "Register complete and ready"}</strong><small>{counts.present} present · {counts.absent} absent · {counts.verified} device verified{dirty ? " · unsaved changes" : ""}</small></div><button disabled={busy || counts.unmarked > 0} onClick={() => void submitRegister()}><Save size={17}/>{busy ? "Submitting…" : "Submit attendance"}</button></div> : null}
  </main>;
}
