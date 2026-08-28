"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StudentPhotoCapture } from "@/components/students/StudentPhotoCapture";

type SchoolClass = { id: string; name: string; level: string | null; _count: { students: number } };
type CreateStudentAction = (formData: FormData) => Promise<void>;

type Props = {
  classes: SchoolClass[];
  action: CreateStudentAction;
  triggerLabel?: string;
};

const steps = [
  { key: "identity", title: "Identity", hint: "Name and essential personal details" },
  { key: "placement", title: "Placement", hint: "Academic year, grade and class" },
  { key: "family", title: "Family", hint: "Parent or guardian contact" },
  { key: "photo", title: "Photo & review", hint: "Capture portrait and confirm" },
] as const;

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <label className="student-dialog-field">
      <span>{label}{required ? <em> *</em> : null}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function AddStudentDialog({ classes, action, triggerLabel = "+ Add student" }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openDialog() {
    setStep(0);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setStep(0);
  }

  function next() {
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function back() {
    setStep((current) => Math.max(current - 1, 0));
  }

  return (
    <>
      <button type="button" className="button primary" onClick={openDialog}>{triggerLabel}</button>

      {open ? (
        <div className="student-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="add-student-title">
            <header className="student-dialog-header">
              <div>
                <div className="eyebrow">Student admission</div>
                <h2 id="add-student-title">Create a new learner</h2>
                <p>Complete the essential record once. SukuuNova will generate the learner&apos;s Index Number automatically.</p>
              </div>
              <button type="button" className="dialog-close" onClick={closeDialog} aria-label="Close">×</button>
            </header>

            <div className="student-dialog-progress" aria-label="Student creation steps">
              {steps.map((item, index) => (
                <div key={item.key} className={`dialog-step ${index === step ? "active" : ""} ${index < step ? "complete" : ""}`}>
                  <span>{index < step ? "✓" : index + 1}</span>
                  <div><strong>{item.title}</strong><small>{item.hint}</small></div>
                </div>
              ))}
            </div>

            <form action={action} className="student-dialog-form">
              <div className="student-dialog-body">
                {step === 0 ? (
                  <div className="dialog-panel">
                    <div className="dialog-panel-heading"><div><span className="eyebrow">Step 1</span><h3>Who is this learner?</h3><p>Enter the identity information the school will use across the entire system.</p></div><span className="panel-badge">Required</span></div>
                    <div className="dialog-grid two">
                      <Field label="Full name" required><input name="name" required autoFocus placeholder="e.g. Ama Mensah" /></Field>
                      <Field label="Date of birth"><input name="dob" type="date" /></Field>
                      <Field label="Gender"><select name="gender" defaultValue=""><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></Field>
                      <Field label="Student email"><input name="studentEmail" type="email" placeholder="Optional" /></Field>
                      <Field label="Student phone"><input name="studentPhone" inputMode="tel" placeholder="Optional" /></Field>
                      <Field label="Nationality"><input name="nationality" placeholder="Optional" /></Field>
                    </div>
                    <div className="dialog-info-card"><strong>Index Number</strong><span>Generated automatically by SukuuNova after the record is saved. Staff never type or edit it.</span><b>SN-{new Date().getFullYear()}-••••••</b></div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="dialog-panel">
                    <div className="dialog-panel-heading"><div><span className="eyebrow">Step 2</span><h3>Place the learner</h3><p>Students belong to an academic structure. Select the class now or leave the learner temporarily unassigned.</p></div><span className="panel-badge">Academic</span></div>
                    <div className="dialog-grid two">
                      <Field label="Academic year"><input name="academicYear" placeholder="e.g. 2026/2027" /></Field>
                      <Field label="Admission date"><input name="admissionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                      <Field label="Grade / class group"><select name="classId" defaultValue=""><option value="">Leave unassigned</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name} · {schoolClass._count.students} learners</option>)}</select></Field>
                      <Field label="Entry type"><select name="entryType" defaultValue="New enrollment"><option>New enrollment</option><option>Transfer in</option><option>Re-enrollment</option><option>Returning learner</option></select></Field>
                      <Field label="House / group"><input name="house" placeholder="Optional" /></Field>
                      <Field label="Previous school"><input name="previousSchool" placeholder="Optional" /></Field>
                    </div>
                    <div className="dialog-info-card subtle"><strong>Why placement matters</strong><span>Class assignment becomes the shared context for attendance, timetable, teaching, assessment, report cards and class-based communication.</span></div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="dialog-panel">
                    <div className="dialog-panel-heading"><div><span className="eyebrow">Step 3</span><h3>Connect the family</h3><p>Set the primary parent or guardian so later alerts, receipts and parent access can be linked to the learner.</p></div><span className="panel-badge">Recommended</span></div>
                    <div className="dialog-grid two">
                      <Field label="Primary parent / guardian"><input name="guardianName" placeholder="e.g. Akosua Mensah" /></Field>
                      <Field label="Phone / WhatsApp"><input name="guardianPhone" inputMode="tel" placeholder="024 000 0000" /></Field>
                      <Field label="Email"><input name="guardianEmail" type="email" placeholder="Optional" /></Field>
                      <Field label="Relationship"><select name="guardianRelationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></Field>
                    </div>
                    <div className="dialog-callout"><span className="callout-icon">◎</span><div><strong>Family records stay connected</strong><p>The guardian record can later be reused for siblings, billing notifications, attendance alerts, messages and portal access.</p></div></div>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="dialog-panel">
                    <div className="dialog-panel-heading"><div><span className="eyebrow">Step 4</span><h3>Portrait & final review</h3><p>Capture a clear portrait using the laptop/phone camera or upload one, then confirm before creating the learner.</p></div><span className="panel-badge">Final</span></div>
                    <div className="photo-review-layout">
                      <StudentPhotoCapture />
                      <div className="review-summary">
                        <div className="review-title">What will be created</div>
                        <div className="review-row"><span>Identity</span><b>Saved to learner profile</b></div>
                        <div className="review-row"><span>Index number</span><b>Generated automatically</b></div>
                        <div className="review-row"><span>Class</span><b>Based on your selection</b></div>
                        <div className="review-row"><span>Family</span><b>Primary guardian link</b></div>
                        <div className="review-row"><span>Photo</span><b>List + profile portrait</b></div>
                        <div className="review-security"><strong>Real school data only</strong><span>No sample learner will be created. The record becomes part of this school&apos;s actual database.</span></div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <footer className="student-dialog-footer">
                <div className="dialog-footer-note"><span className="secure-dot" />Secure school record</div>
                <div className="dialog-footer-actions">
                  <button type="button" className="button secondary" onClick={step === 0 ? closeDialog : back}>{step === 0 ? "Cancel" : "Back"}</button>
                  {step < steps.length - 1 ? <button type="button" className="button primary" onClick={next}>Continue <span>→</span></button> : <button type="submit" className="button primary">Create student & generate index <span>→</span></button>}
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
