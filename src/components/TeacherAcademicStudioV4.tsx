"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Copy,
  FileQuestion,
  FileText,
  GripVertical,
  Hash,
  Layers3,
  ListChecks,
  Plus,
  Save,
  Send,
  Sparkles,
  SquareCheckBig,
  TextCursorInput,
  Trash2,
  UsersRound,
} from "lucide-react";
import { parseMarkSheetPaste, type MarkStatus } from "@/lib/mark-sheet-input";

type Assignment = { classId: string; subjectId: string; class: { id: string; name: string; level: string | null }; subject: { id: string; name: string } };
type Term = { id: string; name: string; startDate: string; endDate: string; isLocked: boolean; lifecycle?: { state: string; daysUntilEnd: number } };
type Contexts = { assignments: Assignment[]; terms: Term[]; activeTermId: string | null; activeTerm: Term | null; timezone: string };
type Student = { id: string; name: string; admissionNo: string };
type Score = { id: string; studentId: string; value: number | string; status: MarkStatus; enteredAt: string };
type Work = { id: string; assessmentId: string | null; title: string; kind: string; workDate: string; weekNumber: number; workNumber: number; maxScore: number | string; markingMode: string; status: string; dueAt: string | null; attemptLimit: number; attemptScorePolicy: "highest" | "latest" };
type Assessment = { id: string; name: string; type: string; maxScore: number | string; weight: number | string; scores: Score[] };
type Roster = { students: Student[]; works: Work[]; assessments: Assessment[] };
type QuestionType = "multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "fill_blank" | "numeric" | "ordering" | "long_answer";
type OptionRow = { id: string; text: string; correct: boolean };
type Question = { id: string; type: QuestionType; prompt: string; points: number; options: OptionRow[]; accepted: string[]; keywordDraft: string };
type View = "library" | "builder" | "marks";

type WorkDraft = {
  kind: "Classwork" | "Homework" | "Exercise" | "Participation" | "Quiz" | "Exam";
  title: string;
  instructions: string;
  workDate: string;
  weekNumber: number;
  workNumber: number;
  maxScore: number;
  markingMode: "manual" | "auto" | "review";
  attemptLimit: number;
  attemptScorePolicy: "highest" | "latest";
  opensAt: string;
  dueAt: string;
};

const qMeta: Array<{ type: QuestionType; label: string; short: string; icon: typeof CircleDot }> = [
  { type: "multiple_choice", label: "Multiple choice", short: "One correct option", icon: CircleDot },
  { type: "multiple_select", label: "Checkboxes", short: "Several correct options", icon: SquareCheckBig },
  { type: "true_false", label: "True / False", short: "Fast objective check", icon: CheckCircle2 },
  { type: "short_answer", label: "Short answer", short: "Accepted words or phrases", icon: TextCursorInput },
  { type: "fill_blank", label: "Fill in the blank", short: "One or more accepted values", icon: FileText },
  { type: "numeric", label: "Number", short: "Numeric response", icon: Hash },
  { type: "ordering", label: "Order / sequence", short: "Arrange items correctly", icon: ListChecks },
  { type: "long_answer", label: "Long / essay", short: "Teacher-assisted written marking", icon: FileQuestion },
];

const dateKey = () => new Date().toISOString().slice(0, 10);
const id = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const newOption = (text = "") => ({ id: id(), text, correct: false });
function newQuestion(type: QuestionType): Question {
  if (type === "true_false") return { id: id(), type, prompt: "", points: 1, options: [], accepted: ["true"], keywordDraft: "" };
  if (type === "multiple_choice" || type === "multiple_select") return { id: id(), type, prompt: "", points: 1, options: [newOption(), newOption(), newOption(), newOption()], accepted: [], keywordDraft: "" };
  if (type === "ordering") return { id: id(), type, prompt: "", points: 1, options: [newOption(), newOption(), newOption()], accepted: [], keywordDraft: "" };
  return { id: id(), type, prompt: "", points: 1, options: [], accepted: [], keywordDraft: "" };
}
function emptyWork(): WorkDraft {
  return { kind: "Homework", title: "", instructions: "", workDate: dateKey(), weekNumber: 1, workNumber: 1, maxScore: 10, markingMode: "auto", attemptLimit: 1, attemptScorePolicy: "highest", opensAt: "", dueAt: "" };
}
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || "Request failed.");
  return body;
}

export default function TeacherAcademicStudioV4() {
  const [contexts, setContexts] = useState<Contexts>({ assignments: [], terms: [], activeTermId: null, activeTerm: null, timezone: "Africa/Accra" });
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [view, setView] = useState<View>("library");
  const [builderStep, setBuilderStep] = useState(1);
  const [work, setWork] = useState<WorkDraft>(emptyWork());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showQuestionPalette, setShowQuestionPalette] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, MarkStatus>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [bulkScore, setBulkScore] = useState("");

  const classes = useMemo(() => Array.from(new Map(contexts.assignments.map((item) => [item.classId, item.class])).values()), [contexts.assignments]);
  const subjectAssignments = useMemo(() => contexts.assignments.filter((item) => item.classId === classId), [contexts.assignments, classId]);
  const selectedWork = roster?.works.find((item) => item.id === selectedWorkId) || null;
  const selectedAssessment = roster?.assessments.find((item) => item.id === selectedWork?.assessmentId) || null;
  const allocated = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const writable = Boolean(contexts.activeTermId && contexts.activeTerm && !contexts.activeTerm.isLocked);

  async function loadContexts() {
    const data = await api("/api/school/teacher-academic-workspace") as Contexts;
    setContexts(data);
    const first = data.assignments[0];
    setClassId((current) => current || first?.classId || "");
    setSubjectId((current) => current || first?.subjectId || "");
  }
  async function loadRoster(nextClass = classId, nextSubject = subjectId) {
    if (!nextClass || !nextSubject || !contexts.activeTermId) { setRoster(null); return; }
    const data = await api(`/api/school/teacher-academic-workspace?classId=${encodeURIComponent(nextClass)}&subjectId=${encodeURIComponent(nextSubject)}&termId=${encodeURIComponent(contexts.activeTermId)}`) as Roster;
    setRoster(data);
    setSelectedWorkId((current) => data.works.some((item) => item.id === current) ? current : data.works[0]?.id || "");
  }

  useEffect(() => { void loadContexts().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your teaching scope.")); }, []);
  useEffect(() => { if (classId && subjectId && contexts.activeTermId) void loadRoster().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load class work.")); }, [classId, subjectId, contexts.activeTermId]);
  useEffect(() => {
    const current = roster?.assessments.find((item) => item.id === roster?.works.find((row) => row.id === selectedWorkId)?.assessmentId);
    setMarks(Object.fromEntries((current?.scores || []).map((score) => [score.studentId, String(score.value)])));
    setStatuses(Object.fromEntries((current?.scores || []).map((score) => [score.studentId, score.status])));
    setDirty({});
    setSelectedStudents([]);
  }, [selectedWorkId, roster]);

  function chooseClass(value: string) {
    if (dirtyCount && !window.confirm("Discard unsaved mark changes?")) return;
    setClassId(value);
    const next = contexts.assignments.find((item) => item.classId === value);
    setSubjectId(next?.subjectId || "");
  }
  function resetBuilder() {
    setWork(emptyWork());
    setQuestions([]);
    setBuilderStep(1);
    setShowQuestionPalette(false);
  }
  function beginWork() { resetBuilder(); setView("builder"); setError(""); setNotice(""); }
  function addQuestion(type: QuestionType) {
    setQuestions((current) => [...current, newQuestion(type)]);
    setShowQuestionPalette(false);
  }
  function patchQuestion(questionId: string, patch: Partial<Question>) { setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, ...patch } : q)); }
  function deleteQuestion(questionId: string) { setQuestions((current) => current.filter((q) => q.id !== questionId)); }
  function duplicateQuestion(questionId: string) { setQuestions((current) => { const index = current.findIndex((q) => q.id === questionId); if (index < 0) return current; const source = current[index]; const copy = { ...source, id: id(), options: source.options.map((o) => ({ ...o, id: id() })), accepted: [...source.accepted] }; const next = [...current]; next.splice(index + 1, 0, copy); return next; }); }
  function moveQuestion(questionId: string, delta: -1 | 1) { setQuestions((current) => { const from = current.findIndex((q) => q.id === questionId); const to = from + delta; if (from < 0 || to < 0 || to >= current.length) return current; const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); }
  function addOption(questionId: string) { setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, options: [...q.options, newOption()] } : q)); }
  function patchOption(questionId: string, optionId: string, text: string) { setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, options: q.options.map((o) => o.id === optionId ? { ...o, text } : o) } : q)); }
  function chooseOption(questionId: string, optionId: string, multi: boolean) { setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, options: q.options.map((o) => o.id === optionId ? { ...o, correct: !o.correct } : multi ? o : { ...o, correct: false }) } : q)); }
  function removeOption(questionId: string, optionId: string) { setQuestions((current) => current.map((q) => q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q)); }
  function addAccepted(questionId: string) { setQuestions((current) => current.map((q) => q.id === questionId && q.keywordDraft.trim() ? { ...q, accepted: [...q.accepted, q.keywordDraft.trim()], keywordDraft: "" } : q)); }
  function equalizeMarks() {
    if (!questions.length) return;
    const total = Number(work.maxScore) || 0;
    const base = Math.floor((total / questions.length) * 100) / 100;
    let used = 0;
    setQuestions((current) => current.map((q, index) => { const points = index === current.length - 1 ? Math.round((total - used) * 100) / 100 : base; used += points; return { ...q, points }; }));
  }

  function questionPayload(question: Question) {
    let options: string[] = [];
    let acceptedAnswers: string[] = [];
    if (question.type === "multiple_choice" || question.type === "multiple_select") {
      options = question.options.map((o) => o.text.trim()).filter(Boolean);
      acceptedAnswers = question.options.filter((o) => o.correct && o.text.trim()).map((o) => o.text.trim());
    } else if (question.type === "ordering") {
      options = question.options.map((o) => o.text.trim()).filter(Boolean);
      acceptedAnswers = [...options];
    } else if (question.type === "true_false") {
      acceptedAnswers = question.accepted.length ? question.accepted : ["true"];
    } else acceptedAnswers = question.accepted;
    return { type: question.type, prompt: question.prompt.trim(), points: Number(question.points), options, acceptedAnswers };
  }
  function validateBuilder() {
    if (!classId || !subjectId) return "Choose an assigned class and subject.";
    if (!work.title.trim()) return "Give the work a clear title.";
    if (!work.workDate) return "Choose the assessment date.";
    if (work.opensAt && work.dueAt && new Date(work.opensAt) >= new Date(work.dueAt)) return "Closing time must be later than opening time.";
    if (!questions.length) return "Add at least one question.";
    if (allocated !== Number(work.maxScore)) return `The questions add up to ${allocated} marks but the work is out of ${work.maxScore}.`;
    for (let index = 0; index < questions.length; index += 1) {
      const q = questions[index];
      if (!q.prompt.trim()) return `Question ${index + 1} needs a question/prompt.`;
      if ((q.type === "multiple_choice" || q.type === "multiple_select") && q.options.filter((o) => o.text.trim()).length < 2) return `Question ${index + 1} needs at least two options.`;
      if (q.type === "multiple_choice" && q.options.filter((o) => o.correct).length !== 1) return `Question ${index + 1} must have exactly one correct option.`;
      if (q.type === "multiple_select" && q.options.filter((o) => o.correct).length < 1) return `Question ${index + 1} needs at least one correct option.`;
      if (!["long_answer", "ordering"].includes(q.type) && !["multiple_choice", "multiple_select"].includes(q.type) && q.accepted.length < 1) return `Question ${index + 1} needs an accepted answer.`;
      if (q.type === "long_answer" && q.accepted.length < 1 && work.markingMode !== "manual") return `Question ${index + 1} needs key ideas/keywords for assisted marking, or switch marking to manual.`;
    }
    return "";
  }

  async function saveWork(publishImmediately: boolean) {
    if (!contexts.activeTermId) { setError("There is no active academic term today."); return; }
    const validation = validateBuilder();
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const opensAt = work.opensAt ? new Date(work.opensAt).toISOString() : null;
      const dueAt = work.dueAt ? new Date(work.dueAt).toISOString() : null;
      const created = await api("/api/school/teacher-academic-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createWork", termId: contexts.activeTermId, classId, subjectId, ...work, opensAt, dueAt, questionList: questions.map(questionPayload) }) });
      const workId = created?.result?.id as string | undefined;
      if (publishImmediately && workId) await api("/api/school/teacher-academic-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publishWork", workId }) });
      setNotice(publishImmediately ? "Work published. The configured opening and closing times now control learner access." : "Work saved as a draft. You can review it before publishing.");
      resetBuilder();
      setView("library");
      await loadRoster();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save work."); }
    finally { setBusy(false); }
  }

  function mark(studentId: string, value: string, status: MarkStatus = statuses[studentId] || "present") { setMarks((current) => ({ ...current, [studentId]: value })); setStatuses((current) => ({ ...current, [studentId]: status })); setDirty((current) => ({ ...current, [studentId]: true })); }
  function toggleStudent(studentId: string) { setSelectedStudents((current) => current.includes(studentId) ? current.filter((value) => value !== studentId) : [...current, studentId]); }
  function applyBulk() {
    const value = Number(bulkScore); const max = Number(selectedWork?.maxScore || 0);
    if (!selectedStudents.length) { setError("Select one or more learners first."); return; }
    if (!Number.isFinite(value) || value < 0 || value > max) { setError(`Enter a score between 0 and ${max}.`); return; }
    selectedStudents.forEach((studentId) => mark(studentId, String(value), "present"));
    setNotice(`${selectedStudents.length} learner${selectedStudents.length === 1 ? "" : "s"} now have ${value}/${max}. Review and save.`); setError("");
  }
  function pasteMarks(text: string, start: number) {
    try {
      const students = roster?.students || [];
      const changes = parseMarkSheetPaste(text, start, students.length, Number(selectedWork?.maxScore || 0));
      changes.forEach((change) => { const student = students[change.row]; if (student) mark(student.id, change.value, change.status); });
      setNotice(`${changes.length} pasted row${changes.length === 1 ? "" : "s"} ready to review.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not paste marks."); }
  }
  async function saveMarks() {
    if (!selectedWorkId || !roster) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const existing = new Map((selectedAssessment?.scores || []).map((score) => [score.studentId, score]));
      const payload = roster.students.filter((student) => dirty[student.id] && (marks[student.id] ?? "").trim() !== "").map((student) => { const before = existing.get(student.id); return { studentId: student.id, value: Number(marks[student.id]), status: statuses[student.id] || "present", expected: before ? { id: before.id, value: Number(before.value), status: before.status, enteredAt: before.enteredAt } : null }; });
      if (!payload.length) throw new Error("Change at least one mark before saving.");
      const max = Number(selectedWork?.maxScore || 0);
      if (payload.some((item) => !Number.isFinite(item.value) || item.value < 0 || item.value > max)) throw new Error(`Every mark must be between 0 and ${max}.`);
      const result = await api("/api/school/teacher-academic-workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveMarks", workId: selectedWorkId, marks: payload }) });
      setNotice(`${result.result.saved} mark${result.result.saved === 1 ? "" : "s"} saved to the gradebook.`); setDirty({}); await loadRoster();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save marks."); }
    finally { setBusy(false); }
  }

  const activeTerm = contexts.activeTerm;
  return <div className="tav4-page">
    <section className="tav4-hero">
      <div><span>TEACHER · TEACHING STUDIO</span><h1>Build work the way teachers actually think.</h1><p>Start with <b>Add work</b>, choose the class and timing, build questions visually, then review and publish. The school controls the academic term automatically.</p></div>
      <div className="tav4-term"><Clock3 size={20}/><span>Current school term</span><strong>{activeTerm?.name || "No active term"}</strong><small>{activeTerm?.lifecycle?.daysUntilEnd != null ? `${activeTerm.lifecycle.daysUntilEnd} day(s) to configured end · ${contexts.timezone}` : "Leadership controls the term calendar."}</small></div>
    </section>

    {error ? <div className="tav4-alert bad" role="alert">{error}</div> : null}
    {notice ? <div className="tav4-alert good" role="status"><CheckCircle2 size={17}/>{notice}</div> : null}

    <section className="tav4-context">
      <div><span>TEACHING CONTEXT</span><h2>{classes.length ? "Choose where you are teaching" : "No assigned teaching context"}</h2></div>
      <div className="tav4-context-grid">
        <label>Class<select value={classId} onChange={(event) => chooseClass(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
        <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{subjectAssignments.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.subject.name}</option>)}</select></label>
        <div className="tav4-readonly"><span>Term</span><strong>{activeTerm?.name || "Not active"}</strong><small>Set by the school, not the teacher</small></div>
        <div className="tav4-readonly"><span>Learners</span><strong>{roster?.students.length || 0}</strong><small>Only learners in this teaching scope</small></div>
      </div>
    </section>

    <nav className="tav4-switch" aria-label="Teaching studio areas">
      <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><Layers3 size={17}/>My work</button>
      <button className={view === "marks" ? "active" : ""} onClick={() => setView("marks")}><ClipboardCheck size={17}/>Markbook</button>
      <button className="primary" onClick={beginWork} disabled={!writable || !classId || !subjectId}><Plus size={17}/>Add work</button>
    </nav>

    {view === "library" ? <section className="tav4-card">
      <header><div><span>MY WORK</span><h2>Assessments, homework and class activities</h2><p>Open a work to mark it, review learner submissions or publish a saved draft.</p></div><button className="tav4-primary" onClick={beginWork} disabled={!writable || !classId || !subjectId}><Plus size={17}/>Add work</button></header>
      <div className="tav4-work-list">{(roster?.works || []).length ? (roster?.works || []).map((item) => <article key={item.id}>
        <div className="tav4-work-icon"><FileText size={19}/></div><div><span>{item.kind} · Week {item.weekNumber} · Work {item.workNumber}</span><h3>{item.title}</h3><p>{new Date(item.workDate).toLocaleDateString("en-GH")} · {Number(item.maxScore)} marks · {item.attemptLimit} attempt{item.attemptLimit === 1 ? "" : "s"}{item.dueAt ? ` · closes ${new Date(item.dueAt).toLocaleString("en-GH")}` : ""}</p></div>
        <aside><span className={`tav4-status ${item.status}`}>{item.status}</span><button onClick={() => { setSelectedWorkId(item.id); setView("marks"); }}>Open markbook</button>{item.status === "published" ? <Link href={`/teacher/studio/review?workId=${encodeURIComponent(item.id)}`}>Review submissions</Link> : null}</aside>
      </article>) : <div className="tav4-empty"><FileQuestion size={34}/><strong>No work created for this class and subject yet.</strong><span>Use Add work to build homework, quizzes, tests, exercises or exams.</span><button onClick={beginWork}><Plus size={16}/>Add your first work</button></div>}</div>
    </section> : null}

    {view === "builder" ? <section className="tav4-builder">
      <header className="tav4-builder-head"><div><span>NEW WORK</span><h2>{work.title || "Untitled work"}</h2><p>Three short steps. Nothing is published until you choose to publish it.</p></div><button onClick={() => { resetBuilder(); setView("library"); }}><ArrowLeft size={16}/>Back to my work</button></header>
      <div className="tav4-steps">{[[1,"Set up"],[2,"Questions"],[3,"Review"]].map(([number,label]) => <button key={String(number)} className={builderStep === number ? "active" : builderStep > Number(number) ? "done" : ""} onClick={() => setBuilderStep(Number(number))}><span>{builderStep > Number(number) ? <Check size={15}/> : number}</span>{label}</button>)}</div>

      {builderStep === 1 ? <div className="tav4-step-panel">
        <div className="tav4-section-title"><div><span>1 · DETAILS & DELIVERY</span><h3>What are you giving the class?</h3></div><Sparkles size={22}/></div>
        <div className="tav4-form-grid">
          <label>Type<select value={work.kind} onChange={(event) => setWork({ ...work, kind: event.target.value as WorkDraft["kind"] })}>{["Homework","Classwork","Exercise","Participation","Quiz","Exam"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Week<input type="number" min={1} max={60} value={work.weekNumber} onChange={(event) => setWork({ ...work, weekNumber: Number(event.target.value) })}/></label>
          <label>Work number<input type="number" min={1} max={50} value={work.workNumber} onChange={(event) => setWork({ ...work, workNumber: Number(event.target.value) })}/></label>
          <label>Assessment date<input type="date" value={work.workDate} onChange={(event) => setWork({ ...work, workDate: event.target.value })}/></label>
          <label>Overall marks<input type="number" min={1} value={work.maxScore} onChange={(event) => setWork({ ...work, maxScore: Number(event.target.value) })}/></label>
          <label className="span-2">Title<input value={work.title} onChange={(event) => setWork({ ...work, title: event.target.value })} placeholder="e.g. Week 4 Fractions Quiz · Work 2"/></label>
          <label className="span-3">Instructions<textarea rows={4} value={work.instructions} onChange={(event) => setWork({ ...work, instructions: event.target.value })} placeholder="Tell learners what to do, what to bring, and any submission rules."/></label>
        </div>
        <div className="tav4-window"><div><Clock3 size={19}/><span><b>Online availability</b><small>Leave blank to make it available immediately after publishing.</small></span></div><label>Opens at<input type="datetime-local" value={work.opensAt} onChange={(event) => setWork({ ...work, opensAt: event.target.value })}/></label><label>Closes at<input type="datetime-local" value={work.dueAt} onChange={(event) => setWork({ ...work, dueAt: event.target.value })}/></label></div>
        <div className="tav4-marking"><label>Marking<select value={work.markingMode} onChange={(event) => setWork({ ...work, markingMode: event.target.value as WorkDraft["markingMode"] })}><option value="auto">Auto-mark objective answers</option><option value="review">Auto-mark objective + teacher review written work</option><option value="manual">Teacher marks everything</option></select></label><label>Attempts<input type="number" min={1} max={10} value={work.attemptLimit} onChange={(event) => setWork({ ...work, attemptLimit: Number(event.target.value) })}/></label><label>Gradebook result<select value={work.attemptScorePolicy} onChange={(event) => setWork({ ...work, attemptScorePolicy: event.target.value as "highest" | "latest" })}><option value="highest">Highest graded attempt</option><option value="latest">Latest graded attempt</option></select></label></div>
        <div className="tav4-next"><button className="tav4-primary" onClick={() => { if (!work.title.trim()) { setError("Give the work a clear title before adding questions."); return; } setError(""); setBuilderStep(2); }}><span>Next: add questions</span><ArrowRight size={16}/></button></div>
      </div> : null}

      {builderStep === 2 ? <div className="tav4-step-panel">
        <div className="tav4-section-title"><div><span>2 · QUESTION BUILDER</span><h3>Build questions visually</h3><p>Correct answers are selected directly on the options—no mysterious “accepted answer” textbox for multiple choice.</p></div><div className="tav4-question-actions"><button onClick={equalizeMarks} disabled={!questions.length}>Distribute {work.maxScore} marks</button><button className="tav4-primary" onClick={() => setShowQuestionPalette((current) => !current)}><Plus size={16}/>Add question</button></div></div>
        {showQuestionPalette ? <div className="tav4-palette">{qMeta.map((meta) => { const Icon = meta.icon; return <button key={meta.type} onClick={() => addQuestion(meta.type)}><span><Icon size={19}/></span><b>{meta.label}</b><small>{meta.short}</small></button>; })}</div> : null}
        <div className="tav4-total"><span>{questions.length} question{questions.length === 1 ? "" : "s"}</span><strong className={allocated === Number(work.maxScore) ? "ok" : "warn"}>{allocated} / {work.maxScore} marks allocated</strong></div>
        <div className="tav4-question-list">{questions.length ? questions.map((question, index) => <QuestionEditor key={question.id} question={question} number={index + 1} first={index === 0} last={index === questions.length - 1} onPatch={(patch) => patchQuestion(question.id, patch)} onDelete={() => deleteQuestion(question.id)} onDuplicate={() => duplicateQuestion(question.id)} onMove={moveQuestion} onAddOption={() => addOption(question.id)} onPatchOption={(optionId, text) => patchOption(question.id, optionId, text)} onChooseOption={(optionId, multi) => chooseOption(question.id, optionId, multi)} onRemoveOption={(optionId) => removeOption(question.id, optionId)} onAddAccepted={() => addAccepted(question.id)}/>) : <button className="tav4-add-empty" onClick={() => setShowQuestionPalette(true)}><Plus size={26}/><strong>Add your first question</strong><span>Choose MCQ, checkboxes, true/false, short answer, number, ordering or written response.</span></button>}</div>
        <div className="tav4-next split"><button onClick={() => setBuilderStep(1)}><ArrowLeft size={16}/>Back</button><button className="tav4-primary" onClick={() => { const validation = validateBuilder(); if (validation && validation.startsWith("Question")) { setError(validation); return; } if (!questions.length) { setError("Add at least one question."); return; } if (allocated !== Number(work.maxScore)) { setError(`Allocate exactly ${work.maxScore} marks before review.`); return; } setError(""); setBuilderStep(3); }}>Review work<ArrowRight size={16}/></button></div>
      </div> : null}

      {builderStep === 3 ? <div className="tav4-step-panel">
        <div className="tav4-section-title"><div><span>3 · REVIEW & PUBLISH</span><h3>Check the whole work before learners see it</h3></div><ClipboardCheck size={24}/></div>
        <div className="tav4-review-grid"><article><span>Class & subject</span><strong>{classes.find((item) => item.id === classId)?.name || "—"}</strong><small>{subjectAssignments.find((item) => item.subjectId === subjectId)?.subject.name || "—"}</small></article><article><span>Assessment</span><strong>{work.kind} · Week {work.weekNumber}</strong><small>Work {work.workNumber} · {work.workDate}</small></article><article><span>Questions</span><strong>{questions.length}</strong><small>{allocated} / {work.maxScore} marks</small></article><article><span>Availability</span><strong>{work.opensAt ? new Date(work.opensAt).toLocaleString("en-GH") : "Immediately when published"}</strong><small>{work.dueAt ? `Closes ${new Date(work.dueAt).toLocaleString("en-GH")}` : "No closing time"}</small></article></div>
        <div className="tav4-preview"><header><span>{work.kind.toUpperCase()} · WEEK {work.weekNumber} · WORK {work.workNumber}</span><h3>{work.title}</h3><p>{work.instructions || "No additional instructions."}</p></header>{questions.map((q, index) => <article key={q.id}><span>QUESTION {index + 1} · {q.points} MARK{q.points === 1 ? "" : "S"}</span><strong>{q.prompt || "Untitled question"}</strong><small>{qMeta.find((meta) => meta.type === q.type)?.label}</small></article>)}</div>
        <div className="tav4-publish-bar"><button onClick={() => setBuilderStep(2)}><ArrowLeft size={16}/>Edit questions</button><div><button disabled={busy} onClick={() => void saveWork(false)}><Save size={16}/>{busy ? "Saving…" : "Save draft"}</button><button className="tav4-primary" disabled={busy} onClick={() => void saveWork(true)}><Send size={16}/>{busy ? "Publishing…" : "Publish to learners"}</button></div></div>
      </div> : null}
    </section> : null}

    {view === "marks" ? <section className="tav4-card">
      <header><div><span>MARKBOOK</span><h2>Enter marks fast, then save once</h2><p>Select a work, type down the class list, paste a spreadsheet column, or apply one score to several selected learners.</p></div><ClipboardCheck size={23}/></header>
      <div className="tav4-markbar"><label>Assessment / work<select value={selectedWorkId} onChange={(event) => setSelectedWorkId(event.target.value)}><option value="">Choose work…</option>{(roster?.works || []).map((item) => <option key={item.id} value={item.id}>{item.kind} · Week {item.weekNumber} · #{item.workNumber} · {item.title}</option>)}</select></label>{selectedWork ? <div><span>Out of <b>{Number(selectedWork.maxScore)}</b></span><span>{selectedWork.status}</span></div> : null}</div>
      {selectedWork ? <><div className="tav4-bulk"><div><UsersRound size={17}/><span><b>Same mark for several learners</b><small>Select learners below, type one score, then apply it.</small></span></div><input inputMode="decimal" placeholder={`0–${Number(selectedWork.maxScore)}`} value={bulkScore} onChange={(event) => setBulkScore(event.target.value)}/><button onClick={applyBulk} disabled={!selectedStudents.length}>Apply to {selectedStudents.length || "selected"}</button><button onClick={() => setSelectedStudents((roster?.students || []).map((student) => student.id))}>Select all</button><button onClick={() => setSelectedStudents([])}>Clear</button></div>
      <div className="tav4-marks-table"><table><thead><tr><th></th><th>Learner</th><th>Mark / {Number(selectedWork.maxScore)}</th><th>Status</th></tr></thead><tbody>{(roster?.students || []).map((student, index) => <tr key={student.id} className={selectedStudents.includes(student.id) ? "selected" : ""}><td><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={() => toggleStudent(student.id)}/></td><td><b>{student.name}</b><small>{student.admissionNo}</small></td><td><input inputMode="decimal" value={marks[student.id] ?? ""} onChange={(event) => mark(student.id, event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData("text"); if (text.includes("\n") || text.includes("\t")) { event.preventDefault(); pasteMarks(text, index); } }}/></td><td><select value={statuses[student.id] || "present"} onChange={(event) => mark(student.id, marks[student.id] ?? "0", event.target.value as MarkStatus)}><option value="present">Present</option><option value="absent">Absent</option><option value="excused">Excused</option></select></td></tr>)}</tbody></table></div>
      <div className="tav4-sticky-save"><span>{dirtyCount ? `${dirtyCount} unsaved learner mark${dirtyCount === 1 ? "" : "s"}` : "All entered marks are saved"}</span><button className="tav4-primary" disabled={busy || !dirtyCount} onClick={() => void saveMarks()}><Save size={16}/>{busy ? "Saving…" : "Save marks to gradebook"}</button></div></> : <div className="tav4-empty"><ClipboardCheck size={32}/><strong>Choose a work to enter marks.</strong></div>}
    </section> : null}
  </div>;
}

function QuestionEditor({ question, number, first, last, onPatch, onDelete, onDuplicate, onMove, onAddOption, onPatchOption, onChooseOption, onRemoveOption, onAddAccepted }: {
  question: Question; number: number; first: boolean; last: boolean; onPatch: (patch: Partial<Question>) => void; onDelete: () => void; onDuplicate: () => void; onMove: (id: string, delta: -1 | 1) => void; onAddOption: () => void; onPatchOption: (optionId: string, text: string) => void; onChooseOption: (optionId: string, multi: boolean) => void; onRemoveOption: (optionId: string) => void; onAddAccepted: () => void;
}) {
  const meta = qMeta.find((item) => item.type === question.type)!;
  const multi = question.type === "multiple_select";
  const optionMode = question.type === "multiple_choice" || question.type === "multiple_select";
  const textAnswer = ["short_answer", "fill_blank", "numeric", "long_answer"].includes(question.type);
  return <article className="tav4-question">
    <header><div className="tav4-drag"><GripVertical size={18}/><span>{number}</span></div><div><b>{meta.label}</b><small>{meta.short}</small></div><label>Marks<input type="number" min={0.25} step={0.25} value={question.points} onChange={(event) => onPatch({ points: Number(event.target.value) })}/></label><div className="tav4-qtools"><button aria-label="Move question up" disabled={first} onClick={() => onMove(question.id, -1)}><ChevronUp size={16}/></button><button aria-label="Move question down" disabled={last} onClick={() => onMove(question.id, 1)}><ChevronDown size={16}/></button><button aria-label="Duplicate question" onClick={onDuplicate}><Copy size={15}/></button><button aria-label="Delete question" onClick={onDelete}><Trash2 size={15}/></button></div></header>
    <label className="tav4-prompt">Question<textarea rows={3} value={question.prompt} onChange={(event) => onPatch({ prompt: event.target.value })} placeholder="Write the question clearly…"/></label>
    {optionMode ? <div className="tav4-options"><span>{multi ? "Tick every correct answer" : "Select the correct answer"}</span>{question.options.map((option, index) => <div key={option.id} className={option.correct ? "correct" : ""}><button type="button" className={multi ? "check" : "radio"} aria-label={`Mark option ${index + 1} correct`} onClick={() => onChooseOption(option.id, multi)}>{option.correct ? <Check size={14}/> : null}</button><input value={option.text} onChange={(event) => onPatchOption(option.id, event.target.value)} placeholder={`Option ${index + 1}`}/><button type="button" aria-label={`Remove option ${index + 1}`} disabled={question.options.length <= 2} onClick={() => onRemoveOption(option.id)}><Trash2 size={14}/></button></div>)}<button type="button" className="tav4-add-option" onClick={onAddOption}><Plus size={14}/>Add option</button></div> : null}
    {question.type === "true_false" ? <div className="tav4-truefalse"><span>Correct answer</span><button className={question.accepted[0] === "true" ? "active" : ""} onClick={() => onPatch({ accepted: ["true"] })}>True</button><button className={question.accepted[0] === "false" ? "active" : ""} onClick={() => onPatch({ accepted: ["false"] })}>False</button></div> : null}
    {question.type === "ordering" ? <div className="tav4-ordering"><span>Correct order — learners will arrange these items</span>{question.options.map((option, index) => <div key={option.id}><b>{index + 1}</b><input value={option.text} onChange={(event) => onPatchOption(option.id, event.target.value)} placeholder={`Item ${index + 1}`}/><button disabled={question.options.length <= 2} onClick={() => onRemoveOption(option.id)}><Trash2 size={14}/></button></div>)}<button type="button" className="tav4-add-option" onClick={onAddOption}><Plus size={14}/>Add item</button></div> : null}
    {textAnswer ? <div className="tav4-answers"><span>{question.type === "long_answer" ? "Key ideas / keywords for assisted marking" : "Accepted answer(s)"}</span><div className="tav4-chips">{question.accepted.map((answer) => <button key={answer} type="button" onClick={() => onPatch({ accepted: question.accepted.filter((item) => item !== answer) })}>{answer}<span>×</span></button>)}</div><div className="tav4-answer-add"><input value={question.keywordDraft} onChange={(event) => onPatch({ keywordDraft: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAddAccepted(); } }} placeholder={question.type === "long_answer" ? "Type a key idea, then press Enter" : "Type an accepted answer, then press Enter"}/><button type="button" onClick={onAddAccepted}><Plus size={14}/>Add</button></div>{question.type === "long_answer" ? <small>The system may use these key ideas to suggest a score. The teacher remains responsible for reviewing written work.</small> : null}</div> : null}
  </article>;
}
