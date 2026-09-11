"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, FileEdit, Plus } from "lucide-react";
import { starterLessonBlocks, type LessonBlock } from "@/components/TeacherDocumentEditor";

type Assignment = {
  classId: string;
  subjectId: string;
  class: { name: string; level: string | null; _count?: { students: number } };
  subject: { name: string };
};
type Term = { id: string; name: string; academicYear: { name: string }; lifecycle: { state: string; daysUntilEnd: number } };
type Row = {
  id: string; updatedAt: string; classId: string; className: string; subjectId: string; subjectName: string; termId: string | null; termName: string | null;
  title: string; topic: string | null; subTopic: string | null; curriculumObjective: string | null; learningOutcomes: string | null; priorKnowledge: string | null;
  materials: string | null; introduction: string | null; development: string | null; assessment: string | null; conclusion: string | null; homework: string | null;
  objective: string | null; documentContent: unknown; plannedDate: string; status: string; reviewNote: string | null; reviewerName: string | null; reflection: string | null;
};
type Data = { assignments: Assignment[]; terms: Term[]; activeTermId: string | null; rows: Row[] };
type GhanaPlanner = {
  template: "basic_nacca";
  weekEnding: string;
  durationMinutes: number | null;
  classSize: number | null;
  strand: string;
  subStrand: string;
  contentStandard: string;
  learningIndicators: string;
  performanceIndicators: string;
  essentialQuestions: string;
  pedagogicalStrategies: string;
  teachingLearningResources: string;
  relevance: string;
  differentiationApproaching: string;
  differentiationProficient: string;
  differentiationHighlyProficient: string;
  keywords: string;
  coreCompetencies: string;
  sharedGhanaianValues: string;
  gesi: string;
  sel: string;
  ictIntegration: string;
  starterTeacherActivity: string;
  starterLearnerActivity: string;
  mainTeacherActivity: string;
  mainLearnerActivity: string;
  depthOfKnowledge: string;
  lessonClosure: string;
  reflectionRemarks: string;
  reference: string;
};
type Form = {
  id?: string;
  expectedUpdatedAt?: string;
  classId: string;
  subjectId: string;
  plannedDate: string;
  weekNumber: number;
  title: string;
  priorKnowledge: string;
  assessment: string;
  homework: string;
  blocks: LessonBlock[];
  ghana: GhanaPlanner;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyPlanner = (): GhanaPlanner => ({
  template: "basic_nacca",
  weekEnding: "",
  durationMinutes: 60,
  classSize: null,
  strand: "",
  subStrand: "",
  contentStandard: "",
  learningIndicators: "",
  performanceIndicators: "",
  essentialQuestions: "",
  pedagogicalStrategies: "",
  teachingLearningResources: "",
  relevance: "",
  differentiationApproaching: "",
  differentiationProficient: "",
  differentiationHighlyProficient: "",
  keywords: "",
  coreCompetencies: "",
  sharedGhanaianValues: "",
  gesi: "",
  sel: "",
  ictIntegration: "",
  starterTeacherActivity: "",
  starterLearnerActivity: "",
  mainTeacherActivity: "",
  mainLearnerActivity: "",
  depthOfKnowledge: "",
  lessonClosure: "",
  reflectionRemarks: "",
  reference: "",
});

function emptyForm(assignment?: Assignment): Form {
  return {
    classId: assignment?.classId ?? "",
    subjectId: assignment?.subjectId ?? "",
    plannedDate: today(),
    weekNumber: 1,
    title: "",
    priorKnowledge: "",
    assessment: "",
    homework: "",
    blocks: starterLessonBlocks(),
    ghana: { ...emptyPlanner(), classSize: assignment?.class._count?.students ?? null },
  };
}

function documentData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { blocks: starterLessonBlocks(), ghana: null as GhanaPlanner | null, weekNumber: 1 };
  const source = value as { blocks?: unknown; ghanaPlanner?: unknown; weekNumber?: unknown };
  return {
    blocks: Array.isArray(source.blocks) && source.blocks.length ? source.blocks as LessonBlock[] : starterLessonBlocks(),
    ghana: source.ghanaPlanner && typeof source.ghanaPlanner === "object" && !Array.isArray(source.ghanaPlanner) ? source.ghanaPlanner as GhanaPlanner : null,
    weekNumber: Number(source.weekNumber) || 1,
  };
}

function formFrom(row: Row): Form {
  const document = documentData(row.documentContent);
  const planner = document.ghana ? { ...emptyPlanner(), ...document.ghana, template: "basic_nacca" as const } : {
    ...emptyPlanner(),
    strand: row.topic ?? "",
    subStrand: row.subTopic ?? "",
    contentStandard: row.curriculumObjective ?? "",
    learningIndicators: row.objective ?? "",
    performanceIndicators: row.learningOutcomes ?? "",
    teachingLearningResources: row.materials ?? "",
    starterTeacherActivity: row.introduction ?? "",
    mainTeacherActivity: row.development ?? "",
    lessonClosure: row.conclusion ?? "",
  };
  return {
    id: row.id,
    expectedUpdatedAt: row.updatedAt,
    classId: row.classId,
    subjectId: row.subjectId,
    plannedDate: row.plannedDate.slice(0, 10),
    weekNumber: document.weekNumber,
    title: row.title,
    priorKnowledge: row.priorKnowledge ?? "",
    assessment: row.assessment ?? "",
    homework: row.homework ?? "",
    blocks: document.blocks,
    ghana: planner,
  };
}

async function api(init?: RequestInit) {
  const response = await fetch("/api/teacher/lesson-studio", init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Lesson-note request failed.");
  return body;
}

function phaseText(teacher: string, learner: string) {
  return [teacher.trim() && `Teacher activity:\n${teacher.trim()}`, learner.trim() && `Learner activity:\n${learner.trim()}`].filter(Boolean).join("\n\n");
}

export default function TeacherLessonStudioGhana() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reflection, setReflection] = useState("");

  const activeTerm = data?.terms.find((term) => term.id === data.activeTermId) ?? null;
  const assignments = data?.assignments ?? [];
  const visible = useMemo(() => {
    const rows = data?.rows ?? [];
    return filter === "all" ? rows : rows.filter((row) => row.status === filter);
  }, [data, filter]);
  const selectedAssignment = assignments.find((item) => item.classId === form.classId && item.subjectId === form.subjectId) ?? null;
  const counts = Object.fromEntries(["draft", "submitted", "approved", "changes_requested", "completed"].map((status) => [status, (data?.rows ?? []).filter((row) => row.status === status).length]));

  async function load() {
    try {
      const next = await api() as Data;
      setData(next);
      setForm((current) => current.classId ? current : emptyForm(next.assignments[0]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load lesson notes.");
    }
  }
  useEffect(() => { void load(); }, []);

  function patchGhana(patch: Partial<GhanaPlanner>) {
    setForm((current) => ({ ...current, ghana: { ...current.ghana, ...patch } }));
  }

  function start() {
    setForm(emptyForm(assignments[0]));
    setEditing(true);
    setError("");
    setNotice("");
  }

  function edit(row: Row) {
    setForm(formFrom(row));
    setEditing(true);
    setError("");
    setNotice("");
  }

  function validateSubmission() {
    const missing = [
      ["class", form.classId],
      ["subject", form.subjectId],
      ["lesson title/topic", form.title],
      ["week ending", form.ghana.weekEnding],
      ["curriculum reference/content standard", form.ghana.contentStandard],
      ["learning indicator(s)", form.ghana.learningIndicators],
      ["performance indicator", form.ghana.performanceIndicators],
      ["strand", form.ghana.strand],
      ["sub-strand", form.ghana.subStrand],
      ["T/L resources", form.ghana.teachingLearningResources],
      ["core competencies", form.ghana.coreCompetencies],
      ["starter phase", `${form.ghana.starterTeacherActivity}${form.ghana.starterLearnerActivity}`],
      ["main phase", `${form.ghana.mainTeacherActivity}${form.ghana.mainLearnerActivity}`],
      ["assessment/evidence", form.assessment],
      ["reflection/closure", form.ghana.lessonClosure],
    ].filter(([, value]) => !String(value).trim()).map(([label]) => label);
    return missing.length ? `Complete ${missing.join(", ")} before submitting this lesson note.` : "";
  }

  async function save(status: "draft" | "submitted") {
    if (!data?.activeTermId) { setError("There is no active academic term today."); return; }
    if (status === "submitted") {
      const validation = validateSubmission();
      if (validation) { setError(validation); return; }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const planner = { ...form.ghana, template: "basic_nacca" as const, classSize: selectedAssignment?.class._count?.students ?? form.ghana.classSize };
      await api({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: form.id,
          expectedUpdatedAt: form.expectedUpdatedAt,
          classId: form.classId,
          subjectId: form.subjectId,
          termId: data.activeTermId,
          plannedDate: form.plannedDate,
          weekNumber: form.weekNumber,
          status,
          title: form.title,
          topic: planner.strand,
          subTopic: planner.subStrand,
          curriculumObjective: planner.contentStandard,
          learningOutcomes: planner.performanceIndicators || planner.learningIndicators,
          priorKnowledge: form.priorKnowledge,
          materials: planner.teachingLearningResources,
          introduction: phaseText(planner.starterTeacherActivity, planner.starterLearnerActivity),
          development: phaseText(planner.mainTeacherActivity, planner.mainLearnerActivity),
          differentiatedActivities: "",
          assessment: form.assessment,
          conclusion: planner.lessonClosure,
          homework: form.homework,
          objective: planner.learningIndicators.slice(0, 500),
          resources: [],
          blocks: form.blocks,
          ghanaPlanner: planner,
        }),
      });
      setNotice(status === "submitted"
        ? "Lesson note submitted for academic verification. This review applies to the lesson note, not to homework publishing."
        : "Lesson note saved as a private draft.");
      setEditing(false);
      setForm(emptyForm(assignments[0]));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the lesson note.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(row: Row, status: "completed" | "archived") {
    setBusy(true);
    setError("");
    try {
      await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transition", id: row.id, status, reflection: status === "completed" ? reflection : undefined }) });
      setNotice(status === "completed" ? "Lesson marked taught and reflection saved." : "Lesson note archived.");
      setReflection("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the lesson note.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return <main className="ghana-note-page">
      <section className="ghana-note-heading">
        <div><span>GHANA PROFESSIONAL LESSON NOTE</span><h1>{form.id ? "Edit lesson note" : "Prepare lesson note"}</h1><p>Structured around the familiar Ghana lesson-note format. Complete the professional teaching record first; optional extras stay out of the way.</p></div>
        <div className="ghana-note-actions"><button type="button" onClick={() => setEditing(false)} disabled={busy}>Back to notes</button><button className="primary" type="button" onClick={() => void save("draft")} disabled={busy}>Save draft</button></div>
      </section>
      {error ? <div className="ghana-note-alert bad" role="alert">{error}</div> : null}

      <section className="ghana-note-paper">
        <header><BookOpenCheck size={20}/><div><strong>{activeTerm ? `${activeTerm.academicYear.name} · ${activeTerm.name}` : "No active term"}</strong><span>Professional lesson-note record</span></div></header>

        <div className="ghana-note-grid context">
          <label>Class *<select value={form.classId} disabled={Boolean(form.id)} onChange={(event) => { const assignment = assignments.find((item) => item.classId === event.target.value); setForm((current) => ({ ...current, classId: event.target.value, subjectId: assignment?.subjectId ?? "" })); }}><option value="">Choose class</option>{Array.from(new Map(assignments.map((item) => [item.classId, item])).values()).map((item) => <option key={item.classId} value={item.classId}>{item.class.level ? `${item.class.level} · ` : ""}{item.class.name}</option>)}</select></label>
          <label>Subject *<select value={form.subjectId} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, subjectId: event.target.value })}><option value="">Choose subject</option>{assignments.filter((item) => !form.classId || item.classId === form.classId).map((item) => <option key={`${item.classId}:${item.subjectId}`} value={item.subjectId}>{item.subject.name}</option>)}</select></label>
          <label>Week ending *<input type="date" value={form.ghana.weekEnding} onChange={(event) => patchGhana({ weekEnding: event.target.value })}/></label>
          <label>Lesson date *<input type="date" value={form.plannedDate} onChange={(event) => setForm({ ...form, plannedDate: event.target.value })}/></label>
          <label>Week number<input type="number" min="1" max="60" value={form.weekNumber} onChange={(event) => setForm({ ...form, weekNumber: Number(event.target.value) || 1 })}/></label>
          <label>Duration (minutes)<input type="number" min="1" max="600" value={form.ghana.durationMinutes ?? ""} onChange={(event) => patchGhana({ durationMinutes: event.target.value ? Number(event.target.value) : null })}/></label>
          <label className="wide">Lesson title / topic *<input value={form.title} maxLength={160} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Equivalent fractions"/></label>
          <label className="wide">Reference *<textarea rows={2} value={form.ghana.reference} onChange={(event) => patchGhana({ reference: event.target.value })} placeholder="Curriculum, textbook, teacher guide or page reference"/></label>
        </div>

        <section className="ghana-note-section">
          <div className="ghana-note-section-title"><span>CURRICULUM ALIGNMENT</span><h2>What learners are expected to achieve</h2></div>
          <div className="ghana-note-grid two">
            <label>Strand *<textarea rows={2} value={form.ghana.strand} onChange={(event) => patchGhana({ strand: event.target.value })}/></label>
            <label>Sub-strand *<textarea rows={2} value={form.ghana.subStrand} onChange={(event) => patchGhana({ subStrand: event.target.value })}/></label>
            <label className="wide">Curriculum reference / content standard *<textarea rows={3} value={form.ghana.contentStandard} onChange={(event) => patchGhana({ contentStandard: event.target.value })}/></label>
            <label>Learning Indicator(s) *<textarea rows={4} value={form.ghana.learningIndicators} onChange={(event) => patchGhana({ learningIndicators: event.target.value })}/></label>
            <label>Performance Indicator *<textarea rows={4} value={form.ghana.performanceIndicators} onChange={(event) => patchGhana({ performanceIndicators: event.target.value })}/></label>
            <label>Teaching / Learning Resources (TLRs) *<textarea rows={4} value={form.ghana.teachingLearningResources} onChange={(event) => patchGhana({ teachingLearningResources: event.target.value })}/></label>
            <label>Core Competencies *<textarea rows={4} value={form.ghana.coreCompetencies} onChange={(event) => patchGhana({ coreCompetencies: event.target.value })}/></label>
            <label className="wide">Prior knowledge<textarea rows={3} value={form.priorKnowledge} onChange={(event) => setForm({ ...form, priorKnowledge: event.target.value })}/></label>
          </div>
        </section>

        <section className="ghana-note-phase">
          <header><span>PHASE 1</span><h2>Starter</h2><p>Prepare learners for the new learning.</p></header>
          <div><label>Teacher activity *<textarea rows={6} value={form.ghana.starterTeacherActivity} onChange={(event) => patchGhana({ starterTeacherActivity: event.target.value })}/></label><label>Learner activity *<textarea rows={6} value={form.ghana.starterLearnerActivity} onChange={(event) => patchGhana({ starterLearnerActivity: event.target.value })}/></label></div>
        </section>

        <section className="ghana-note-phase">
          <header><span>PHASE 2</span><h2>Main</h2><p>Teaching, learner activity and evidence of learning.</p></header>
          <div><label>Teacher activity *<textarea rows={10} value={form.ghana.mainTeacherActivity} onChange={(event) => patchGhana({ mainTeacherActivity: event.target.value })}/></label><label>Learner activity *<textarea rows={10} value={form.ghana.mainLearnerActivity} onChange={(event) => patchGhana({ mainLearnerActivity: event.target.value })}/></label><label className="wide">Assessment / evidence of learning *<textarea rows={5} value={form.assessment} onChange={(event) => setForm({ ...form, assessment: event.target.value })} placeholder="How will you know the performance indicator has been achieved?"/></label></div>
        </section>

        <section className="ghana-note-phase">
          <header><span>PHASE 3</span><h2>Reflection</h2><p>Close the lesson, consolidate learning and record reflection.</p></header>
          <div><label>Lesson closure / plenary *<textarea rows={6} value={form.ghana.lessonClosure} onChange={(event) => patchGhana({ lessonClosure: event.target.value })}/></label><label>Reflection / remarks<textarea rows={6} value={form.ghana.reflectionRemarks} onChange={(event) => patchGhana({ reflectionRemarks: event.target.value })}/></label></div>
        </section>

        <details className="ghana-note-more">
          <summary>Optional follow-up and additional planning notes</summary>
          <div className="ghana-note-grid two">
            <label>Homework / extension note<textarea rows={4} value={form.homework} onChange={(event) => setForm({ ...form, homework: event.target.value })}/><small>This is only part of the lesson note. To send homework to learners, use Homework & Exercises; teacher publishing does not require leadership approval.</small></label>
            <label>Keywords<textarea rows={4} value={form.ghana.keywords} onChange={(event) => patchGhana({ keywords: event.target.value })}/></label>
            <label>Shared Ghanaian values<textarea rows={4} value={form.ghana.sharedGhanaianValues} onChange={(event) => patchGhana({ sharedGhanaianValues: event.target.value })}/></label>
            <label>GESI / inclusive participation<textarea rows={4} value={form.ghana.gesi} onChange={(event) => patchGhana({ gesi: event.target.value })}/></label>
          </div>
        </details>

        <footer className="ghana-note-submit"><div><strong>Lesson-note verification</strong><span>Leadership verification checks the professional lesson note. It does not approve or block homework assigned to learners.</span></div><div><button type="button" onClick={() => void save("draft")} disabled={busy}>Save draft</button><button className="primary" type="button" onClick={() => void save("submitted")} disabled={busy}>Submit lesson note for verification</button></div></footer>
      </section>
    </main>;
  }

  return <main className="ghana-note-page">
    <section className="ghana-note-heading"><div><span>GHANA PROFESSIONAL LESSON NOTES</span><h1>Plan in the format teachers recognise.</h1><p>Curriculum alignment, three lesson phases, professional verification and teaching reflection—without burying the core lesson note under unnecessary controls.</p></div><button className="primary" type="button" disabled={!activeTerm || !assignments.length} onClick={start}><Plus size={16}/>New lesson note</button></section>
    {error ? <div className="ghana-note-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="ghana-note-alert good" role="status"><CheckCircle2 size={16}/>{notice}</div> : null}
    <section className="ghana-note-stats"><article><span>My notes</span><strong>{data?.rows.length ?? 0}</strong></article><article><span>Drafts</span><strong>{counts.draft ?? 0}</strong></article><article><span>For verification</span><strong>{counts.submitted ?? 0}</strong></article><article><span>Approved / taught</span><strong>{(counts.approved ?? 0) + (counts.completed ?? 0)}</strong></article></section>
    <section className="ghana-note-list-card">
      <header><div><h2>Lesson-note register</h2><p>Open a draft or a note returned for changes. Approved notes remain part of the school academic record.</p></div><div className="ghana-note-filters">{[["all","All"],["draft","Draft"],["submitted","For verification"],["changes_requested","Needs changes"],["approved","Approved"],["completed","Taught"]].map(([key, label]) => <button type="button" key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div></header>
      <div className="ghana-note-list">{visible.length ? visible.map((row) => <article key={row.id}><span className="ghana-note-icon"><FileEdit size={18}/></span><div><small>{row.className} · {row.subjectName} · {new Date(row.plannedDate).toLocaleDateString("en-GH")}</small><h3>{row.title}</h3><p>{row.topic || row.objective || "Professional lesson note"}</p>{row.reviewNote ? <div className="ghana-note-review"><strong>{row.status === "changes_requested" ? "Changes requested" : "Review note"}</strong><span>{row.reviewNote}</span>{row.reviewerName ? <small>{row.reviewerName}</small> : null}</div> : null}</div><aside><span className={`ghana-note-status ${row.status}`}>{row.status.replaceAll("_", " ")}</span>{["draft","changes_requested"].includes(row.status) ? <button type="button" onClick={() => edit(row)}>Open note</button> : null}{row.status === "approved" ? <><textarea rows={3} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Teaching reflection…"/><button type="button" disabled={busy || reflection.trim().length < 10} onClick={() => void transition(row, "completed")}>Mark taught</button></> : null}{row.status === "completed" ? <button type="button" disabled={busy} onClick={() => void transition(row, "archived")}>Archive</button> : null}</aside></article>) : <div className="ghana-note-empty"><BookOpenCheck size={22}/><strong>No lesson notes in this view.</strong><span>Create a note when you are ready to plan the next lesson.</span></div>}</div>
    </section>
  </main>;
}
