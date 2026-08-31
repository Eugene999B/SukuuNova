"use client";

import { useEffect, useMemo, useState } from "react";

type Assignment = { classId: string; subjectId: string; class: { name: string; level: string | null }; subject: { name: string } };
type Term = { id: string; name: string; academicYear?: { name: string } | null };
type Student = { id: string; name: string; admissionNo: string; classId: string | null };
type Assessment = { id: string; name: string; type: string; maxScore: number | string };
type Score = { studentId: string; assessmentId: string; value: number | string };
type Homework = { id: string; className: string; subjectName: string; termName: string | null; title: string; assignmentStatus: string };
type TimetableSlot = { id: string; dayOfWeek: number; period: number; class: { name: string; level: string | null }; subject: { name: string } };
type Props = { assignments: Assignment[]; terms: Term[]; timetable: TimetableSlot[]; initialTab?: "gradebook" | "homework" | "timetable" };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, credentials: "same-origin", headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || "Request failed.");
  return data;
}
function classLabel(a: Assignment) { return `${a.class.level ? `${a.class.level} · ` : ""}${a.class.name} · ${a.subject.name}`; }

export default function TeacherTeachingWorkspaceV2({ assignments, terms, timetable, initialTab = "gradebook" }: Props) {
  const [tab, setTab] = useState<"gradebook" | "homework" | "timetable">(initialTab);
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [termId, setTermId] = useState(terms[0]?.id || "");
  const [gradebook, setGradebook] = useState<{ students: Student[]; assessments: Assessment[]; scores: Score[] }>({ students: [], assessments: [], scores: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [assessment, setAssessment] = useState({ name: "", type: "Class Test", weight: "10", maxScore: "100" });
  const [homework, setHomework] = useState<Homework[]>([]);
  const [homeworkForm, setHomeworkForm] = useState({ title: "", instructions: "", dueDate: "", points: "" });
  const selectedAssignment = assignments[assignmentIndex];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  async function loadGradebook() {
    if (!selectedAssignment || !termId) return;
    setLoading(true); setError("");
    try {
      const data = await api(`/api/mvp/gradebook?classId=${encodeURIComponent(selectedAssignment.classId)}&subjectId=${encodeURIComponent(selectedAssignment.subjectId)}&termId=${encodeURIComponent(termId)}`);
      setGradebook({ students: data.students || [], assessments: data.assessments || [], scores: data.scores || [] });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the gradebook."); } finally { setLoading(false); }
  }
  async function loadHomework() {
    setError("");
    try { const data = await api("/api/school/homework"); setHomework(data.rows || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load homework."); }
  }
  useEffect(() => { void loadGradebook(); }, [assignmentIndex, termId]);
  useEffect(() => { if (tab === "homework") void loadHomework(); }, [tab]);
  const scoreMap = useMemo(() => new Map(gradebook.scores.map((s) => [`${s.studentId}:${s.assessmentId}`, Number(s.value)])), [gradebook.scores]);

  async function saveScore(studentId: string, assessmentId: string, raw: string, maxScore: number) {
    if (raw.trim() === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) { setError(`Mark must be between 0 and ${maxScore}.`); return; }
    setError(""); setMessage("Saving mark…");
    try { await api("/api/mvp/gradebook", { method: "POST", body: JSON.stringify({ action: "score", studentId, assessmentId, value }) }); setMessage("Mark saved."); await loadGradebook(); }
    catch (e) { setError(e instanceof Error ? e.message : "The mark could not be saved."); setMessage(""); }
  }
  async function createAssessment() {
    if (!selectedAssignment || !termId || !assessment.name.trim()) { setError("Enter an assessment name first."); return; }
    setError(""); setMessage("Creating assessment…");
    try { await api("/api/mvp/gradebook", { method: "POST", body: JSON.stringify({ action: "assessment", termId, classId: selectedAssignment.classId, subjectId: selectedAssignment.subjectId, name: assessment.name, type: assessment.type, weight: Number(assessment.weight), maxScore: Number(assessment.maxScore) }) }); setAssessment((v) => ({ ...v, name: "" })); setMessage("Assessment created."); await loadGradebook(); }
    catch (e) { setError(e instanceof Error ? e.message : "The assessment could not be created."); setMessage(""); }
  }
  async function createHomework() {
    if (!selectedAssignment || !homeworkForm.title || !homeworkForm.instructions || !homeworkForm.dueDate) { setError("Choose a teaching assignment and complete the homework fields."); return; }
    setError(""); setMessage("Creating homework…");
    try { await api("/api/school/homework", { method: "POST", body: JSON.stringify({ classId: selectedAssignment.classId, subjectId: selectedAssignment.subjectId, termId: termId || undefined, title: homeworkForm.title, instructions: homeworkForm.instructions, dueDate: new Date(`${homeworkForm.dueDate}T23:59:59`).toISOString(), points: homeworkForm.points ? Number(homeworkForm.points) : undefined, assignmentStatus: "assigned" }) }); setHomeworkForm({ title: "", instructions: "", dueDate: "", points: "" }); setMessage("Homework created and saved."); await loadHomework(); }
    catch (e) { setError(e instanceof Error ? e.message : "Homework could not be created."); setMessage(""); }
  }

  return <section className="teacher-real-workspace">
    <div className="teacher-real-tabs" role="tablist" aria-label="Teaching workspace"><button type="button" className={tab === "gradebook" ? "active" : ""} onClick={() => setTab("gradebook")}>My Gradebook</button><button type="button" className={tab === "homework" ? "active" : ""} onClick={() => setTab("homework")}>My Homework</button><button type="button" className={tab === "timetable" ? "active" : ""} onClick={() => setTab("timetable")}>My Timetable</button></div>
    {(error || message) && <div className={`teacher-real-message ${error ? "error" : "success"}`}>{error || message}</div>}
    {tab !== "timetable" && <div className="teacher-real-filters"><label>Teaching assignment<select value={assignmentIndex} onChange={(e) => setAssignmentIndex(Number(e.target.value))}>{assignments.length ? assignments.map((a, i) => <option key={`${a.classId}-${a.subjectId}`} value={i}>{classLabel(a)}</option>) : <option value={0}>No assignments</option>}</select></label><label>Academic term<select value={termId} onChange={(e) => setTermId(e.target.value)}>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.academicYear ? ` · ${t.academicYear.name}` : ""}</option>)}</select></label></div>}
    {tab === "gradebook" && <div className="teacher-real-grid"><article className="teacher-real-card"><div className="teacher-real-card-head"><div><span>MARK ENTRY</span><h3>{selectedAssignment ? classLabel(selectedAssignment) : "No teaching assignment"}</h3><p>Only learners in your selected class and subject are displayed.</p></div><button type="button" onClick={() => void loadGradebook()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>{!gradebook.assessments.length ? <div className="teacher-real-empty"><strong>No assessments yet.</strong><p>Create the first assessment for this class and subject below.</p></div> : <div className="teacher-score-table-wrap"><table><thead><tr><th>Learner</th>{gradebook.assessments.map((a) => <th key={a.id}>{a.name}<small>{a.type} · /{a.maxScore}</small></th>)}</tr></thead><tbody>{gradebook.students.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.admissionNo}</small></td>{gradebook.assessments.map((a) => <td key={a.id}><input defaultValue={scoreMap.get(`${student.id}:${a.id}`) ?? ""} type="number" min="0" max={Number(a.maxScore)} step="0.01" aria-label={`${a.name} mark for ${student.name}`} onBlur={(e) => void saveScore(student.id, a.id, e.currentTarget.value, Number(a.maxScore))} /></td>)}</tr>)}</tbody></table></div>}</article><article className="teacher-real-card teacher-real-form"><span>ASSESSMENT SETUP</span><h3>Create an assessment</h3><label>Name<input value={assessment.name} onChange={(e) => setAssessment({ ...assessment, name: e.target.value })} placeholder="e.g. Midterm Test" /></label><label>Type<input value={assessment.type} onChange={(e) => setAssessment({ ...assessment, type: e.target.value })} /></label><div className="teacher-real-form-row"><label>Weight %<input value={assessment.weight} onChange={(e) => setAssessment({ ...assessment, weight: e.target.value })} type="number" min="0.01" max="100" step="0.01" /></label><label>Max score<input value={assessment.maxScore} onChange={(e) => setAssessment({ ...assessment, maxScore: e.target.value })} type="number" min="1" step="0.01" /></label></div><button type="button" onClick={() => void createAssessment()}>Create assessment</button></article></div>}
    {tab === "homework" && <div className="teacher-real-grid"><article className="teacher-real-card teacher-real-form"><span>ASSIGN WORK</span><h3>Create homework</h3><p>{selectedAssignment ? `For ${classLabel(selectedAssignment)}` : "Select a teaching assignment first."}</p><label>Title<input value={homeworkForm.title} onChange={(e) => setHomeworkForm({ ...homeworkForm, title: e.target.value })} /></label><label>Instructions<textarea value={homeworkForm.instructions} onChange={(e) => setHomeworkForm({ ...homeworkForm, instructions: e.target.value })} rows={6} /></label><div className="teacher-real-form-row"><label>Due date<input type="date" value={homeworkForm.dueDate} onChange={(e) => setHomeworkForm({ ...homeworkForm, dueDate: e.target.value })} /></label><label>Points<input type="number" min="0" step="0.01" value={homeworkForm.points} onChange={(e) => setHomeworkForm({ ...homeworkForm, points: e.target.value })} /></label></div><button type="button" onClick={() => void createHomework()}>Save homework</button></article><article className="teacher-real-card"><div className="teacher-real-card-head"><div><span>MY HOMEWORK</span><h3>Recent work</h3><p>Your saved work across assigned teaching groups.</p></div><button type="button" onClick={() => void loadHomework()}>Refresh</button></div>{homework.length ? <div className="teacher-homework-list">{homework.map((item) => <div key={item.id}><div><strong>{item.title}</strong><small>{item.className} · {item.subjectName}{item.termName ? ` · ${item.termName}` : ""}</small></div><span>{item.assignmentStatus}</span></div>)}</div> : <div className="teacher-real-empty"><strong>No homework yet.</strong><p>Create the first one for an assigned class.</p></div>}</article></div>}
    {tab === "timetable" && <article className="teacher-real-card"><span>WEEKLY SCHEDULE</span><h3>My timetable</h3><p>Only timetable slots assigned to your teacher account are shown.</p><div className="teacher-timetable-grid">{days.map((day, index) => <div key={day}><strong>{day}</strong>{timetable.filter((slot) => slot.dayOfWeek === index + 1).map((slot) => <div key={slot.id}><b>P{slot.period}</b><span>{slot.subject.name}</span><small>{slot.class.level ? `${slot.class.level} · ` : ""}{slot.class.name}</small></div>)}{!timetable.some((slot) => slot.dayOfWeek === index + 1) ? <em>No class</em> : null}</div>)}</div></article>}
  </section>;
}
