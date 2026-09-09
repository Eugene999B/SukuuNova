"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Search, ShieldCheck } from "lucide-react";
import { saveClassAttendance } from "./actions";

type Student = { id: string; name: string; admissionNo: string; photoUrl?: string | null };
type EntryType = "present" | "late" | "absent" | "excused";
type ExistingEntry = { decision: EntryType; method: string; timestamp: string };

export function AttendanceRegister({ classId, attendanceDate, students, existing }: { classId: string; attendanceDate: string; students: Student[]; existing: Record<string, ExistingEntry> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, EntryType>>(() => Object.fromEntries(students.filter((student) => !existing[student.id]).map((student) => [student.id, "present"])));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const decisionFor = (studentId: string) => existing[studentId]?.decision ?? values[studentId] ?? "present";
  const counts = useMemo(() => students.reduce((result, student) => {
    const decision = existing[student.id]?.decision ?? values[student.id] ?? "present";
    result[decision] += 1;
    return result;
  }, { present: 0, late: 0, absent: 0, excused: 0 } as Record<EntryType, number>), [existing, students, values]);
  const pendingStudents = useMemo(() => students.filter((student) => !existing[student.id]), [existing, students]);
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => student.name.toLowerCase().includes(query) || student.admissionNo.toLowerCase().includes(query));
  }, [search, students]);

  const setAll = (type: EntryType) => setValues((current) => ({ ...current, ...Object.fromEntries(pendingStudents.map((student) => [student.id, type])) }));
  const save = () => startTransition(async () => {
    setError(""); setMessage("");
    try {
      if (!pendingStudents.length) {
        setMessage("This class already has an attendance decision for every learner.");
        return;
      }
      const result = await saveClassAttendance(classId, attendanceDate, pendingStudents.map((student) => ({ studentId: student.id, type: values[student.id] ?? "present" })));
      setMessage(result.message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attendance could not be saved.");
    }
  });

  return <section className="attendance-register-sheet">
    <header className="attendance-register-head"><div><span>Today's roster</span><h3>Mark exceptions, then save once</h3><p>Everyone not already recorded starts as present. Device scans are locked into the roster automatically so you do not duplicate them.</p></div><div className="attendance-register-progress"><small>Still to decide</small><strong>{pendingStudents.length}</strong><span>of {students.length}</span></div></header>

    <div className="attendance-register-stats"><span><b>{counts.present}</b> Present</span><span><b>{counts.late}</b> Late</span><span><b>{counts.absent}</b> Absent</span><span><b>{counts.excused}</b> Excused</span><span><b>{Object.keys(existing).length}</b> Already recorded</span></div>

    <div className="attendance-register-tools"><label><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learner or admission number" /></label><div><button type="button" onClick={() => setAll("present")} disabled={!pendingStudents.length}>All remaining present</button><button type="button" onClick={() => setAll("absent")} disabled={!pendingStudents.length}>All remaining absent</button></div></div>

    {(error || message) ? <div className={`attendance-register-result ${error ? "error" : "success"}`} role="status">{error ? <ShieldCheck size={16}/> : <CheckCircle2 size={16}/>}<span>{error || message}</span></div> : null}

    <div className="attendance-register-roster">
      {visibleStudents.map((student) => {
        const locked = existing[student.id];
        const decision = decisionFor(student.id);
        return <article key={student.id} className={`attendance-roster-row ${locked ? "locked" : ""}`}>
          <div className="attendance-student-avatar">{student.photoUrl ? <img src={student.photoUrl} alt="" /> : <span>{student.name.split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase()}</span>}</div>
          <div className="attendance-student-name"><strong>{student.name}</strong><small>{student.admissionNo}</small></div>
          {locked ? <div className="attendance-existing"><span className={`attendance-decision ${decision}`}>{decision}</span><small>{locked.method.replaceAll("_"," ")} · {new Date(locked.timestamp).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</small></div> : <div className="attendance-status-buttons">{(["present","late","absent","excused"] as EntryType[]).map((type)=><button type="button" key={type} className={decision===type?`chosen ${type}`:""} onClick={()=>setValues((current)=>({...current,[student.id]:type}))}>{type[0].toUpperCase()+type.slice(1)}</button>)}</div>}
        </article>;
      })}
      {!visibleStudents.length ? <div className="attendance-register-no-results">No learner matches your search.</div> : null}
    </div>

    <footer className="attendance-register-save"><div><strong>{pendingStudents.length ? `${pendingStudents.length} learner${pendingStudents.length===1?"":"s"} will be saved` : "Register complete"}</strong><small>Present and Late are stored as canonical IN attendance so reports, dashboards and devices agree.</small></div><button type="button" disabled={pending || !pendingStudents.length} onClick={save}>{pending ? "Saving register…" : pendingStudents.length ? "Save remaining attendance" : "Nothing left to save"}</button></footer>
  </section>;
}
