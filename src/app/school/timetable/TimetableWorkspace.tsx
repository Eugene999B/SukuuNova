"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, Clock3, Eye, LockKeyhole, Plus, Printer, RefreshCw, ShieldCheck, Sparkles, Unlock, WandSparkles, X } from "lucide-react";

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
type Day = { dayOfWeek: number; name: string; enabled: boolean; start: string; end: string; periods?: Period[] };
type TimetableConfig = {
  days: Day[];
  periods?: Period[];
  periodsPerDay: number;
  periodMinutes: number;
  breaks?: { name: string; start: string; end: string }[];
  rooms?: { id: string; name: string; type?: string }[];
};
type Data = {
  school: { name: string; uniqueCode: string; logoUrl?: string | null } | null;
  classes: ClassItem[];
  subjects: Person[];
  teachers: Person[];
  slots: Slot[];
  timetableConfig: TimetableConfig;
};

type Editor = { day: number; period: number; slot?: Slot };
type GenerationMode = "fill_gaps" | "rebuild" | "rebuild_preserving_locked";
type GenerationScope = "class" | "school";
type GenerationPlan = {
  mode: GenerationMode;
  dryRun: boolean;
  scheduled: number;
  warnings: string[];
  metrics: {
    targetLessons: number;
    existingInScope: number;
    preservedLessons: number;
    generatedLessons: number;
    removedLessons: number;
    remainingBeforeGeneration: number;
    coverageAfter: number;
  };
  changes: {
    keepSlotIds: string[];
    removeSlotIds: string[];
    additions: Array<{
      classId: string;
      subjectId: string;
      teacherId: string;
      dayOfWeek: number;
      period: number;
      venue: string | null;
      className: string;
      subjectName: string;
      teacherName: string;
    }>;
  };
};

type ScheduleRow = { kind: "period"; period: Period } | { kind: "break"; name: string; start: string; end: string };

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
  const start = toMinutes(day?.start || "08:00");
  return Array.from({ length: Math.min(16, Math.max(1, config.periodsPerDay || 8)) }, (_, index) => {
    const s = start + index * (config.periodMinutes || 40);
    return { period: index + 1, start: fromMinutes(s), end: fromMinutes(s + (config.periodMinutes || 40)) };
  });
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
  const [lockedSlotIds, setLockedSlotIds] = useState<Set<string>>(new Set());
  const [generationOpen, setGenerationOpen] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fill_gaps");
  const [generationScope, setGenerationScope] = useState<GenerationScope>("class");
  const [generationPlan, setGenerationPlan] = useState<GenerationPlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

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
      const validIds = new Set<string>((payload.slots ?? []).map((slot: Slot) => slot.id));
      setLockedSlotIds((current) => new Set([...current].filter((id) => validIds.has(id))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load timetable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const days = useMemo(() => data?.timetableConfig.days.filter((day) => day.enabled).sort((a, b) => a.dayOfWeek - b.dayOfWeek) ?? [], [data]);
  const periods = useMemo(() => buildPeriods(data?.timetableConfig ?? { days: [], periodsPerDay: 8, periodMinutes: 40 }, days[0]), [data, days]);
  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    const periodRows: ScheduleRow[] = periods.map((period) => ({ kind: "period", period }));
    const breakRows: ScheduleRow[] = (data?.timetableConfig.breaks ?? []).map((item) => ({ kind: "break", ...item }));
    return [...periodRows, ...breakRows].sort((a, b) => {
      const aStart = a.kind === "period" ? a.period.start : a.start;
      const bStart = b.kind === "period" ? b.period.start : b.start;
      return toMinutes(aStart) - toMinutes(bStart);
    });
  }, [data, periods]);
  const activeId = view === "class" ? selectedClass : selectedTeacher;
  const activeName = view === "class"
    ? data?.classes.find((item) => item.id === selectedClass)?.name ?? "Choose a class"
    : data?.teachers.find((item) => item.id === selectedTeacher)?.name ?? "Choose a teacher";

  const visibleSlots = useMemo(() => {
    if (!data || !activeId) return [];
    return data.slots.filter((slot) => view === "class" ? slot.classId === activeId : slot.teacherId === activeId);
  }, [data, activeId, view]);
  const slotMap = useMemo(() => new Map(visibleSlots.map((slot) => [`${slot.dayOfWeek}:${slot.period}`, slot])), [visibleSlots]);
  const currentClassName = data?.classes.find((item) => item.id === selectedClass)?.name ?? "Selected class";
  const lockedInScope = useMemo(() => {
    if (!data) return [];
    return data.slots.filter((slot) => lockedSlotIds.has(slot.id) && (generationScope === "school" || slot.classId === selectedClass));
  }, [data, lockedSlotIds, generationScope, selectedClass]);

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

  const openGeneration = () => {
    setGenerationScope(view === "class" && selectedClass ? "class" : "school");
    setGenerationMode("fill_gaps");
    setGenerationPlan(null);
    setGenerationOpen(true);
    setError("");
    setNotice("");
  };

  const requestGeneration = async (dryRun: boolean) => {
    const response = await fetch("/api/school/academic-engine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        mode: generationMode,
        dryRun,
        lockedSlotIds: generationMode === "rebuild_preserving_locked" ? lockedInScope.map((slot) => slot.id) : undefined,
        classIds: generationScope === "class" && selectedClass ? [selectedClass] : undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || "Timetable planning failed.");
    return payload as GenerationPlan;
  };

  const previewGeneration = async () => {
    setPreviewing(true);
    setError("");
    setNotice("");
    try {
      setGenerationPlan(await requestGeneration(true));
    } catch (cause) {
      setGenerationPlan(null);
      setError(cause instanceof Error ? cause.message : "Timetable planning failed.");
    } finally {
      setPreviewing(false);
    }
  };

  const applyGeneration = async () => {
    if (!generationPlan) return;
    setApplying(true);
    setError("");
    setNotice("");
    try {
      const applied = await requestGeneration(false);
      setNotice(`Timetable updated: ${applied.metrics.generatedLessons} lesson(s) added, ${applied.metrics.removedLessons} replaced, ${applied.metrics.coverageAfter}% target coverage.`);
      setGenerationOpen(false);
      setGenerationPlan(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Timetable generation failed.");
    } finally {
      setApplying(false);
    }
  };

  const toggleLock = (slotId: string) => {
    setLockedSlotIds((current) => {
      const next = new Set(current);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
    setGenerationPlan(null);
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
          <span className="tt-eyebrow"><CalendarDays size={14} /> TIMETABLE STUDIO</span>
          <h1>{activeName}</h1>
          <p>Build a conflict-safe weekly schedule, preview generation changes before they are applied, and lock lessons that must stay in place.</p>
        </div>
        <div className="tt-header-actions">
          <Link className="tt-btn ghost" href={printUrl}><Printer size={15} /> Print timetable</Link>
          <button className="tt-btn primary" onClick={openGeneration}><WandSparkles size={15} /> Plan timetable</button>
        </div>
      </header>

      {notice ? <div className="tt-alert success"><Check size={15} />{notice}</div> : null}
      {error ? <div className="tt-alert error"><X size={15} />{error}</div> : null}

      <section className="tt-intelligence-strip">
        <div><ShieldCheck size={17} /><span><strong>{data.slots.length}</strong> school lessons</span></div>
        <div><CalendarDays size={17} /><span><strong>{visibleSlots.length}</strong> in this view</span></div>
        <div><LockKeyhole size={17} /><span><strong>{lockedSlotIds.size}</strong> locked for rebuilds</span></div>
        <div><Sparkles size={17} /><span>Teacher, class, room and availability conflicts checked</span></div>
      </section>

      {generationOpen ? (
        <GenerationStudio
          mode={generationMode}
          scope={generationScope}
          className={currentClassName}
          lockedCount={lockedInScope.length}
          plan={generationPlan}
          previewing={previewing}
          applying={applying}
          days={days}
          onMode={(mode) => { setGenerationMode(mode); setGenerationPlan(null); }}
          onScope={(scope) => { setGenerationScope(scope); setGenerationPlan(null); }}
          onPreview={() => void previewGeneration()}
          onApply={() => void applyGeneration()}
          onClose={() => { setGenerationOpen(false); setGenerationPlan(null); }}
        />
      ) : null}

      {!days.length || !periods.length ? (
        <section className="tt-selection-empty">
          <CalendarDays size={24} />
          <h2>No timetable schedule is configured yet</h2>
          <p>Set the school&apos;s working days and teaching periods in Academic Setup, then return here to plan the timetable.</p>
          <Link className="tt-btn primary" href="/school/academics/setup">Open academic setup</Link>
        </section>
      ) : (
        <>
          <section className="tt-control-bar">
            <div className="tt-view-switch">
              <button className={view === "class" ? "active" : ""} onClick={() => setView("class")}>Class timetable</button>
              <button className={view === "teacher" ? "active" : ""} onClick={() => setView("teacher")}>Teacher timetable</button>
            </div>
            {view === "class" ? (
              <select aria-label="Choose class" value={selectedClass} onChange={(event) => { setSelectedClass(event.target.value); setGenerationPlan(null); }}>
                {data.classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}
              </select>
            ) : (
              <select aria-label="Choose teacher" value={selectedTeacher} onChange={(event) => setSelectedTeacher(event.target.value)}>
                {data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
            <span className="tt-toolbar-meta">{days.length} days · {periods.length} teaching periods · {data.timetableConfig.breaks?.length ?? 0} breaks</span>
            <button className="tt-icon-btn" onClick={() => void load()} aria-label="Refresh timetable"><RefreshCw size={15} /></button>
          </section>

          <section className="tt-grid-card">
            <div className="tt-grid-heading">
              <div><span className="tt-eyebrow">WEEKLY TIMETABLE</span><h2>{activeName}</h2><p>Click a lesson to edit it. Use the lock beside a lesson when it must survive a preserve-locked rebuild.</p></div>
              <div className="tt-legend"><span><LockKeyhole size={12} /> Locked lessons are preserved only in preserve-locked mode.</span></div>
            </div>
            <div className="tt-table-scroll">
              <table className="tt-simple-table">
                <thead><tr><th>Time</th>{days.map((day) => <th key={day.dayOfWeek}>{day.name}</th>)}</tr></thead>
                <tbody>
                  {scheduleRows.map((row, rowIndex) => {
                    if (row.kind === "break") {
                      return <tr className="tt-break-row-grid" key={`break-${row.name}-${row.start}-${rowIndex}`}><th><strong>{row.name}</strong><span>{formatTime(row.start)}–{formatTime(row.end)}</span></th><td colSpan={days.length}><span>Break / non-teaching time</span></td></tr>;
                    }
                    const period = row.period;
                    return (
                      <tr key={`period-${period.period}`}>
                        <th><strong>Period {period.period}</strong><span>{formatTime(period.start)}–{formatTime(period.end)}</span></th>
                        {days.map((day) => {
                          const slot = slotMap.get(`${day.dayOfWeek}:${period.period}`);
                          const locked = slot ? lockedSlotIds.has(slot.id) : false;
                          return (
                            <td key={`${day.dayOfWeek}:${period.period}`}>
                              {slot ? (
                                <div className={`tt-simple-lesson filled ${locked ? "locked" : ""}`}>
                                  <button className="tt-lesson-main" onClick={() => setEditor({ day: day.dayOfWeek, period: period.period, slot })}>
                                    <strong>{slot.subject.name}</strong>
                                    <span>{view === "class" ? slot.teacher.name : slot.class.name}</span>
                                    {slot.venue ? <small>{displayVenue(slot.venue, data.timetableConfig)}</small> : null}
                                  </button>
                                  <button className="tt-lock-toggle" type="button" aria-label={locked ? "Unlock lesson" : "Lock lesson"} aria-pressed={locked} onClick={() => toggleLock(slot.id)}>{locked ? <LockKeyhole size={12} /> : <Unlock size={12} />}</button>
                                </div>
                              ) : (
                                <button className="tt-simple-lesson empty" onClick={() => setEditor({ day: day.dayOfWeek, period: period.period })}><Plus size={13} /> Add lesson</button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
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

function GenerationStudio({ mode, scope, className, lockedCount, plan, previewing, applying, days, onMode, onScope, onPreview, onApply, onClose }: {
  mode: GenerationMode;
  scope: GenerationScope;
  className: string;
  lockedCount: number;
  plan: GenerationPlan | null;
  previewing: boolean;
  applying: boolean;
  days: Day[];
  onMode: (mode: GenerationMode) => void;
  onScope: (scope: GenerationScope) => void;
  onPreview: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const modeCopy: Record<GenerationMode, { title: string; text: string }> = {
    fill_gaps: { title: "Fill gaps", text: "Keep every lesson already on the timetable and add only the missing weekly periods." },
    rebuild: { title: "Fresh rebuild", text: "Replace all lessons in the chosen scope with a newly balanced timetable." },
    rebuild_preserving_locked: { title: "Rebuild + keep locks", text: "Keep only lessons you locked, rebuild everything else in the chosen scope around them." },
  };
  const dayName = (dayOfWeek: number) => days.find((day) => day.dayOfWeek === dayOfWeek)?.name ?? `Day ${dayOfWeek}`;

  return (
    <section className="tt-generation-studio" aria-label="Timetable generation planner">
      <div className="tt-generation-head">
        <div><span className="tt-eyebrow"><Sparkles size={13} /> INTELLIGENT GENERATION</span><h2>Preview the schedule before changing anything</h2><p>The preview is read-only. Applying the plan recalculates it under a school-level generation lock before writing.</p></div>
        <button className="tt-icon-btn" type="button" onClick={onClose} aria-label="Close timetable planner"><X size={15} /></button>
      </div>

      <div className="tt-generation-options">
        <div className="tt-option-group">
          <strong>Generation mode</strong>
          <div className="tt-mode-grid">
            {(Object.keys(modeCopy) as GenerationMode[]).map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => onMode(value)}><span>{modeCopy[value].title}</span><small>{modeCopy[value].text}</small></button>)}
          </div>
        </div>
        <div className="tt-option-group scope">
          <strong>Scope</strong>
          <div className="tt-scope-buttons">
            <button className={scope === "class" ? "active" : ""} onClick={() => onScope("class")}>{className}</button>
            <button className={scope === "school" ? "active" : ""} onClick={() => onScope("school")}>Whole school</button>
          </div>
          {mode === "rebuild_preserving_locked" ? <p><LockKeyhole size={12} /> {lockedCount} locked lesson(s) inside this scope will be preserved. Lock or unlock lessons in the grid before previewing.</p> : null}
        </div>
      </div>

      {!plan ? (
        <div className="tt-preview-empty"><Eye size={18} /><div><strong>No changes have been made.</strong><span>Preview calculates additions, replacements, coverage and conflicts without writing to the timetable.</span></div><button className="tt-btn primary" disabled={previewing} onClick={onPreview}>{previewing ? "Calculating…" : "Preview plan"}</button></div>
      ) : (
        <div className="tt-plan-results">
          <div className="tt-plan-metrics">
            <div><small>Target lessons</small><strong>{plan.metrics.targetLessons}</strong></div>
            <div><small>Keep</small><strong>{plan.metrics.preservedLessons}</strong></div>
            <div><small>Add</small><strong>{plan.metrics.generatedLessons}</strong></div>
            <div><small>Replace</small><strong>{plan.metrics.removedLessons}</strong></div>
            <div><small>Coverage after</small><strong>{plan.metrics.coverageAfter}%</strong></div>
          </div>
          {plan.warnings.length ? <div className="tt-plan-warnings">{plan.warnings.map((warning) => <p key={warning}><AlertTriangle size={13} />{warning}</p>)}</div> : <div className="tt-plan-ok"><CheckCircle2 size={14} />No scheduling warnings in this preview.</div>}
          <div className="tt-plan-detail">
            <div><h3>Planned additions</h3><p>{plan.changes.additions.length ? `${plan.changes.additions.length} lesson(s) will be placed.` : "No new lessons are needed."}</p></div>
            {plan.changes.additions.length ? <div className="tt-addition-list">{plan.changes.additions.slice(0, 10).map((addition, index) => <div key={`${addition.classId}-${addition.subjectId}-${addition.dayOfWeek}-${addition.period}-${index}`}><strong>{addition.subjectName}</strong><span>{addition.className} · {addition.teacherName}</span><small>{dayName(addition.dayOfWeek)} · Period {addition.period}</small></div>)}</div> : null}
            {plan.changes.additions.length > 10 ? <small className="tt-more-note">+ {plan.changes.additions.length - 10} more planned lessons</small> : null}
          </div>
          <div className="tt-generation-actions"><button className="tt-btn ghost" disabled={previewing || applying} onClick={onPreview}><RefreshCw size={13} /> Recalculate preview</button><button className="tt-btn primary" disabled={applying} onClick={onApply}><ShieldCheck size={13} />{applying ? "Applying safely…" : "Apply this plan"}</button></div>
        </div>
      )}
    </section>
  );
}

function LessonEditor({ data, value, close, done, action }: { data: Data; value: Editor; close: () => void; done: () => Promise<void>; action: (body: unknown) => Promise<unknown> }) {
  const [classId, setClassId] = useState(value.slot?.classId ?? data.classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(value.slot?.subjectId ?? data.subjects[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(value.slot?.teacherId ?? data.teachers[0]?.id ?? "");
  const [venue, setVenue] = useState(displayVenue(value.slot?.venue, data.timetableConfig));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await action({
        action: value.slot ? "updateSlot" : "saveSlot",
        ...(value.slot ? { slotId: value.slot.id } : {}),
        classId,
        subjectId,
        teacherId,
        dayOfWeek: value.day,
        period: value.period,
        venue: venue.trim() || undefined,
      });
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

  return (
    <div className="tt-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="tt-editor" role="dialog" aria-modal="true" aria-labelledby="tt-editor-title">
        <button className="tt-editor-close" type="button" onClick={close} aria-label="Close lesson editor"><X size={17} /></button>
        <span className="tt-eyebrow">LESSON</span><h2 id="tt-editor-title">{value.slot ? "Edit lesson" : "Add lesson"}</h2><p>Day {value.day}, period {value.period}. Conflicts and teacher assignment rules are checked when you save.</p>
        {error ? <div className="tt-alert error">{error}</div> : null}
        <label>Class<select value={classId} onChange={(event) => setClassId(event.target.value)}>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Teacher<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{data.teachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Room / venue<input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Optional room name" /></label>
        <div className="tt-editor-actions">
          {value.slot ? <button className="tt-btn danger" disabled={saving} onClick={() => void remove()}>Remove</button> : <span />}
          <div><button className="tt-btn ghost" type="button" onClick={close}>Cancel</button><button className="tt-btn primary" disabled={saving || !classId || !subjectId || !teacherId} onClick={() => void save()}>{saving ? "Saving…" : "Save lesson"}</button></div>
        </div>
      </section>
    </div>
  );
}
