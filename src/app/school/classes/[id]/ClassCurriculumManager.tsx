import Link from "next/link";
import type { ClassSubjectOffering } from "@/lib/class-subject-offerings";
import {
  addSubjectsToClass,
  assignTeacherToClassSubject,
  removeSubjectFromClass,
  removeTeacherFromClassSubject,
} from "./curriculum-actions";
import "./class-curriculum.css";

type SubjectOption = { id: string; name: string };
type TeacherOption = { id: string; name: string };

export function ClassCurriculumManager({
  classId,
  offerings,
  subjects,
  teachers,
  canManage,
}: {
  classId: string;
  offerings: ClassSubjectOffering[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  canManage: boolean;
}) {
  const offeredIds = new Set(offerings.map((item) => item.subjectId));
  const available = subjects.filter((subject) => !offeredIds.has(subject.id));

  return (
    <div className="class-curriculum">
      <div className="class-curriculum-intro">
        <div>
          <strong>1. Choose what this class learns.</strong>
          <span>Subjects belong to the class curriculum even before a teacher is assigned.</span>
        </div>
        <div>
          <strong>2. Assign the teacher or teachers.</strong>
          <span>One teacher can handle several subjects in the same class, and a subject can have more than one teacher.</span>
        </div>
      </div>

      {canManage ? (
        <form action={addSubjectsToClass} className="class-curriculum-add">
          <input type="hidden" name="classId" value={classId} />
          <div className="class-curriculum-add-head">
            <div>
              <strong>Add subjects to this class</strong>
              <span>Select every subject learners in this class take, then add them once.</span>
            </div>
            <button className="button primary" type="submit" disabled={available.length === 0}>Add selected subjects</button>
          </div>
          {available.length ? (
            <div className="class-subject-picker">
              {available.map((subject) => (
                <label key={subject.id} className="class-subject-choice">
                  <input type="checkbox" name="subjectIds" value={subject.id} />
                  <span>{subject.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="class-curriculum-note">Every subject in the school library is already attached to this class.</p>
          )}
        </form>
      ) : null}

      {offerings.length === 0 ? (
        <div className="class-curriculum-empty">
          <strong>No subjects in this class yet.</strong>
          <span>{canManage ? "Choose the subjects above. Teachers can be assigned immediately afterwards." : "A school administrator needs to add this class's subjects."}</span>
          <Link href="/school/subjects">Open subject library</Link>
        </div>
      ) : (
        <div className="class-offering-list">
          {offerings.map((offering) => {
            const assigned = new Set(offering.teachers.map((teacher) => teacher.id));
            const availableTeachers = teachers.filter((teacher) => !assigned.has(teacher.id));
            return (
              <article className="class-offering-card" key={offering.subjectId}>
                <div className="class-offering-title">
                  <div>
                    <Link href={`/school/subjects/${offering.subjectId}`}>{offering.subjectName}</Link>
                    <span>{offering.teachers.length ? `${offering.teachers.length} teacher${offering.teachers.length === 1 ? "" : "s"} assigned` : "Teacher not assigned yet"}</span>
                  </div>
                  <span className={`class-offering-status ${offering.teachers.length ? "ready" : "attention"}`}>
                    {offering.teachers.length ? "Ready" : "Needs teacher"}
                  </span>
                </div>

                <div className="class-teacher-list">
                  {offering.teachers.length ? offering.teachers.map((teacher) => (
                    <div className="class-teacher-chip" key={teacher.id}>
                      <span>{teacher.name}</span>
                      {canManage ? (
                        <form action={removeTeacherFromClassSubject}>
                          <input type="hidden" name="classId" value={classId} />
                          <input type="hidden" name="subjectId" value={offering.subjectId} />
                          <input type="hidden" name="teacherId" value={teacher.id} />
                          <button type="submit" aria-label={`Remove ${teacher.name} from ${offering.subjectName}`}>Remove</button>
                        </form>
                      ) : null}
                    </div>
                  )) : <span className="class-curriculum-note">No teacher assigned.</span>}
                </div>

                {canManage ? (
                  <div className="class-offering-actions">
                    <form action={assignTeacherToClassSubject} className="class-teacher-assign-form">
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="subjectId" value={offering.subjectId} />
                      <label>
                        <span className="sr-only">Teacher for {offering.subjectName}</span>
                        <select name="teacherId" required defaultValue="" disabled={availableTeachers.length === 0}>
                          <option value="" disabled>{availableTeachers.length ? "Choose teacher" : "All teachers assigned"}</option>
                          {availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                        </select>
                      </label>
                      <button className="button secondary" type="submit" disabled={availableTeachers.length === 0}>Assign teacher</button>
                    </form>

                    <form action={removeSubjectFromClass}>
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="subjectId" value={offering.subjectId} />
                      <button className="class-remove-subject" type="submit">Remove subject</button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <div className="class-curriculum-footer">
        <Link href="/school/subjects">Manage subject library</Link>
        <span>The subject library defines names. This class page defines which subjects this class actually learns.</span>
      </div>
    </div>
  );
}
