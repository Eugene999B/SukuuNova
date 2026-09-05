"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

type StudentOption = { id: string; name: string; admissionNo: string; className: string | null; guardianCount: number };

const MAX_GUARDIANS_PER_STUDENT = 2;

export function AddGuardianDialog(props: {
  students: StudentOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const availableStudents = useMemo(() => props.students.filter((s) => s.guardianCount < MAX_GUARDIANS_PER_STUDENT), [props.students]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? availableStudents.filter((s) => s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q))
      : availableStudents;
    return list.slice(0, 30);
  }, [availableStudents, query]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      await props.action(formData);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save guardian. Nothing was lost.");
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="button primary" onClick={() => { setOpen(true); setError(null); setStudentId(""); }}>
        + Add guardian
      </button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} title="Add guardian" description="Student → details → relationship → portal → confirmation. Uses the real school directory — no demo records.">
        <form action={onSubmit} className="product-form-section">
          <div className="product-field">
            <span>1 · Find student (fast search)</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type name or index number…" aria-label="Search students" autoComplete="off" />
            <small>{availableStudents.length} learners available · {props.students.length - availableStudents.length} already have two guardian portal accounts.</small>
          </div>
          <div className="product-field">
            <span>Student</span>
            <select name="studentIds" value={studentId} onChange={(e) => setStudentId(e.target.value)} required aria-label="Select student">
              <option value="">Choose a learner…</option>
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.className ?? "Unassigned"} · {s.guardianCount} guardian{s.guardianCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            {filtered.length === 0 ? <small>No eligible learners match this search.</small> : null}
          </div>
          <>
            <div className="product-field">
              <span>2 · Guardian details</span>
              <input name="name" placeholder="Full name, e.g. Akosua Mensah" required maxLength={120} aria-label="Guardian full name" />
              <small>Family contact name as it should appear on messages and reports.</small>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <label className="product-field">
                <span>Phone / WhatsApp</span>
                <input name="phone" inputMode="tel" placeholder="024 000 0000" required aria-label="Guardian phone" />
              </label>
              <label className="product-field">
                <span>Email (optional)</span>
                <input name="email" type="email" placeholder="guardian@example.com" aria-label="Guardian email" />
              </label>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <label className="product-field">
                <span>3 · Relationship</span>
                <select name="relationship" defaultValue="Parent">
                  <option>Parent</option>
                  <option>Mother</option>
                  <option>Father</option>
                  <option>Guardian</option>
                  <option>Other</option>
                </select>
              </label>
              <div className="product-field">
                <span>4 · Portal</span>
                <small>A pending portal login is created automatically. A learner may have at most two linked guardian portal accounts.</small>
              </div>
            </div>
          </>
          {error ? (
            <div className="product-state product-state-error" role="alert">
              <h3>Could not save guardian</h3>
              <p>{error}</p>
            </div>
          ) : null}
          <div className="product-sticky-actions">
            <button type="button" className="button secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={pending || !studentId} aria-busy={pending}>
              {pending ? "Saving…" : "5 · Confirm & link guardian"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
