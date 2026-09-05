"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type ClassOption = { id: string; name: string; level: string | null };
type HouseOption = { id: string; name: string; code: string };

export function StudentEditForm(props: {
  studentId: string;
  admissionNo: string;
  initial: { name: string; dob: string; classId: string; houseId: string; status: string };
  classes: ClassOption[];
  houses: HouseOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [values, setValues] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(props.initial), [values, props.initial]);

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    if (!values.name.trim()) {
      setError("Student full name is required.");
      return;
    }
    if (!["active", "pending", "graduated", "withdrawn", "archived"].includes(values.status)) {
      setError("Choose a valid enrolment status.");
      return;
    }
    setPending(true);
    try {
      await props.action(formData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed. No changes were lost — try again.");
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="product-workspace" aria-label={`Edit ${props.admissionNo}`}>
      <input type="hidden" name="id" value={props.studentId} />
      {error ? (
        <div className="product-state product-state-error" role="alert">
          <h3>Could not save</h3>
          <p>{error}</p>
        </div>
      ) : null}
      {dirty && !pending ? (
        <p role="status" style={{ fontSize: 13, color: "var(--color-warning)" }}>
          Unsaved changes — review the sections below, then Save.
        </p>
      ) : null}

      <div className="product-section">
        <header className="product-section-head">
          <div>
            <span className="product-eyebrow">Identity</span>
            <h2>Who is this learner?</h2>
            <p>Legal full name as it should appear on reports and the ID card. Index {props.admissionNo} never changes.</p>
          </div>
        </header>
        <div className="product-form-section">
          <label className="product-field">
            <span>Full name</span>
            <input name="name" required value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} aria-invalid={!values.name.trim()} />
            <small>Use the official school record spelling, e.g. “Ama Serwaa Mensah”.</small>
          </label>
          <label className="product-field">
            <span>Date of birth</span>
            <input name="dob" type="date" value={values.dob} onChange={(e) => set("dob", e.target.value)} />
            <small>Optional. Used for age checks and official documents only.</small>
          </label>
          <label className="product-field">
            <span>Index number</span>
            <input value={props.admissionNo} readOnly aria-readonly="true" />
            <small>Permanent identifier. It cannot be edited here.</small>
          </label>
        </div>
      </div>

      <div className="product-section">
        <header className="product-section-head">
          <div>
            <span className="product-eyebrow">Academic placement</span>
            <h2>Class & house</h2>
            <p>Placement drives timetable, attendance, assessments and report cards. Changing class keeps all history.</p>
          </div>
        </header>
        <div className="product-form-section">
          <label className="product-field">
            <span>Class</span>
            <select name="classId" value={values.classId} onChange={(e) => set("classId", e.target.value)}>
              <option value="">Unassigned — needs placement</option>
              {props.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level ? `${c.level} · ` : ""}{c.name}
                </option>
              ))}
            </select>
            <small>Unassigned learners appear in “Needs placement” until resolved.</small>
          </label>
          <label className="product-field">
            <span>House</span>
            <select name="houseId" value={values.houseId} onChange={(e) => set("houseId", e.target.value)}>
              <option value="">No house assigned</option>
              {props.houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.code})
                </option>
              ))}
            </select>
            <small>Houses power pastoral groups and inter-house activities.</small>
          </label>
        </div>
      </div>

      <div className="product-section">
        <header className="product-section-head">
          <div>
            <span className="product-eyebrow">Administrative</span>
            <h2>Enrolment status</h2>
            <p>Withdrawn learners keep attendance, marks, reports and finance. Never delete a learner to “remove” them.</p>
          </div>
        </header>
        <div className="product-form-section">
          <label className="product-field">
            <span>Status</span>
            <select name="status" value={values.status} onChange={(e) => set("status", e.target.value)} required>
              <option value="active">Active — attending</option>
              <option value="pending">Pending — admitted, not started</option>
              <option value="graduated">Graduated — completed</option>
              <option value="withdrawn">Withdrawn — left school</option>
              <option value="archived">Archived — historical record</option>
            </select>
            <small>Use “Withdrawn — left school” when a learner leaves.</small>
          </label>
        </div>
      </div>

      <div className="product-sticky-actions">
        <Link className="button secondary" href={`/school/students/${props.studentId}`}>
          Cancel
        </Link>
        <button type="submit" className="button primary" disabled={pending || !values.name.trim()} aria-busy={pending}>
          {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </form>
  );
}
