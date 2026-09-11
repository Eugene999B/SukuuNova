"use client";

import Link from "next/link";
import {
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  LockKeyhole,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ClassItem = { id: string; name: string; level: string | null };
type Person = { id: string; name: string };
type TeachingAssignment = {
  classId: string;
  subjectId: string;
  teacherId: string;
  class: ClassItem;
  subject: Person;
  teacher: Person;
};
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
type Day = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: Period[] };
type TimetableConfig = {
  days: Day[];
  periodsPerDay: number;
  periodMinutes: number;
  published: boolean;
  printTheme?: string;
  breaks?: { name: string; start: string; end: string }[];
  rooms?: { id: string; name: string; type?: string }[];
};
type Data = {
  school: { name: string; uniqueCode: string; logoUrl?: string | null } | null;
  classes: ClassItem[];
  teachers: Person[];
  slots: Slot[];
  teachingAssignments: TeachingAssignment[];
  timetableConfig: TimetableConfig;
};
type Editor = { day: number; period: number; slot?: Slot };
type GridColumn =
  | { kind: "period"; period: number; start: string; end: string }
  | { kind: "break"; name: string; start: string; end: string };

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}
function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
function breakFitsDay(day: Day, column: Extract<GridColumn, { kind: "break" }>) {
  const dayStart = toMinutes(day.start);
  const dayEnd = toMinutes(day.end);
  return toMinutes(column.start) >= dayStart && toMinutes(column.end) <= dayEnd;
}
function displayVenue(value: string | null | undefined, config: TimetableConfig) {
  if (!value) return "";
  if (value.startsWith("room:")) {
    const id = value.slice(5);
    return config.rooms?.find((room) => room.id === id)?.name ?? id;
  }
  if (value.startsWith("type:")) return value.slice(5).replaceAll("_", " ");
  return value;
}

export default function TimetableWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"class" | "teacher">("class");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [changingState, setChangingState] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phase2/timetable", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not load timetable.");
      setData(payload);
      setSelectedClass((current) => current || payload.classes?.[0]?.id || "");
      setSelectedTeacher((current) => current || payload.teachers?.[0]?.id || "");
      if (new URLSearchParams(window.location.search).get("generated") === "1") {
        setNotice("The new timetable was generated successfully and is now published.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const days = useMemo(() => data?.timetableConfig.days.filter((day) => day.enabled).sort((a, b) => a.dayOfWeek - b.dayOfWeek) ?? [], [data]);
  const columns = useMemo<GridColumn[]>(() => {
    if (!data || !days.length) return [];
    const periodMap = new Map<number, Period>();
    for (const day of days) for (const period of day.periods ?? []) if (!periodMap.has(period.period)) periodMap.set(period.period, period);
    const entries: GridColumn[] = [
      ...[...periodMap.values()].map((period) => ({ kind: "period" as const, ...period })),
      ...(data.timetableConfig.breaks ?? []).map((item) => ({ kind: "break" as const, ...item })),
    ];
    return entries.sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || (a.kind === "break" ? 1 : -1));
  }, [data, days]);

  const activeId = view === "class" ? selectedClass : selectedTeacher;
  const activeName = view === "class"
    ? data?.classes.find((item) => item.id === selectedClass)?.name ?? "Choose a class"
    : data?.teachers.find((item) => item.id === selectedTeacher)?.name ?? "Choose a teacher";
  const visibleSlots = useMemo(() => {
    if (!data || !activeId) return [];
    return data.slots.filter((slot) => view === "class" ? slot.classId === activeId : slot.teacherId === activeId);
  }, [data, activeId, view]);
  const slotMap = useMemo(() => new Map(visibleSlots.map((slot) => [`${slot.dayOfWeek}:${slot.period}`, slot])), [visibleSlots]);
  const published = data?.timetableConfig.published ?? false;
  const canManuallyEdit = !published && view === "class";

  const setPublished = async (next: boolean) => {
    setChangingState(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/phase2/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPublished", published: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not change timetable editing state.");
      setNotice(next ? "Manual changes are finished. The timetable is published and locked again." : "Manual editing is open. Only configured class-subject-teacher assignments can be placed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change timetable editing state.");
    } finally { setChangingState(false); }
  };

  const action = async (body: unknown) => {
    const response = await fetch("/api/phase2/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Timetable action failed.");
    return payload;
  };

  if (loading) return <div className="tt-v4-loading"><Clock3 size={18} /><div><strong>Loading official timetable</strong><span>Reading the published schedule and school timetable settings…</span></div></div>;
  if (!data) return <div className="tt-v4-empty"><strong>Timetable could not be loaded.</strong><span>{error || "Please try again."}</span><button onClick={() => void load()}>Try again</button></div>;

  const printUrl = view === "teacher"
    ? `/school/timetable/print?view=teacher&teacherId=${encodeURIComponent(selectedTeacher)}`
    : `/school/timetable/print?view=class&classId=${encodeURIComponent(selectedClass)}`;

  if (!days.length || !columns.length) {
    return <div className="tt-v4-empty"><CalendarDays size={26} /><strong>Timetable setup is not complete.</strong><span>Configure the school week, periods, breaks and subject lesson requirements first.</span><Link href="/school/timetable/setup">Open Timetable Setup</Link></div>;
  }

  return (
    <div className="tt-v4">
      <header className="tt-v4-head">
        <div>
          <div className="tt-v4-eyebrow"><CalendarDays size={14} /> OFFICIAL SCHOOL TIMETABLE</div>
          <h1>{activeName}</h1>
          <p>{published ? "This is the current published timetable. It stays fixed until authorised leadership opens Change timetable." : "Manual editing is open. Finish changes when the timetable is ready to become official again."}</p>
        </div>
        <div className="tt-v4-actions">
          <Link href="/school/timetable/setup" className="secondary"><Settings2 size={15} /> Timetable setup</Link>
          <Link href={printUrl} className="secondary"><Printer size={15} /> Print timetable</Link>
          {published
            ? <button className="primary" disabled={changingState} onClick={() => void setPublished(false)}><Edit3 size={15} /> Change timetable</button>
            : <button className="primary" disabled={changingState || !data.slots.length} onClick={() => void setPublished(true)}><ShieldCheck size={15} /> Finish changes</button>}
        </div>
      </header>

      {notice ? <div className="tt-v4-notice success"><Check size={15} />{notice}</div> : null}
      {error ? <div className="tt-v4-notice error"><X size={15} />{error}</div> : null}

      <section className="tt-v4-summary">
        <div><span>{published ? <LockKeyhole size={16} /> : <Unlock size={16} />}</span><strong>{published ? "Published" : "Editing"}</strong><small>{published ? "Locked against accidental changes" : "Remember to finish changes"}</small></div>
        <div><span><CalendarDays size={16} /></span><strong>{days.length} days</strong><small>{columns.filter((item) => item.kind === "period").length} teaching periods in the longest day</small></div>
        <div><span><GraduationBadge /></span><strong>{data.slots.length} lessons</strong><small>Across the whole school timetable</small></div>
      </section>

      <section className="tt-v4-toolbar">
        <div className="tt-v4-switch"><button className={view === "class" ? "active" : ""} onClick={() => setView("class")}>Class timetable</button><button className={view === "teacher" ? "active" : ""} onClick={() => setView("teacher")}>Teacher timetable</button></div>
        {view === "class" ? <select aria-label="Choose class" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select> : <select aria-label="Choose teacher" value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <button className="tt-v4-refresh" onClick={() => void load()} aria-label="Refresh timetable"><RefreshCw size={15} /></button>
      </section>

      {!data.slots.length ? <section className="tt-v4-empty embedded"><strong>No timetable has been created yet.</strong><span>Use Timetable Setup to generate the official timetable automatically, or open manual design mode from setup.</span><Link href="/school/timetable/setup">Set up & generate timetable</Link></section> : null}

      <section className="tt-v4-sheet">
        <div className="tt-v4-sheet-title"><div><strong>{data.school?.name ?? "School"}</strong><span>{view === "class" ? `${activeName} · Class timetable` : `${activeName} · Teacher timetable`}</span></div><div>{published ? <><LockKeyhole size={13} /> Published timetable</> : <><Edit3 size={13} /> Manual design mode</>}</div></div>
        <div className="tt-v4-scroll">
          <table className="tt-v4-table">
            <thead><tr><th className="day-heading">DAY</th>{columns.map((column, index) => column.kind === "break" ? <th className="break-heading" key={`break-${column.name}-${index}`}><strong>{column.name}</strong><span>{formatTime(column.start)}–{formatTime(column.end)}</span></th> : <th key={`period-${column.period}-${index}`}><strong>Period {column.period}</strong><span>{formatTime(column.start)}–{formatTime(column.end)}</span></th>)}</tr></thead>
            <tbody>{days.map((day) => <tr key={day.dayOfWeek}><th className="day-cell"><strong>{day.name}</strong><span>{formatTime(day.start)}–{formatTime(day.end)}</span></th>{columns.map((column, index) => {
              if (column.kind === "break") return breakFitsDay(day, column) ? <td className="break-cell" key={`break-${day.dayOfWeek}-${index}`}><strong>{column.name}</strong></td> : <td className="unavailable-cell" key={`break-${day.dayOfWeek}-${index}`}><span>Not used</span></td>;
              const actualPeriod = day.periods?.find((item) => item.period === column.period);
              if (!actualPeriod) return <td className="unavailable-cell" key={`${day.dayOfWeek}:${column.period}`}><span>Not used</span></td>;
              const slot = slotMap.get(`${day.dayOfWeek}:${column.period}`);
              if (slot) return <td className={`lesson-cell ${canManuallyEdit ? "editable" : ""}`} key={`${day.dayOfWeek}:${column.period}`}><button type="button" disabled={!canManuallyEdit} onClick={() => canManuallyEdit && setEditor({ day: day.dayOfWeek, period: column.period, slot })}><strong>{slot.subject.name}</strong><span>{view === "class" ? slot.teacher.name : slot.class.name}</span>{slot.venue ? <small>{displayVenue(slot.venue, data.timetableConfig)}</small> : null}{actualPeriod.start !== column.start || actualPeriod.end !== column.end ? <small>{formatTime(actualPeriod.start)}–{formatTime(actualPeriod.end)}</small> : null}</button></td>;
              return <td className="empty-cell" key={`${day.dayOfWeek}:${column.period}`}>{canManuallyEdit ? <button type="button" onClick={() => setEditor({ day: day.dayOfWeek, period: column.period })}><Plus size={13} /> Place lesson</button> : <span>—</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
      </section>

      {!published ? <div className="tt-v4-edit-help"><Edit3 size={16} /><div><strong>Manual design mode is active.</strong><span>Click a class timetable cell to place or edit one of that class&apos;s existing subject-teacher assignments. Use “Finish changes” when the timetable is ready.</span></div></div> : null}
      {editor ? <LessonEditor data={data} classId={selectedClass} value={editor} close={() => setEditor(null)} done={async () => { setEditor(null); await load(); }} action={action} /> : null}
    </div>
  );
}

function GraduationBadge() {
  return <span aria-hidden="true">TT</span>;
}

function LessonEditor({ data, classId, value, close, done, action }: { data: Data; classId: string; value: Editor; close: () => void; done: () => Promise<void>; action: (body: unknown) => Promise<unknown> }) {
  const valid = data.teachingAssignments.filter((assignment) => assignment.classId === classId);
  const existingKey = value.slot ? `${value.slot.classId}:${value.slot.subjectId}:${value.slot.teacherId}` : "";
  const firstKey = valid[0] ? `${valid[0].classId}:${valid[0].subjectId}:${valid[0].teacherId}` : existingKey;
  const [assignmentValue, setAssignmentValue] = useState(existingKey || firstKey);
  const [venue, setVenue] = useState(displayVenue(value.slot?.venue, data.timetableConfig));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chosen = valid.find((assignment) => `${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}` === assignmentValue);
  const staleExisting = value.slot && !valid.some((assignment) => `${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}` === existingKey);

  const save = async () => {
    if (!chosen) { setError("Choose a valid subject and teacher assignment for this class."); return; }
    setSaving(true); setError("");
    try {
      await action({ action: value.slot ? "updateSlot" : "saveSlot", ...(value.slot ? { slotId: value.slot.id } : {}), classId: chosen.classId, subjectId: chosen.subjectId, teacherId: chosen.teacherId, dayOfWeek: value.day, period: value.period, venue: venue.trim() || undefined });
      await done();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save lesson."); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!value.slot) return;
    setSaving(true); setError("");
    try { await action({ action: "deleteSlot", slotId: value.slot.id }); await done(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove lesson."); }
    finally { setSaving(false); }
  };

  return <div className="tt-v4-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="tt-v4-modal" role="dialog" aria-modal="true" aria-labelledby="tt-v4-editor-title"><button className="close" type="button" onClick={close} aria-label="Close"><X size={17} /></button><span>MANUAL TIMETABLE</span><h2 id="tt-v4-editor-title">{value.slot ? "Edit placed lesson" : "Place a lesson"}</h2><p>Only subjects and teachers already assigned to this class can be used here. Change teaching assignments in Academic Setup, not in the timetable grid.</p>{error ? <div className="tt-v4-notice error">{error}</div> : null}{staleExisting ? <div className="tt-v4-notice error">This existing lesson no longer matches a current teaching assignment. Choose a valid assignment or remove the lesson.</div> : null}<label>Assigned subject & teacher<select value={assignmentValue} onChange={(event) => setAssignmentValue(event.target.value)}><option value="">Choose assignment</option>{valid.map((assignment) => { const key = `${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}`; return <option value={key} key={key}>{assignment.subject.name} — {assignment.teacher.name}</option>; })}</select></label><label>Room / venue (optional)<input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="e.g. Science Lab" /></label><div className="tt-v4-modal-actions">{value.slot ? <button className="danger" disabled={saving} onClick={() => void remove()}>Remove lesson</button> : null}<button className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving || !chosen} onClick={() => void save()}>{saving ? "Saving…" : "Save lesson"}</button></div></section></div>;
}
