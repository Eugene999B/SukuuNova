"use client";

import { useMemo, useState, useTransition } from "react";
import { saveClassAttendance } from "./actions";

type Student = { id: string; name: string; admissionNo: string };
type EntryType = "present" | "late" | "absent" | "excused";

export function AttendanceRegister({ classId, attendanceDate, students }: { classId: string; attendanceDate: string; students: Student[] }) {
  const [values, setValues] = useState<Record<string, EntryType>>(() => Object.fromEntries(students.map((s) => [s.id, "present"])));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const counts = useMemo(() => Object.values(values).reduce((n, value) => ({ ...n, [value]: n[value as EntryType] + 1 }), { present: 0, late: 0, absent: 0, excused: 0 } as Record<EntryType, number>), [values]);

  const setAll = (type: EntryType) => setValues(Object.fromEntries(students.map((s) => [s.id, type])));
  const save = () => startTransition(async () => {
    setError(""); setMessage("");
    try {
      const result = await saveClassAttendance(classId, attendanceDate, students.map((student) => ({ studentId: student.id, type: values[student.id] ?? "present" })));
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attendance could not be saved.");
    }
  });

  return <section className="module-card attendance-register">
    <div className="module-section-title"><div><span>Class roster</span><h3>Record attendance once for the whole class</h3><p>Start with everyone present, then change only the exceptions. Save once when the roster is complete.</p></div></div>
    <div className="attendance-register-toolbar"><div className="attendance-summary"><span><b>{students.length}</b> learners</span><span><b>{counts.present}</b> present</span><span><b>{counts.late}</b> late</span><span><b>{counts.absent}</b> absent</span><span><b>{counts.excused}</b> excused</span></div><div className="attendance-quick-actions"><button type="button" onClick={() => setAll("present")}>All present</button><button type="button" onClick={() => setAll("absent")}>All absent</button></div></div>
    {(error || message) ? <div className={`inline-result ${error ? "error" : "success"}`} role="alert">{error || message}</div> : null}
    <div className="module-table-wrap"><table><thead><tr><th>Learner</th><th>Admission no.</th><th>Status</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><strong>{student.name}</strong></td><td>{student.admissionNo}</td><td><div className="attendance-status-group">{(["present", "late", "absent", "excused"] as EntryType[]).map((type) => <button type="button" key={type} className={values[student.id] === type ? `chosen ${type}` : ""} onClick={() => setValues((current) => ({ ...current, [student.id]: type }))}>{type[0].toUpperCase() + type.slice(1)}</button>)}</div></td></tr>)}</tbody></table></div>
    <div className="modal-actions"><a className="secondary" href="/school/attendance">Back to attendance</a><button className="module-hero-button" type="button" disabled={pending || !students.length} onClick={save}>{pending ? "Saving register…" : "Save class attendance →"}</button></div>
  </section>;
}
