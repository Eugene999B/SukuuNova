"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Megaphone, Search, Send, UsersRound } from "lucide-react";

type ClassRow = { id: string; name: string; level: string | null };
type Student = { id: string; name: string; admissionNo: string; classId: string | null; photoUrl: string | null };
type Announcement = { id: string; title: string; body: string; audienceLabel: string; priority: string; recipientCount: number; createdAt: string };
type Data = { classes: ClassRow[]; students: Student[]; announcements: Announcement[] };

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Request failed.");
  return body;
}

export default function TeacherAnnouncementsDesk() {
  const [data, setData] = useState<Data>({ classes: [], students: [], announcements: [] });
  const [classId, setClassId] = useState("");
  const [audience, setAudience] = useState<"class" | "selected">("class");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const next = await request("/api/teacher/announcements", { cache: "no-store" }) as Data;
      setData(next);
      setClassId((current) => current && next.classes.some((item) => item.id === current) ? current : next.classes[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load announcements."); }
  }
  useEffect(() => { void load(); }, []);

  const classStudents = useMemo(() => data.students.filter((student) => student.classId === classId), [data.students, classId]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return classStudents;
    return classStudents.filter((student) => `${student.name} ${student.admissionNo}`.toLowerCase().includes(needle));
  }, [classStudents, query]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((student) => selected.includes(student.id));

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await request("/api/teacher/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, audience, studentIds: audience === "selected" ? selected : [], title, body, priority }),
      });
      setMessage(result.message || "Announcement delivered.");
      setTitle(""); setBody(""); setSelected([]); setPriority("normal");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Announcement could not be sent."); }
    finally { setBusy(false); }
  }

  return (
    <div className="teacher-announce-page">
      <section className="teacher-announce-hero">
        <div><span>CLASS COMMUNICATION STUDIO</span><h1>Send one clear announcement to the right learners.</h1><p>Choose one of your classes, send to everyone or select individual learners. Guardian delivery is deduplicated and auditable.</p></div>
        <div className="teacher-announce-stat"><Megaphone size={21}/><strong>{data.announcements.length}</strong><small>recent announcement deliveries</small></div>
      </section>
      {error ? <div className="teacher-announce-alert bad" role="alert">{error}</div> : null}
      {message ? <div className="teacher-announce-alert good" role="status"><CheckCircle2 size={16}/>{message}</div> : null}

      <section className="teacher-announce-grid">
        <form className="teacher-announce-card" onSubmit={send}>
          <header><span>01 · AUDIENCE</span><h2>Who should receive this?</h2></header>
          <label>Class<select value={classId} onChange={(event) => { setClassId(event.target.value); setSelected([]); }} required>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
          <div className="teacher-announce-choice">
            <button type="button" className={audience === "class" ? "active" : ""} onClick={() => setAudience("class")}><UsersRound size={17}/><b>Entire class</b><span>{classStudents.length} learners</span></button>
            <button type="button" className={audience === "selected" ? "active" : ""} onClick={() => setAudience("selected")}><CheckCircle2 size={17}/><b>Selected learners</b><span>{selected.length} chosen</span></button>
          </div>
          {audience === "selected" ? <div className="teacher-announce-roster"><div className="teacher-announce-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or admission number"/><button type="button" onClick={() => setSelected((current) => allFilteredSelected ? current.filter((id) => !filtered.some((student) => student.id === id)) : Array.from(new Set([...current, ...filtered.map((student) => student.id)])))}>{allFilteredSelected ? "Clear visible" : "Select visible"}</button></div>{filtered.map((student) => <button type="button" key={student.id} className={selected.includes(student.id) ? "selected" : ""} onClick={() => toggle(student.id)}><span className="teacher-announce-avatar">{student.photoUrl ? <img src={student.photoUrl} alt=""/> : student.name.split(/\s+/).map((part) => part[0]).slice(0,2).join("")}</span><span><b>{student.name}</b><small>{student.admissionNo}</small></span><i>{selected.includes(student.id) ? "✓" : "+"}</i></button>)}</div> : null}

          <header><span>02 · MESSAGE</span><h2>Write the announcement</h2></header>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={160} placeholder="e.g. Science practical materials for Friday"/></label>
          <label>Announcement<textarea value={body} onChange={(event) => setBody(event.target.value)} required minLength={2} maxLength={8000} rows={8} placeholder="Write clear instructions, dates and what learners or families should do."/></label>
          <button className="teacher-announce-send" disabled={busy || !classId || (audience === "selected" && !selected.length)}><Send size={16}/>{busy ? "Delivering…" : audience === "class" ? `Send to class families` : `Send for ${selected.length} learner${selected.length === 1 ? "" : "s"}`}</button>
        </form>

        <aside className="teacher-announce-card teacher-announce-history">
          <header><span>RECENT DELIVERY</span><h2>Your announcement history</h2></header>
          {data.announcements.length ? data.announcements.slice(0, 25).map((item) => <article key={item.id}><div><b>{item.title}</b><span className={`priority ${item.priority}`}>{item.priority}</span></div><p>{item.body}</p><footer><span>{item.audienceLabel}</span><span>{item.recipientCount} guardian account{item.recipientCount === 1 ? "" : "s"}</span><span>{new Date(item.createdAt).toLocaleString("en-GH")}</span></footer></article>) : <div className="teacher-announce-empty"><Megaphone size={30}/><b>No announcements sent yet.</b><span>Your class communication history will appear here.</span></div>}
        </aside>
      </section>
    </div>
  );
}
