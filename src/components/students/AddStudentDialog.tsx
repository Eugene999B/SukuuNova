"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { StudentPhotoCapture } from "@/components/students/StudentPhotoCapture";
import { OptimisticSubmitButton } from "@/components/ui/OptimisticSubmitButton";
import { Tooltip } from "@/components/ui/Tooltip";

type SchoolClass = { id: string; name: string; level: string | null; _count: { students: number } };
type AcademicYearOption = { id: string; name: string; isCurrent: boolean };
type TermOption = { id: string; name: string; academicYearName: string; isCurrent: boolean; isLocked: boolean };
type StudentActionState = { message: string | null };
type CreateStudentAction = (previousState: StudentActionState, formData: FormData) => Promise<StudentActionState>;

type Props = {
  classes: SchoolClass[];
  academicYears: AcademicYearOption[];
  terms: TermOption[];
  action: CreateStudentAction;
  triggerLabel?: string;
  initialOpen?: boolean;
};

const steps = [
  { key: "identity", title: "Identity", hint: "Name and essential personal details" },
  { key: "placement", title: "Placement", hint: "Intake history and proposed term placement" },
  { key: "family", title: "Family", hint: "Parent or guardian contact" },
  { key: "photo", title: "Face & review", hint: "Live portrait capture and final review" },
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

export function AddStudentDialog({ classes, academicYears, terms, action, triggerLabel = "+ Add student", initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);
  const [actionError, setActionError] = useState("");
  const [actionState, formAction] = useActionState(action, { message: null });
  const defaultAcademicYearId = academicYears.find((year) => year.isCurrent)?.id ?? academicYears[0]?.id ?? "";
  const defaultPlacementTermId = terms.find((term) => term.isCurrent && !term.isLocked)?.id ?? "";

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

  useEffect(() => {
    if (actionState.message) setActionError(actionState.message);
  }, [actionState.message]);

  function openDialog() {
    setStep(0);
    setActionError("");
    setOpen(true);
    window.history.replaceState(null, "", "/school/students?action=create");
  }

  function closeDialog() {
    setOpen(false);
    setStep(0);
    setActionError("");
    window.history.replaceState(null, "", "/school/students");
  }

  function prepareSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formData = new FormData(form);
    const photoData = String(formData.get("photoData") ?? "");
    const placementTermId = String(formData.get("placementTermId") ?? "");
    const classId = String(formData.get("classId") ?? "");
    if (!String(formData.get("intakeAcademicYearId") ?? "")) {
      event.preventDefault();
      setActionError("Choose the academic year in which the learner joined the school.");
      setStep(1);
      return;
    }
    if ((placementTermId && !classId) || (classId && !placementTermId)) {
      event.preventDefault();
      setActionError("Choose both a placement term and intended class, or leave both unassigned.");
      setStep(1);
      return;
    }
    if (photoData.length > 800_000) {
      event.preventDefault();
      setActionError("The captured student portrait is too large. Please capture it again.");
      setStep(3);
      return;
    }
    setActionError("");
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
                <h2 id="add-student-title">Create a learner record</h2>
                <p>Record when the learner joined, propose a term placement and capture a live portrait. The class becomes live only after enrolment confirmation.</p>
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

            {actionError ? <div className="dialog-callout" role="alert"><span className="callout-icon">!</span><div><strong>Student was not created</strong><p>{actionError}</p><button type="button" className="text-link" onClick={() => setActionError("")}>Dismiss</button></div></div> : null}

            <form action={formAction} onSubmit={prepareSubmit} className="student-dialog-form">
              <div className="student-dialog-body">
                <div className="dialog-panel" hidden={step !== 0} aria-hidden={step !== 0}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 1</span><h3>Start with the learner</h3><p>Enter the essentials that identify this student throughout SukuuNova.</p></div><span className="panel-badge">Required</span></div>
                  <div className="dialog-grid two"><Field label="Full name" required><input name="name" required autoFocus={step === 0} placeholder="e.g. Ama Mensah" /></Field><Field label="Date of birth"><input name="dob" type="date" /></Field></div>
                  <div className="dialog-info-card"><strong>Automatic Index Number</strong><span>The system creates the unique learner identifier after saving. Staff never type or edit it.</span><b>SN-{new Date().getFullYear()}-••••••</b></div>
                </div>

                <div className="dialog-panel" hidden={step !== 1} aria-hidden={step !== 1}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 2</span><h3>Record intake and proposed placement</h3><p>Intake records when the learner joined the school. Placement is a draft enrolment until admission checks are confirmed.</p></div><span className="panel-badge">Academic</span></div>
                  <div className="dialog-grid two">
                    <Field label="Academic year joined" required hint="Previous configured years are available for learners who joined before SukuuNova."><select name="intakeAcademicYearId" defaultValue={defaultAcademicYearId} required><option value="" disabled>Choose academic year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " · current" : ""}</option>)}</select></Field>
                    <Field label="Admission date" hint="The actual date the learner entered this school."><input name="admissionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                    <Field label="Placement term" hint="Choose the term this intended class belongs to. Locked terms cannot accept new placements."><select name="placementTermId" defaultValue={defaultPlacementTermId}><option value="">Leave placement pending</option>{terms.map((term) => <option key={term.id} value={term.id} disabled={term.isLocked}>{term.academicYearName} · {term.name}{term.isCurrent ? " · current" : ""}{term.isLocked ? " · locked" : ""}</option>)}</select></Field>
                    <Field label="Intended class group" hint="This creates a draft enrolment; it does not change the live class yet."><select name="classId" defaultValue=""><option value="">Leave unassigned</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name} · {schoolClass._count.students} live learners</option>)}</select></Field>
                    <Field label="Entry type"><select name="entryType" defaultValue="New enrollment"><option>New enrollment</option><option>Transfer in</option><option>Re-enrollment</option><option>Returning learner</option></select></Field>
                  </div>
                  <div className="dialog-info-card subtle"><strong>History stays truthful</strong><span>Draft placement is reviewed in Admissions. Only a confirmed enrolment for the active term changes the learner&apos;s operational class.</span></div>
                </div>

                <div className="dialog-panel" hidden={step !== 2} aria-hidden={step !== 2}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 3</span><h3>Connect the family</h3><p>Add the primary contact that should receive school communication and be connected to the learner.</p></div><span className="panel-badge">Recommended</span></div>
                  <div className="dialog-grid two"><Field label="Primary parent / guardian"><input name="guardianName" placeholder="e.g. Akosua Mensah" /></Field><Field label="Phone / WhatsApp"><input name="guardianPhone" inputMode="tel" placeholder="024 000 0000" /></Field><Field label="Relationship"><select name="guardianRelationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></Field></div>
                  <div className="dialog-callout"><span className="callout-icon">◎</span><div><strong>One family record can serve more than one learner</strong><p>Once the guardian exists, it can later be linked to siblings and used for attendance alerts, receipts, messages and parent access.</p></div></div>
                </div>

                <div className="dialog-panel" hidden={step !== 3} aria-hidden={step !== 3}>
                  <div className="dialog-panel-heading"><div><span className="eyebrow">Step 4</span><h3>Capture the learner&apos;s face</h3><p>Use the live camera. SukuuNova will guide the face into position and capture a clear portrait for the learner record.</p></div><span className="panel-badge">Live camera</span></div>
                  <div className="photo-review-layout">
                    <StudentPhotoCapture />
                    <div className="review-summary">
                      <div className="review-title">Creation summary</div>
                      <div className="review-row"><span>Learner</span><b>Identity information</b></div>
                      <div className="review-row"><span>Index</span><b>Generated automatically</b></div>
                      <div className="review-row"><span>Intake</span><b>Academic year + admission date</b></div>
                      <div className="review-row"><span>Class</span><b>Draft term enrolment until confirmed</b></div>
                      <div className="review-row"><span>Family</span><b>Primary guardian</b></div>
                      <div className="review-row"><span>Portrait</span><b>Live camera capture</b></div>
                      <div className="review-security"><strong>Biometric safety</strong><span>The registration portrait can support later device enrollment, but biometric face templates still require the existing consent and device-enrollment controls.</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <footer className="student-dialog-footer">
                <div className="dialog-footer-note"><span className="secure-dot" />Secure school record</div>
                <div className="dialog-footer-actions">
                  <button type="button" className="button secondary" onClick={() => step === 0 ? closeDialog() : setStep((value) => value - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
                  {step < steps.length - 1 ? <button type="button" className="button primary" onClick={() => { setActionError(""); setStep((value) => value + 1); }}>Continue <span>→</span></button> : <OptimisticSubmitButton className="button primary" pendingLabel="Creating student…">Create student &amp; generate index <span>→</span></OptimisticSubmitButton>}
                </div>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
