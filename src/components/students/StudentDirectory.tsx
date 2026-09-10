"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

type Student = {
  id: string;
  name: string;
  admissionNo: string;
  status: string;
  photoUrl: string | null;
  class: { id: string; name: string; level: string | null } | null;
};

type SchoolClass = { id: string; name: string; level: string | null };

export function StudentDirectory({ students, classes, initialClassId = "all" }: { students: Student[]; classes: SchoolClass[]; initialClassId?: string }) {
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(classes.some((item) => item.id === initialClassId) ? initialClassId : initialClassId === "unassigned" ? "unassigned" : "all");
  const [status, setStatus] = useState("active");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => {
      if (q && !`${student.name} ${student.admissionNo}`.toLowerCase().includes(q)) return false;
      if (classId === "unassigned" && student.class) return false;
      if (classId !== "all" && classId !== "unassigned" && student.class?.id !== classId) return false;
      if (status !== "all" && student.status !== status) return false;
      return true;
    });
  }, [classId, query, status, students]);

  return (
    <div className="student-directory-simple">
      <div className="student-directory-toolbar">
        <label>
          <span>Search learners</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or index number" />
        </label>
        <label>
          <span>Class</span>
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="all">All classes</option>
            <option value="unassigned">Needs class placement</option>
            {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <div className="student-directory-count"><strong>{filtered.length}</strong> learner{filtered.length === 1 ? "" : "s"} shown</div>

      {filtered.length ? (
        <div className="student-directory-list">
          {filtered.map((student) => (
            <Link href={`/school/students/${student.id}`} className="student-directory-row" key={student.id}>
              <span className="student-directory-avatar">
                {student.photoUrl ? <Image src={student.photoUrl} alt="" width={44} height={44} unoptimized /> : student.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="student-directory-main">
                <strong>{student.name}</strong>
                <small>{student.admissionNo} · {student.class ? `${student.class.level ? `${student.class.level} · ` : ""}${student.class.name}` : "Needs class placement"}</small>
              </span>
              <span className={`student-directory-status ${student.status === "active" ? "is-active" : ""}`}>{student.status}</span>
              <span className="student-directory-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="student-directory-empty"><strong>No learners match these filters.</strong><span>Change the search, class or status filter.</span></div>
      )}
    </div>
  );
}
