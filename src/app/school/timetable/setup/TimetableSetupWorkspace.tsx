"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Palette,
  RefreshCw,
  Save,
  School2,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Period = { period: number; start: string; end: string };
type Day = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: Period[] };
type BreakItem = { name: string; start: string; end: string };
type Assignment = {
  classId: string;
  subjectId: string;
  teacherId: string;
  class: { id: string; name: string; level: string | null };
  subject: { id: string; name: string };
  teacher: { id: string; name: string; status: string };
};
type Timetable = {
  days: Day[];
  periodMinutes: number;
  breaks: BreakItem[];
  periodsPerDay: number;
  published: boolean;
  weeklyPeriods?: Record<string, number>;
  maxDailyPeriods?: Record<string, number>;
  printTheme?: "ghana_classic" | "modern_blue" | "heritage_green" | "minimal_mono";
  periods?: Period[];
  rooms?: { id: string; name: string; type?: string }[];
  teacherUnavailability?: Record<string, string[]>;
  roomRequirements?: Record<string, { roomType?: string; room?: string }>;
  doublePeriodSubjects?: Record<string, number>;
};
type Data = {
  timetable: Timetable;
  assessment: unknown;
  reportCard: unknown;
  assignments: Assignment[];
};

type Theme = Timetable["printTheme"];
const themes: Array<{ id: NonNullable<Theme>; name: string; detail: string }> = [
  { id: "ghana_classic", name: "Ghana Classic", detail: "Formal bordered school timetable inspired by familiar Ghanaian class timetables." },
  { id: "modern_blue", name: "Modern Blue", detail: "Clean contemporary school-office layout with stronger time headers." },
  { id: "heritage_green", name: "Heritage Green", detail: "Traditional academic document feel with a softer formal presentation." },
  { id: "minimal_mono", name: "Minimal Mono", detail: "Black-and-white friendly design for low-cost school printing." },
];

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return (hours || 0) * 60 + (mins || 0);
}
function clock(value: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && a.end > b.start;
}
function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
function keyFor(assignment: Pick<Assignment, "classId" | "subjectId" | "teacherId">) {
  return `${assignment.classId}:${assignment.subjectId}:${assignment.teacherId}`;
}
function buildPeriods(day: Day, timetable: Timetable) {
  const start = minutes(day.start);
  const end = minutes(day.end);
  const breaks = timetable.breaks
    .map((item) => ({ start: minutes(item.start), end: minutes(item.end) }))
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start);
  const result: Period[] = [];
  let cursor = start;
  let period = 1;
  while (period <= timetable.periodsPerDay && cursor + timetable.periodMinutes <= end) {
    const next = cursor + timetable.periodMinutes;
    const crossing = breaks.find((item) => overlaps({ start: cursor, end: next }, item));
    if (crossing) {
      cursor = crossing.end;
      continue;
    }
    result.push({ period, start: clock(cursor), end: clock(next) });
    cursor = next;
    period += 1;
  }
  return result;
}

export default function TimetableSetupWorkspace({ hasSchoolLogo }: { hasSchoolLogo: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/school/academic-engine", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || payload.message || "Could not load timetable setup.");
        setData(payload);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load timetable setup."))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { className: string; level: string | null; rows: Assignment[] }>();
    for (const assignment of data?.assignments ?? []) {
      const entry = map.get(assignment.classId) ?? { className: assignment.class.name, level: assignment.class.level, rows: [] };
      entry.rows.push(assignment);
      map.set(assignment.classId, entry);
    }
    return [...map.entries()].sort((a, b) => a[1].className.localeCompare(b[1].className));
  }, [data]);

  if (loading) return <div className="tt-setup-loading"><RefreshCw size={17} /> Loading timetable setup…</div>;
  if (!data) return <div className="tt-setup-error"><strong>Timetable setup could not be loaded.</strong><span>{error || "Please refresh and try again."}</span></div>;

  const timetable = data.timetable;
  const enabledDays = timetable.days.filter((day) => day.enabled);
  const generatedDays = timetable.days.map((day) => ({ ...day, periods: day.enabled ? buildPeriods(day, timetable) : [] }));
  const totalWeeklyCapacity = generatedDays.filter((day) => day.enabled).reduce((sum, day) => sum + (day.periods?.length ?? 0), 0);
  const classLoadProblems = grouped.flatMap(([classId, entry]) => {
    const target = entry.rows.reduce((sum, row) => sum + (timetable.weeklyPeriods?.[keyFor(row)] ?? 2), 0);
    return target > totalWeeklyCapacity ? [`${entry.className} needs ${target} lessons but only ${totalWeeklyCapacity} teaching slots are available.`] : [];
  });
  const ready = enabledDays.length > 0 && totalWeeklyCapacity > 0 && data.assignments.length > 0 && classLoadProblems.length === 0;

  const patchTimetable = (patch: Partial<Timetable>) => setData((current) => current ? { ...current, timetable: { ...current.timetable, ...patch } } : current);
  const updateDay = (dayOfWeek: number, patch: Partial<Day>) => patchTimetable({
    days: timetable.days.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day),
  });
  const updateBreak = (index: number, patch: Partial<BreakItem>) => patchTimetable({
    breaks: timetable.breaks.map((item, current) => current === index ? { ...item, ...patch } : item),
  });
  const updateLoad = (assignment: Assignment, weekly: number, daily?: number) => {
    const key = keyFor(assignment);
    patchTimetable({
      weeklyPeriods: { ...(timetable.weeklyPeriods ?? {}), [key]: Math.max(1, Math.min(10, weekly)) },
      ...(daily !== undefined ? { maxDailyPeriods: { ...(timetable.maxDailyPeriods ?? {}), [key]: Math.max(1, Math.min(6, daily)) } } : {}),
    });
  };

  const saveSetup = async () => {
    if (!enabledDays.length) throw new Error("Choose at least one teaching day.");
    if (!totalWeeklyCapacity) throw new Error("The current school hours, lesson length and breaks leave no teaching periods.");
    if (classLoadProblems.length) throw new Error(classLoadProblems[0]);
    const timetableToSave: Timetable = { ...timetable, days: generatedDays, periods: undefined };
    const response = await fetch("/api/school/academic-engine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", timetable: timetableToSave }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || payload.message || "Could not save timetable setup.");
    setData((current) => current ? { ...current, timetable: payload.timetable } : current);
    return payload;
  };

  const saveOnly = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      await saveSetup();
      setMessage("Timetable setup saved. The current published timetable has not been changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save timetable setup.");
    } finally { setBusy(false); }
  };

  const generate = async () => {
    if (!ready) {
      setError(classLoadProblems[0] || "Complete the timetable setup before generating.");
      return;
    }
    const confirmed = window.confirm("Generate a new official timetable from these settings? This will replace the current timetable and publish the new one when generation succeeds.");
    if (!confirmed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await saveSetup();
      const response = await fetch("/api/school/academic-engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", mode: "rebuild", dryRun: false }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Could not generate the timetable.");
      window.location.assign("/school/timetable?generated=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the timetable.");
    } finally { setBusy(false); }
  };

  const manual = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      await saveSetup();
      const response = await fetch("/api/phase2/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPublished", published: false }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.message || "Could not open manual timetable mode.");
      window.location.assign("/school/timetable?manual=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open manual timetable mode.");
    } finally { setBusy(false); }
  };

  return (
    <div className="tt-setup">
      <header className="tt-setup-head">
        <div>
          <Link href="/school/timetable" className="tt-setup-back"><ArrowLeft size={14} /> Back to timetable</Link>
          <span>OFFICIAL TIMETABLE SETUP</span>
          <h1>Tell SukuuNova how the school week works.</h1>
          <p>Subjects and teachers are not created here. This page reads the class-subject-teacher assignments already configured by the school and only asks for scheduling rules.</p>
        </div>
        <div className="tt-setup-status"><CheckCircle2 size={18} /><div><strong>{ready ? "Ready to generate" : "Setup needs attention"}</strong><span>{enabledDays.length} teaching days · {totalWeeklyCapacity} weekly slots per class · {data.assignments.length} teaching assignments</span></div></div>
      </header>

      {message ? <div className="tt-setup-feedback success">{message}</div> : null}
      {error ? <div className="tt-setup-feedback error">{error}</div> : null}
      {classLoadProblems.length ? <div className="tt-setup-feedback error">{classLoadProblems[0]}</div> : null}

      <section className="tt-setup-panel">
        <div className="tt-setup-title"><CalendarDays size={19} /><div><span>1 · SCHOOL WEEK</span><h2>Teaching days and school hours</h2><p>Choose the days the school teaches and the time lessons may run on each day.</p></div></div>
        <div className="tt-day-list">
          {timetable.days.map((day) => <div className={`tt-day-row ${day.enabled ? "enabled" : ""}`} key={day.dayOfWeek}>
            <label className="tt-day-toggle"><input type="checkbox" checked={day.enabled} onChange={(event) => updateDay(day.dayOfWeek, { enabled: event.target.checked })} /><strong>{day.name}</strong><span>{day.enabled ? "Teaching day" : "No classes"}</span></label>
            {day.enabled ? <div className="tt-day-times"><label>Starts<input type="time" value={day.start} onChange={(event) => updateDay(day.dayOfWeek, { start: event.target.value })} /></label><label>Ends<input type="time" value={day.end} onChange={(event) => updateDay(day.dayOfWeek, { end: event.target.value })} /></label></div> : null}
          </div>)}
        </div>
      </section>

      <section className="tt-setup-panel">
        <div className="tt-setup-title"><Clock3 size={19} /><div><span>2 · PERIODS & BREAKS</span><h2>Build the school bell schedule</h2><p>SukuuNova calculates the teaching periods from the school day, lesson length and breaks. You do not need to draw every cell.</p></div></div>
        <div className="tt-period-controls">
          <label>Length of one lesson<div><input type="number" min="20" max="180" value={timetable.periodMinutes} onChange={(event) => patchTimetable({ periodMinutes: Math.max(20, Math.min(180, Number(event.target.value))) })} /><span>minutes</span></div></label>
          <label>Maximum periods per day<div><input type="number" min="1" max="16" value={timetable.periodsPerDay} onChange={(event) => patchTimetable({ periodsPerDay: Math.max(1, Math.min(16, Number(event.target.value))) })} /><span>periods</span></div></label>
          <div className="tt-capacity"><span>Available weekly slots</span><strong>{totalWeeklyCapacity}</strong><small>Calculated across the enabled days after breaks.</small></div>
        </div>
        <div className="tt-break-heading"><div><strong>Breaks and non-teaching time</strong><span>Breaks are automatically excluded from lesson placement.</span></div><button type="button" onClick={() => patchTimetable({ breaks: [...timetable.breaks, { name: "Break", start: "10:00", end: "10:20" }] })}>+ Add break</button></div>
        <div className="tt-break-list">
          {timetable.breaks.map((item, index) => <div className="tt-break-row" key={`${item.name}-${index}`}><input aria-label="Break name" value={item.name} onChange={(event) => updateBreak(index, { name: event.target.value })} /><input aria-label="Break start" type="time" value={item.start} onChange={(event) => updateBreak(index, { start: event.target.value })} /><span>to</span><input aria-label="Break end" type="time" value={item.end} onChange={(event) => updateBreak(index, { end: event.target.value })} /><button type="button" aria-label={`Remove ${item.name}`} onClick={() => patchTimetable({ breaks: timetable.breaks.filter((_, current) => current !== index) })}>Remove</button></div>)}
        </div>
        <div className="tt-period-preview"><strong>Example period sequence</strong><div>{generatedDays.find((day) => day.enabled)?.periods?.map((period) => <span key={period.period}>P{period.period} · {formatTime(period.start)}–{formatTime(period.end)}</span>) ?? <span>No periods yet</span>}</div></div>
      </section>

      <section className="tt-setup-panel">
        <div className="tt-setup-title"><UserRoundCheck size={19} /><div><span>3 · SUBJECT LOAD</span><h2>How often should each assigned subject appear?</h2><p>These rows come directly from Academic Setup. Change the weekly lesson requirement here; change subjects or teachers in Academic Setup.</p></div></div>
        <div className="tt-assignment-note"><GraduationCap size={17} /><div><strong>No “Add subject” button here.</strong><span>A subject only belongs in the timetable after it has been assigned to a class and teacher.</span></div><Link href="/school/academics/setup">Change class/teacher assignments</Link></div>
        {grouped.length ? <div className="tt-class-loads">{grouped.map(([classId, entry]) => <div className="tt-class-load" key={classId}>
          <div className="tt-class-load-head"><div><strong>{entry.className}</strong><span>{entry.level || "Class"}</span></div><small>{entry.rows.reduce((sum, row) => sum + (timetable.weeklyPeriods?.[keyFor(row)] ?? 2), 0)} lessons/week requested</small></div>
          <div className="tt-load-table"><div className="tt-load-header"><span>Subject</span><span>Assigned teacher</span><span>Lessons / week</span><span>Max / day</span></div>{entry.rows.map((assignment) => {
            const key = keyFor(assignment); const weekly = timetable.weeklyPeriods?.[key] ?? 2; const daily = timetable.maxDailyPeriods?.[key] ?? Math.min(2, weekly);
            return <div className="tt-load-row" key={key}><strong>{assignment.subject.name}</strong><span>{assignment.teacher.name}</span><input aria-label={`${assignment.subject.name} lessons per week`} type="number" min="1" max="10" value={weekly} onChange={(event) => updateLoad(assignment, Number(event.target.value))} /><input aria-label={`${assignment.subject.name} maximum per day`} type="number" min="1" max="6" value={daily} onChange={(event) => updateLoad(assignment, weekly, Number(event.target.value))} /></div>;
          })}</div>
        </div>)}</div> : <div className="tt-empty-assignments"><strong>No teaching assignments yet.</strong><span>Assign subjects and teachers to classes in Academic Setup first. SukuuNova will then list them here automatically.</span><Link href="/school/academics/setup">Open Academic Setup</Link></div>}
      </section>

      <section className="tt-setup-panel">
        <div className="tt-setup-title"><Palette size={19} /><div><span>4 · PRINT DESIGN</span><h2>Choose how the official timetable should look</h2><p>The school logo from School Settings appears on the printed timetable. Choose a design suitable for notice boards and staff copies.</p></div></div>
        {!hasSchoolLogo ? <div className="tt-logo-warning"><School2 size={17} /><span>Add the official school logo in <Link href="/school/settings#school-profile">School Settings</Link> so printed timetables carry the school identity.</span></div> : null}
        <div className="tt-theme-grid">{themes.map((theme) => <button type="button" key={theme.id} className={(timetable.printTheme ?? "ghana_classic") === theme.id ? "selected" : ""} onClick={() => patchTimetable({ printTheme: theme.id })}><span className={`tt-theme-swatch ${theme.id}`} /><strong>{theme.name}</strong><small>{theme.detail}</small></button>)}</div>
      </section>

      <section className="tt-generate-panel">
        <div><span>5 · CREATE THE TIMETABLE</span><h2>{timetable.published ? "A timetable is currently published." : "Ready to create the official timetable?"}</h2><p>Automatic generation checks class clashes, teacher clashes, configured teacher availability, rooms, weekly subject targets, breaks and the daily subject maximums above. A successful generation becomes the published timetable and stays fixed until leadership chooses to change it.</p></div>
        <div className="tt-generate-actions"><button type="button" className="secondary" disabled={busy} onClick={() => void saveOnly()}><Save size={15} /> Save setup only</button><button type="button" className="secondary" disabled={busy} onClick={() => void manual()}><Clock3 size={15} /> Design manually</button><button type="button" className="primary" disabled={busy || !ready} onClick={() => void generate()}><Sparkles size={15} /> {busy ? "Working…" : "Save & generate timetable"}</button></div>
      </section>
    </div>
  );
}
