"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, GraduationCap } from "lucide-react";

type Assignment = {
  classId: string;
  subjectId: string;
  className: string;
  classLevel: string | null;
  subjectName: string;
  learnerCount: number;
};

type Props = {
  assignments: Assignment[];
  teachingWeeks: number;
  disabled?: boolean;
};

export default function TeacherGradebookLauncher({ assignments, teachingWeeks, disabled = false }: Props) {
  const router = useRouter();
  const classOptions = useMemo(() => {
    const seen = new Set<string>();
    return assignments.filter((assignment) => {
      if (seen.has(assignment.classId)) return false;
      seen.add(assignment.classId);
      return true;
    });
  }, [assignments]);

  const [classId, setClassId] = useState(classOptions[0]?.classId ?? "");
  const subjects = useMemo(() => assignments.filter((assignment) => assignment.classId === classId), [assignments, classId]);
  const [subjectId, setSubjectId] = useState(subjects[0]?.subjectId ?? "");
  const [week, setWeek] = useState(1);
  const selectedAssignment = assignments.find((assignment) => assignment.classId === classId && assignment.subjectId === subjectId);

  function chooseClass(nextClassId: string) {
    setClassId(nextClassId);
    setSubjectId(assignments.find((assignment) => assignment.classId === nextClassId)?.subjectId ?? "");
  }

  function openMarkbook() {
    if (!selectedAssignment || disabled) return;
    router.push(`/teacher/gradebook/${encodeURIComponent(classId)}__${encodeURIComponent(subjectId)}?week=${week}`);
  }

  return (
    <div className="markbook-launcher">
      <div className="markbook-launcher-title">
        <div className="markbook-launcher-icon"><BookOpen size={22} aria-hidden="true" /></div>
        <div><span>OPEN GRADEBOOK</span><h2>Choose what you want to mark</h2><p>Only teaching assignments linked to your account are available.</p></div>
      </div>

      <div className="markbook-launch-steps">
        <label className="markbook-launch-step">
          <span className="markbook-step-number">1</span>
          <div className="markbook-step-copy"><strong><GraduationCap size={15} /> Class</strong><small>Assigned classes only</small></div>
          <select value={classId} disabled={disabled || !classOptions.length} onChange={(event) => chooseClass(event.target.value)}>
            {classOptions.map((assignment) => <option key={assignment.classId} value={assignment.classId}>{assignment.classLevel ? `${assignment.classLevel} · ` : ""}{assignment.className}</option>)}
          </select>
        </label>

        <label className="markbook-launch-step">
          <span className="markbook-step-number">2</span>
          <div className="markbook-step-copy"><strong><BookOpen size={15} /> Subject</strong><small>For the selected class</small></div>
          <select value={subjectId} disabled={disabled || !subjects.length} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((assignment) => <option key={assignment.subjectId} value={assignment.subjectId}>{assignment.subjectName}</option>)}
          </select>
        </label>

        <label className="markbook-launch-step">
          <span className="markbook-step-number">3</span>
          <div className="markbook-step-copy"><strong><CalendarDays size={15} /> Week</strong><small>Teaching week</small></div>
          <select value={week} disabled={disabled} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: teachingWeeks }, (_, index) => index + 1).map((weekNumber) => <option key={weekNumber} value={weekNumber}>Week {weekNumber}</option>)}
          </select>
        </label>
      </div>

      <div className="markbook-launch-footer">
        <div><strong>{selectedAssignment ? `${selectedAssignment.className} · ${selectedAssignment.subjectName}` : "No assigned markbook"}</strong><span>{selectedAssignment ? `${selectedAssignment.learnerCount} learners · Week ${week}` : "Ask school leadership to assign your classes and subjects."}</span></div>
        <button type="button" onClick={openMarkbook} disabled={disabled || !selectedAssignment}>Open markbook <ArrowRight size={17} /></button>
      </div>
    </div>
  );
}
