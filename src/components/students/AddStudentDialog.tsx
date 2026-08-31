"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { StudentPhotoCapture } from "@/components/students/StudentPhotoCapture";
import { OptimisticSubmitButton } from "@/components/ui/OptimisticSubmitButton";
import { Tooltip } from "@/components/ui/Tooltip";

type SchoolClass = { id: string; name: string; level: string | null; _count: { students: number } };
type CreateStudentAction = (formData: FormData) => Promise<void>;

type Props = {
  classes: SchoolClass[];
  action: CreateStudentAction;
  triggerLabel?: string;
  initialOpen?: boolean;
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

export function AddStudentDialog({ classes, action, triggerLabel = "+ Add student", initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

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
    window.history.replaceState(null, "", "/school/students?action=create");
  }

  function closeDialog() {
    setOpen(false);
    setStep(0);
    window.history.replaceState(null, "", "/school/students");
  }

  return (
    <>
      <button type="button" className="button primary" onClick={openDialog}>{triggerLabel}</button>
      <noscript>
        <Link href="/school/students/create" className="button primary">{triggerLabel}</Link>
      </noscript>
      {open ? (
        <div className="student-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="add-student-title">
            <header className="student-dialog-header">
              <div>
                <div className="eyebrow">Student admission</div>
                <h2 id="add-student-title">Create a new learner</h2>
                <p>Complete the learner record in a calm guided flow. SukuuNova generates the Index Number automatically.</p>
              </div>
              <Tooltip label="Close student admission dialog">
                <button type="button" className="dialog-close" onClick={closeDialog} aria-label="Close">×</button>
              </Tooltip>
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
                <div className="dialog-panel" hidden={step !== 0} aria-hidden={step !== 0}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 1</span><h3>Start with the learner</h3><p>Enter the essentials that identify this student throughout SukuuNova.</p></div><span className="panel-badge">Required</span></div>
                  <div className="dialog-grid two"><Field label="Full name" required><input name="name" required autoFocus={step === 0} placeholder="e.g. Ama Mensah" /></Field><Field label="Date of birth"><input name="dob" type="date" /></Field></div>
                  <div className="dialog-info-card"><strong>Automatic Index Number</strong><span>The system creates the unique learner identifier after saving. Staff never type or edit it.</span><b>SN-{new Date().getFullYear()}-••••••</b></div>
                </div>

                <div className="dialog-panel" hidden={step !== 1} aria-hidden={step !== 1}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 2</span><h3>Place the learner</h3><p>Choose the class group that will drive the learner&apos;s day-to-day school workflows.</p></div><span className="panel-badge">Academic</span></div>
                  <div className="dialog-grid two"><Field label="Academic year"><input name="academicYear" placeholder="e.g. 2026/2027" /></Field><Field label="Admission date"><input name="admissionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Grade / class group"><select name="classId" defaultValue=""><option value="">Leave unassigned</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name} · {schoolClass._count.students} learners</option>)}</select></Field><Field label="Entry type"><select name="entryType" defaultValue="New enrollment"><option>New enrollment</option><option>Transfer in</option><option>Re-enrollment</option><option>Returning learner</option></select></Field></div>
                  <div className="dialog-info-card subtle"><strong>Why placement matters</strong><span>Class membership becomes the common context for attendance, timetable, teaching, assessments, report cards and class communication.</span></div>
                </div>

                <div className="dialog-panel" hidden={step !== 2} aria-hidden={step !== 2}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 3</span><h3>Connect the family</h3><p>Add the primary contact that should receive school communication and be connected to the learner.</p></div><span className="panel-badge">Recommended</span></div>
                  <div className="dialog-grid two"><Field label="Primary parent / guardian"><input name="guardianName" placeholder="e.g. Akosua Mensah" /></Field><Field label="Phone / WhatsApp"><input name="guardianPhone" inputMode="tel" placeholder="024 000 0000" /></Field><Field label="Relationship"><select name="guardianRelationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></Field></div>
                  <div className="dialog-callout"><span className="callout-icon">◎</span><div><strong>One family record can serve more than one learner</strong><p>Once the guardian exists, it can later be linked to siblings and used for attendance alerts, receipts, messages and parent access.</p></div></div>
                </div>

                <div className="dialog-panel" hidden={step !== 3} aria-hidden={step !== 3}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 4</span><h3>Take the portrait and review</h3><p>Use the laptop/phone camera or upload a clear portrait before the final save.</p></div><span className="panel-badge">Final</span></div>
                  <div className="photo-review-layout">
                    <StudentPhotoCapture />
                    <div className="review-summary">
                      <div className="review-title">Creation summary</div>
                      <div className="review-row"><span>Learner</span><b>Identity information</b></div>
                      <div className="review-row"><span>Index</span><b>Generated automatically</b></div>
                      <div className="review-row"><span>Class</span><b>Selected placement</b></div>
                      <div className="review-row"><span>Family</span><b>Primary guardian</b></div>
                      <div className="review-row"><span>Portrait</span><b>List + profile</b></div>
                      <div className="review-security"><strong>Real school data only</strong><span>No sample learner is created. The new record belongs only to this school.</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <footer className="student-dialog-footer">
                <div className="dialog-footer-note"><span className="secure-dot" />Secure school record</div>
                <div className="dialog-footer-actions">
                  <button type="button" className="button secondary" onClick={() => step === 0 ? closeDialog() : setStep((value) => value - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
                  {step < steps.length - 1 ? <button type="button" className="button primary" onClick={() => setStep((value) => value + 1)}>Continue <span>→</span></button> : <OptimisticSubmitButton className="button primary" pendingLabel="Creating student…">Create student &amp; generate index <span>→</span></OptimisticSubmitButton>}
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
