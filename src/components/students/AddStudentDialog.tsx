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
  { key: "student", title: "Student & class", hint: "Essential details and immediate class placement" },
  { key: "family", title: "Guardian", hint: "Primary parent or guardian contact" },
  { key: "photo", title: "Photo & save", hint: "Verified portrait and registration" },
] as const;

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return <label className="student-dialog-field"><span>{label}{required ? <em> *</em> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export function AddStudentDialog({ classes, academicYears, terms, action, triggerLabel = "+ Add student", initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);
  const [actionError, setActionError] = useState("");
  const [actionState, formAction] = useActionState(action, { message: null });
  const currentAcademicYear = academicYears.find((year) => year.isCurrent) ?? academicYears[0] ?? null;
  const currentTerm = terms.find((term) => term.isCurrent && !term.isLocked) ?? terms.find((term) => !term.isLocked) ?? null;
  const setupReady = Boolean(currentAcademicYear && currentTerm && classes.length);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => { setOpen(initialOpen); }, [initialOpen]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { if (actionState.message) setActionError(actionState.message); }, [actionState.message]);

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

  function nextStep(form: HTMLFormElement | null) {
    if (step === 0 && form) {
      const formData = new FormData(form);
      if (!String(formData.get("name") ?? "").trim()) return setActionError("Enter the student's full name.");
      if (!String(formData.get("classId") ?? "").trim()) return setActionError("Choose the student's class. Registration will place the student there immediately.");
    }
    setActionError("");
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  function prepareSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const photoData = String(formData.get("photoData") ?? "");
    const guardianName = String(formData.get("guardianName") ?? "").trim();
    const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
    if (!setupReady || !String(formData.get("intakeAcademicYearId") ?? "") || !String(formData.get("placementTermId") ?? "")) {
      event.preventDefault();
      setActionError("Set up a current academic year, an open term and at least one class before registering students.");
      setStep(0);
      return;
    }
    if (!String(formData.get("classId") ?? "")) {
      event.preventDefault();
      setActionError("Choose the student's class.");
      setStep(0);
      return;
    }
    if ((guardianName && !guardianPhone) || (guardianPhone && !guardianName)) {
      event.preventDefault();
      setActionError("Enter both guardian name and phone number, or leave both blank.");
      setStep(1);
      return;
    }
    if (photoData.length > 800_000) {
      event.preventDefault();
      setActionError("The captured student portrait is too large. Capture it again.");
      setStep(2);
      return;
    }
    setActionError("");
  }

  return <>
    <button type="button" className="button primary" onClick={openDialog}>{triggerLabel}</button>
    <noscript><Link href="/school/students/create" className="button primary">{triggerLabel}</Link></noscript>
    {open ? <div className="student-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="student-dialog" role="dialog" aria-modal="true" aria-labelledby="add-student-title">
        <header className="student-dialog-header">
          <div><div className="eyebrow">Student registration</div><h2 id="add-student-title">Register a student once</h2><p>Choose the student&apos;s class, add the family contact and capture the portrait. Saving completes registration and class placement immediately—there is no second enrolment step.</p></div>
          <Tooltip label="Close student registration"><button type="button" className="dialog-close" onClick={closeDialog} aria-label="Close">×</button></Tooltip>
        </header>

        <div className="student-dialog-progress" aria-label="Student registration steps">{steps.map((item, index) => <div key={item.key} className={`dialog-step ${index === step ? "active" : ""} ${index < step ? "complete" : ""}`}><span>{index < step ? "✓" : index + 1}</span><div><strong>{item.title}</strong><small>{item.hint}</small></div></div>)}</div>

        {!setupReady ? <div className="dialog-callout" role="alert"><span className="callout-icon">!</span><div><strong>Academic setup is incomplete</strong><p>You need a current academic year, an open term and at least one class. Once those exist, routine student registration will use them automatically.</p><Link href="/school/academics/setup" className="text-link">Open Academic Setup</Link></div></div> : null}
        {actionError ? <div className="dialog-callout" role="alert"><span className="callout-icon">!</span><div><strong>Check this registration</strong><p>{actionError}</p><button type="button" className="text-link" onClick={() => setActionError("")}>Dismiss</button></div></div> : null}

        <form action={formAction} onSubmit={prepareSubmit} className="student-dialog-form">
          <input type="hidden" name="intakeAcademicYearId" value={currentAcademicYear?.id ?? ""} />
          <input type="hidden" name="placementTermId" value={currentTerm?.id ?? ""} />
          <input type="hidden" name="admissionDate" value={today} />
          <input type="hidden" name="entryType" value="New enrollment" />

          <div className="student-dialog-body">
            <div className="dialog-panel" hidden={step !== 0} aria-hidden={step !== 0}>
              <div className="dialog-panel-heading"><div><span className="eyebrow">Step 1</span><h3>Who is the student and which class?</h3><p>These are the only academic choices needed during normal registration.</p></div><span className="panel-badge">Required</span></div>
              <div className="dialog-grid two">
                <Field label="Full name" required><input name="name" required autoFocus={step === 0} placeholder="e.g. Ama Mensah" /></Field>
                <Field label="Date of birth"><input name="dob" type="date" /></Field>
                <Field label="Class" required hint="The student becomes a live member of this class immediately after saving."><select name="classId" defaultValue="" required><option value="" disabled>Choose class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name} · {schoolClass._count.students} students</option>)}</select></Field>
              </div>
              <div className="dialog-info-card"><strong>Everything else is automatic</strong><span>Index number, current academic year, current term, admission date and enrolment record are created automatically.</span><b>{currentAcademicYear?.name ?? "Academic year needed"}{currentTerm ? ` · ${currentTerm.name}` : ""}</b></div>
            </div>

            <div className="dialog-panel" hidden={step !== 1} aria-hidden={step !== 1}>
              <div className="dialog-panel-heading"><div><span className="eyebrow">Step 2</span><h3>Parent or guardian</h3><p>Add the main family contact. You can leave this blank and update the student later.</p></div><span className="panel-badge">Optional</span></div>
              <div className="dialog-grid two">
                <Field label="Primary parent / guardian"><input name="guardianName" placeholder="e.g. Akosua Mensah" /></Field>
                <Field label="Phone / WhatsApp"><input name="guardianPhone" inputMode="tel" placeholder="024 000 0000" /></Field>
                <Field label="Relationship"><select name="guardianRelationship" defaultValue="Parent"><option>Parent</option><option>Mother</option><option>Father</option><option>Guardian</option><option>Other</option></select></Field>
              </div>
              <div className="dialog-callout"><span className="callout-icon">◎</span><div><strong>Sibling-friendly family records</strong><p>If the same phone number already belongs to a guardian, SukuuNova reuses that family record instead of creating a duplicate.</p></div></div>
            </div>

            <div className="dialog-panel" hidden={step !== 2} aria-hidden={step !== 2}>
              <div className="dialog-panel-heading"><div><span className="eyebrow">Step 3</span><h3>Capture photo and save</h3><p>The camera verifies continuously and captures automatically when a frame passes the server checks.</p></div><span className="panel-badge">Final</span></div>
              <div className="photo-review-layout">
                <StudentPhotoCapture />
                <div className="review-summary">
                  <div className="review-title">What happens when you save</div>
                  <div className="review-row"><span>Student</span><b>Created once</b></div>
                  <div className="review-row"><span>Index</span><b>Generated automatically</b></div>
                  <div className="review-row"><span>Class</span><b>Active immediately</b></div>
                  <div className="review-row"><span>Term</span><b>{currentTerm?.name ?? "Current term"}</b></div>
                  <div className="review-row"><span>Enrolment</span><b>Completed automatically</b></div>
                  <div className="review-security"><strong>No duplicate workflow</strong><span>After this form saves, you do not need to visit Admissions/Enrolment to activate the student.</span></div>
                </div>
              </div>
            </div>
          </div>

          <footer className="student-dialog-footer">
            <div className="dialog-footer-note"><span className="secure-dot" />Fast registration</div>
            <div className="dialog-footer-actions">
              <button type="button" className="button secondary" onClick={() => step === 0 ? closeDialog() : setStep((value) => value - 1)}>{step === 0 ? "Cancel" : "Back"}</button>
              {step < steps.length - 1 ? <button type="button" className="button primary" disabled={!setupReady} onClick={(event) => nextStep(event.currentTarget.form)}>{step === 0 ? "Continue" : "Continue to photo"} <span>→</span></button> : <OptimisticSubmitButton className="button primary" pendingLabel="Registering student…" disabled={!setupReady}>Register student <span>→</span></OptimisticSubmitButton>}
            </div>
          </footer>
        </form>
      </section>
    </div> : null}
  </>;
}
