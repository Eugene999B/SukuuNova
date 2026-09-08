"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Plus, Printer, RefreshCw, Sparkles, X } from "lucide-react";

type ClassItem = { id: string; name: string; level: string | null };
type Person = { id: string; name: string };
type Slot = {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
  venue?: string | null;
  class: ClassItem;
  subject: Person;
  teacher: Person;
};
type Period = { period: number; start: string; end: string };
type Day = { dayOfWeek: number; name: string; enabled: boolean; periods?: Period[] };
type TimetableConfig = { days: Day[]; periods?: Period[]; periodsPerDay: number; periodMinutes: number; breaks?: { name: string; start: string; end: string }[] };
type Data = {
  school: { name: string; uniqueCode: string; logoUrl?: string | null } | null;
  classes: ClassItem[];
  subjects: Person[];
  teachers: Person[];
  slots: Slot[];
  timetableConfig: TimetableConfig;
};

type Editor = { day: number; period: number; slot?: Slot };

function toMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function buildPeriods(config: TimetableConfig, day?: Day) {
  if (day?.periods?.length) return day.periods.slice(0, Math.min(16, config.periodsPerDay));
  if (config.periods?.length) return config.periods.slice(0, Math.min(16, config.periodsPerDay));
  const start = toMinutes("08:00");
  return Array.from({ length: Math.min(16, Math.max(1, config.periodsPerDay || 8)) }, (_, index) => {
    const s = start + index * (config.periodMinutes || 40);
    return { period: index + 1, start: fromMinutes(s), end: fromMinutes(s + (config.periodMinutes || 40)) };
  });
}

export default function TimetableWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"class" | "teacher">("class");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [generating, setGenerating] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phase2/timetable", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not load timetable.");
      setData(payload);
      setSelectedClass((current) => current || payload.classes?.[0]?.id || "");
      setSelectedTeacher((current) => current || payload.teachers?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const days = useMemo(() => data?.timetableConfig.days.filter((day) => day.enabled).sort((a, b) => a.dayOfWeek - b.dayOfWeek) ?? [], [data]);
  const periods = useMemo(() => buildPeriods(data?.timetableConfig ?? { days: [], periodsPerDay: 8, periodMinutes: 40 }, days[0]), [data, days]);
  const activeId = view === "class" ? selectedClass : selectedTeacher;
  const activeName = view === "class"
    ? data?.classes.find((item) => item.id === selectedClass)?.name ?? "Choose a class"
    : data?.teachers.find((item) => item.id === selectedTeacher)?.name ?? "Choose a teacher";

  const visibleSlots = useMemo(() => {
    if (!data || !activeId) return [];
    return data.slots.filter((slot) => view === "class" ? slot.classId === activeId : slot.teacherId === activeId);
  }, [data, activeId, view]);
  const slotMap = useMemo(() => new Map(visibleSlots.map((slot) => [`${slot.dayOfWeek}:${slot.period}`, slot])), [visibleSlots]);

  const action = async (body: unknown) => {
    const response = await fetch("/api/phase2/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Timetable action failed.");
    return payload;
  };

  const generate = async () => {
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/school/academic-engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          replaceExisting: false,
          classIds: view === "class" && selectedClass ? [selectedClass] : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Timetable generation failed.");
      setNotice(payload.message || `Generated ${payload.scheduled ?? "the timetable"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Timetable generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="tt-modern-loading"><Clock3 size={18} /><div><strong>Loading timetable</strong><span>Getting the latest classes, teachers and lessons…</span></div></div>;
  }

  if (!data) {
    return <div className="tt-modern-error"><strong>Timetable could not be loaded</strong><p>{error || "Please try again."}</p><button className="tt-btn primary" onClick={() => void load()}>Try again</button></div>;
  }

  const printUrl = view === "teacher"
    ? `/school/timetable/print?view=teacher&teacherId=${encodeURIComponent(selectedTeacher)}`
    : `/school/timetable/print?view=class&classId=${encodeURIComponent(selectedClass)}`;

  return (
    <div className="tt-modern-workspace">
      <header className="tt-modern-header">
        <div>
          <span className="tt-eyebrow"><CalendarDays size={14} /> TIMETABLE</span>
          <h1>{activeName}</h1>
          <p>See the actual weekly timetable first. Generate or print it when it is ready.</p>
        </div>
        <div className="tt-header-actions">
          <a className="tt-btn ghost" href={printUrl}><Printer size={15} /> Print timetable</a>
          <button className="tt-btn primary" disabled={generating} onClick={() => void generate()}><Sparkles size={15} />{generating ? "Generating…" : "Generate timetable"}</button>
        </div>
      </header>

      {notice ? <div className="tt-alert success"><Check size={15} />{notice}</div> : null}
      {error ? <div className="tt-alert error"><X size={15} />{error}</div> : null}

      {!days.length || !periods.length ? (
        <section className="tt-selection-empty">
          <CalendarDays size={24} />
          <h2>No timetable schedule is configured yet</h2>
          <p>Set the school's working days and teaching periods in Academic Setup, then return here to generate the timetable.</p>
          <a className="tt-btn primary" href="/school/academics/setup">Open academic setup</a>
        </section>
      ) : (
        <>
          <section className="tt-control-bar">
            <div className="tt-view-switch">
              <button className={view === "class" ? "active" : ""} onClick={() => setView("class")}>Class timetable</button>
              <button className={view === "teacher" ? "active" : ""} onClick={() => setView("teacher")}>Teacher timetable</button>
            </div>
            {view === "class" ? (
              <select aria-label="Choose class" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
                {data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}
              </select>
            ) : (
              <select aria-label="Choose teacher" value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}>
                {data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <span className="tt-toolbar-meta">{days.length} days · {periods.length} periods</span>
            <button className="tt-icon-btn" onClick={() => void load()} aria-label="Refresh timetable"><RefreshCw size={15} /></button>
          </section>

          <section className="tt-grid-card">
            <div className="tt-grid-heading">
              <div><span className="tt-eyebrow">WEEKLY TIMETABLE</span><h2>{activeName}</h2><p>Day, time, subject and teacher are shown together in every lesson.</p></div>
            </div>
            <div className="tt-table-scroll">
              <table className="tt-simple-table">
                <thead><tr><th>Period</th>{days.map((day) => <th key={day.dayOfWeek}>{day.name}</th>)}</tr></thead>
                <tbody>
                  {periods.map((period) => (
                    <tr key={period.period}>
                      <th><strong>Period {period.period}</strong><span>{formatTime(period.start)}–{formatTime(period.end)}</span></th>
                      {days.map((day) => {
                        const slot = slotMap.get(`${day.dayOfWeek}:${period.period}`);
                        return (
                          <td key={`${day.dayOfWeek}:${period.period}`}>
                            {slot ? (
                              <button className="tt-simple-lesson filled" onClick={() => setEditor({ day: day.dayOfWeek, period: period.period, slot })}>
                                <strong>{slot.subject.name}</strong>
                                <span>{view === "class" ? slot.teacher.name : slot.class.name}</span>
                                {slot.venue ? <small>{slot.venue.replace(/^room:/, "")}</small> : null}
                              </button>
                            ) : (
                              <button className="tt-simple-lesson empty" onClick={() => setEditor({ day: day.dayOfWeek, period: period.period })}><Plus size={13} /> Add lesson</button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {editor ? <LessonEditor data={data} value={editor} close={() => setEditor(null)} done={async () => { setEditor(null); await load(); }} action={action} /> : null}
    </div>
  );
}

function LessonEditor({ data, value, close, done, action }: { data: Data; value: Editor; close: () => void; done: () => Promise<void>; action: (body: unknown) => Promise<unknown> }) {
  const slot = value.slot;
  const [classId, setClassId] = useState(slot?.classId || data.classes[0]?.id || "");
  const [subjectId, setSubjectId] = useState(slot?.subjectId || "");
  const [teacherId, setTeacherId] = useState(slot?.teacherId || "");
  const [venue, setVenue] = useState(slot?.venue?.replace(/^room:/, "") || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const run = async (body: unknown) => {
    setBusy(true);
    setMessage("");
    try { await action(body); await done(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save the lesson."); }
    finally { setBusy(false); }
  };

  return (
    <div className="tt-drawer">
      <aside className="tt-drawer-panel">
        <div className="tt-drawer-head">
          <div><span className="tt-eyebrow">{slot ? "LESSON" : "ADD LESSON"}</span><h2>{slot?.subject.name || "Add a lesson"}</h2><p>Period {value.period} · {data.timetableConfig.days.find((day) => day.dayOfWeek === value.day)?.name}</p></div>
          <button className="tt-close" onClick={close} aria-label="Close"><X size={17} /></button>
        </div>
        {slot ? (
          <div className="tt-form"><div className="tt-form-note">{slot.class.name} · {slot.teacher.name}{slot.venue ? ` · ${slot.venue.replace(/^room:/, "")}` : ""}</div><div className="tt-form-actions"><button className="tt-btn danger" disabled={busy} onClick={() => void run({ action: "deleteSlot", slotId: slot.id })}>Delete lesson</button><button className="tt-btn ghost" onClick={close}>Close</button></div></div>
        ) : (
          <div className="tt-form">
            <label>Class<select value={classId} onChange={(event) => setClassId(event.target.value)}>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Choose subject</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Teacher<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Choose teacher</option>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Room / venue<input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Optional" /></label>
            <div className="tt-form-actions"><button className="tt-btn ghost" onClick={close}>Cancel</button><button className="tt-btn primary" disabled={busy || !classId || !subjectId || !teacherId} onClick={() => void run({ action: "saveSlot", classId, subjectId, teacherId, dayOfWeek: value.day, period: value.period, venue: venue || undefined })}>Add lesson</button></div>
          </div>
        )}
        {message ? <div className="tt-alert error" role="alert"><X size={13} />{message}</div> : null}
      </aside>
    </div>
  );
}
