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
    const firstSubject = assignments.find((assignment) => assignment.classId === nextClassId);
    setSubjectId(firstSubject?.subjectId ?? "");
  }

  function openWorksheet() {
    if (!classId || !subjectId || !week || disabled) return;
    router.push(`/teacher/gradebook/${encodeURIComponent(classId)}__${encodeURIComponent(subjectId)}?week=${week}`);
  }

  return (
    <div className="weekly-launcher">
      <div className="weekly-launcher-heading">
        <div>
          <span>OPEN MARKS WORKSHEET</span>
          <h3>Choose where you are entering marks</h3>
          <p>Only classes and subjects assigned to you are available. SukuuNova uses the school&apos;s active term automatically.</p>
        </div>
        <div className="weekly-launcher-badge"><BookOpen size={19} aria-hidden="true" /> Weekly marks</div>
      </div>

      <div className="weekly-launcher-grid">
        <label>
          <span><GraduationCap size={14} aria-hidden="true" /> Class</span>
          <select value={classId} disabled={disabled || !classOptions.length} onChange={(event) => chooseClass(event.target.value)}>
            {classOptions.map((assignment) => <option key={assignment.classId} value={assignment.classId}>{assignment.classLevel ? `${assignment.classLevel} · ` : ""}{assignment.className}</option>)}
          </select>
        </label>

        <label>
          <span><BookOpen size={14} aria-hidden="true" /> Subject</span>
          <select value={subjectId} disabled={disabled || !subjects.length} onChange={(event) => setSubjectId(event.target.value)}>
            {subjects.map((assignment) => <option key={assignment.subjectId} value={assignment.subjectId}>{assignment.subjectName}</option>)}
          </select>
        </label>

        <label>
          <span><CalendarDays size={14} aria-hidden="true" /> Week</span>
          <select value={week} disabled={disabled} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: teachingWeeks }, (_, index) => index + 1).map((weekNumber) => <option key={weekNumber} value={weekNumber}>Week {weekNumber}</option>)}
          </select>
        </label>
      </div>

      <div className="weekly-launcher-footer">
        <div>
          <strong>{selectedAssignment ? `${selectedAssignment.className} · ${selectedAssignment.subjectName}` : "Choose an assigned class and subject"}</strong>
          <span>{selectedAssignment ? `${selectedAssignment.learnerCount} learners · Week ${week}` : ""}</span>
        </div>
        <button type="button" onClick={openWorksheet} disabled={disabled || !selectedAssignment}>
          Open Week {week} Worksheet <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
