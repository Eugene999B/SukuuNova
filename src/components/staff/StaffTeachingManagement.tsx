"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { updateStaffTeachingAssignments } from "@/app/school/staff/actions";
import styles from "./StaffTeachingManagement.module.css";

type SubjectOption = { id: string; name: string };
type ClassOption = { id: string; name: string; level: string | null; subjects: SubjectOption[] };
type Assignment = { classId: string; subjectId: string };
type AssignmentRow = { key: number; classId: string; subjectIds: string[] };
type AccessRole = { id: string; name: string; key: string | null };
type AccessPayload = {
  users: Array<{ id: string; status: string; userRoles: Array<{ role: AccessRole }> }>;
  roles: AccessRole[];
  canControlRoles: boolean;
};

function groupAssignments(assignments: Assignment[]): AssignmentRow[] {
  const grouped = new Map<string, string[]>();
  for (const assignment of assignments) {
    const subjects = grouped.get(assignment.classId) ?? [];
    if (!subjects.includes(assignment.subjectId)) subjects.push(assignment.subjectId);
    grouped.set(assignment.classId, subjects);
  }
  const rows = [...grouped.entries()].map(([classId, subjectIds], index) => ({ key: index + 1, classId, subjectIds }));
  return rows.length ? rows : [{ key: 1, classId: "", subjectIds: [] }];
}

export function StaffTeachingManagement({
  staffId,
  staffName,
  status,
  classes,
  initialAssignments,
  initialRoles,
  canEditAssignments,
}: {
  staffId: string;
  staffName: string;
  status: string;
  classes: ClassOption[];
  initialAssignments: Assignment[];
  initialRoles: string[];
  canEditAssignments: boolean;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>(() => groupAssignments(initialAssignments));
  const [assignmentMessage, setAssignmentMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingAssignments, startAssignmentTransition] = useTransition();
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [roleNames, setRoleNames] = useState<string[]>(initialRoles);
  const [canControlRoles, setCanControlRoles] = useState(false);
  const [roleMessage, setRoleMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingRole, startRoleTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/school/access", { cache: "no-store" });
        const payload = await response.json() as AccessPayload & { message?: string; error?: string };
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not load role options.");
        if (cancelled) return;
        setRoles(payload.roles ?? []);
        setCanControlRoles(Boolean(payload.canControlRoles));
        const target = payload.users?.find((user) => user.id === staffId);
        if (target) setRoleNames(target.userRoles.map(({ role }) => role.name));
      } catch (error) {
        if (!cancelled) setRoleMessage({ ok: false, text: error instanceof Error ? error.message : "Could not load role options." });
      }
    })();
    return () => { cancelled = true; };
  }, [staffId]);

  const selectedClassIds = useMemo(() => new Set(rows.map((row) => row.classId).filter(Boolean)), [rows]);
  const hasTeachingAssignments = initialAssignments.length > 0 || rows.some((row) => row.classId && row.subjectIds.length);

  function setClass(key: number, classId: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, classId, subjectIds: [] } : row));
    setAssignmentMessage(null);
  }

  function toggleSubject(key: number, subjectId: string) {
    setRows((current) => current.map((row) => row.key === key ? {
      ...row,
      subjectIds: row.subjectIds.includes(subjectId) ? row.subjectIds.filter((id) => id !== subjectId) : [...row.subjectIds, subjectId],
    } : row));
    setAssignmentMessage(null);
  }

  function addRow() {
    setRows((current) => [...current, { key: Math.max(0, ...current.map((row) => row.key)) + 1, classId: "", subjectIds: [] }]);
  }

  function removeRow(key: number) {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      return next.length ? next : [{ key: 1, classId: "", subjectIds: [] }];
    });
    setAssignmentMessage(null);
  }

  function saveAssignments() {
    const selected = rows.filter((row) => row.classId || row.subjectIds.length);
    for (const row of selected) {
      if (!row.classId) return setAssignmentMessage({ ok: false, text: "Choose a class for every assignment." });
      if (!row.subjectIds.length) return setAssignmentMessage({ ok: false, text: "Choose at least one subject for every selected class." });
    }
    const ids = selected.map((row) => row.classId);
    if (new Set(ids).size !== ids.length) return setAssignmentMessage({ ok: false, text: "Use each class once and select all of its subjects together." });
    startAssignmentTransition(async () => {
      const result = await updateStaffTeachingAssignments({ staffId, assignments: selected.map(({ classId, subjectIds }) => ({ classId, subjectIds })) });
      setAssignmentMessage({ ok: result.ok, text: result.message });
      if (result.ok) window.location.reload();
    });
  }

  function toggleRole(name: string) {
    setRoleNames((current) => current.includes(name) ? current.filter((role) => role !== name) : [...current, name]);
    setRoleMessage(null);
  }

  function saveRoles() {
    if (!roleNames.length) return setRoleMessage({ ok: false, text: "Choose at least one role." });
    const teachingRoleNames = new Set(["Teacher", "Class Teacher", "Subject Teacher", "Department Head", "Academic Coordinator"]);
    if (hasTeachingAssignments && !roleNames.some((name) => teachingRoleNames.has(name))) {
      return setRoleMessage({ ok: false, text: "Save the removal of teaching assignments first, or keep a teaching role while this staff member still teaches classes." });
    }
    startRoleTransition(async () => {
      try {
        const response = await fetch("/api/school/access", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: staffId, status, roleNames }),
        });
        const payload = await response.json() as { message?: string; error?: string };
        if (!response.ok) throw new Error(payload.message || payload.error || "Could not update roles.");
        setRoleMessage({ ok: true, text: `${staffName}'s role access was updated.` });
        window.location.reload();
      } catch (error) {
        setRoleMessage({ ok: false, text: error instanceof Error ? error.message : "Could not update roles." });
      }
    });
  }

  return <div className={styles.panel}>
    <section className={styles.section}>
      <div className={styles.head}>
        <div><h3>Teaching assignments</h3><p>Assign this teacher to several subjects in one class and different subjects in other classes. Only subjects already offered by the selected class are available.</p></div>
        {canEditAssignments ? <button className={styles.secondary} type="button" onClick={addRow}>＋ Add another class</button> : null}
      </div>
      <div className={styles.rows}>{rows.map((row, index) => {
        const schoolClass = classes.find((item) => item.id === row.classId);
        return <div className={styles.row} key={row.key}>
          <div className={styles.rowHead}><strong>Class assignment {index + 1}</strong>{canEditAssignments ? <button className={styles.remove} type="button" onClick={() => removeRow(row.key)}>Remove</button> : null}</div>
          <label className={styles.field}><span>Class</span><select value={row.classId} onChange={(event) => setClass(row.key, event.target.value)} disabled={!canEditAssignments}><option value="">Choose class</option>{classes.map((item) => <option key={item.id} value={item.id} disabled={item.id !== row.classId && selectedClassIds.has(item.id)}>{item.level ? `${item.level} · ` : ""}{item.name}</option>)}</select></label>
          {schoolClass ? <div className={styles.subjectBox}><span>Subjects in {schoolClass.name}</span>{schoolClass.subjects.length ? <div className={styles.subjects}>{schoolClass.subjects.map((subject) => <label key={subject.id}><input type="checkbox" checked={row.subjectIds.includes(subject.id)} disabled={!canEditAssignments} onChange={() => toggleSubject(row.key, subject.id)} /><span>{subject.name}</span></label>)}</div> : <div className={styles.empty}>No curriculum subjects are configured for this class. Configure the class first in Classes → Subjects & Teachers.</div>}</div> : <div className={styles.empty}>Select a class to see its curriculum subjects.</div>}
        </div>;
      })}</div>
      {canEditAssignments ? <div className={styles.actions}><button className={styles.button} type="button" disabled={pendingAssignments} onClick={saveAssignments}>{pendingAssignments ? "Saving…" : "Save teaching assignments"}</button></div> : null}
      {assignmentMessage ? <div className={styles.message} data-ok={assignmentMessage.ok}>{assignmentMessage.text}</div> : null}
    </section>

    <section className={styles.section}>
      <div className={styles.head}><div><h3>Roles & access</h3><p>Role changes use SukuuNova's existing protected access rules, including Owner continuity and permission-escalation checks.</p></div></div>
      {canControlRoles ? <>
        <div className={styles.roles}>{roles.map((role) => <label key={role.id}><input type="checkbox" checked={roleNames.includes(role.name)} onChange={() => toggleRole(role.name)} /><span>{role.name}</span></label>)}</div>
        {hasTeachingAssignments ? <div className={styles.note}>This staff member has saved or unsaved teaching assignments. Keep at least one teaching role, or save assignment removal before changing fully to a non-teaching role.</div> : null}
        <div className={styles.actions}><button className={styles.button} type="button" disabled={pendingRole} onClick={saveRoles}>{pendingRole ? "Saving…" : "Save roles"}</button></div>
      </> : <div className={styles.empty}>Your account can view this person's roles, but role changes require role-control permission. Current roles: {roleNames.join(", ") || "None"}.</div>}
      {roleMessage ? <div className={styles.message} data-ok={roleMessage.ok}>{roleMessage.text}</div> : null}
    </section>
  </div>;
}
