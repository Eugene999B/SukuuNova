"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

type Teacher = { id: string; name: string };
type SchoolClass = { id: string; name: string; level: string | null };

export function SubjectCreateDialog({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="subjects-primary" onClick={() => setOpen(true)}>+ Add subject</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add subject" description="Create a catalogue entry, then assign it to classes and teachers." size="sm">
      <form action={action} className="subject-dialog-form">
        <label><span>Subject name</span><input name="name" required placeholder="e.g. Mathematics" autoFocus /></label>
        <div className="subject-dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="subjects-primary">Create</button></div>
      </form>
    </Dialog>
  </>;
}

export function SubjectAssignDialog({ subjectId, subjectName, teachers, classes, action }: { subjectId: string; subjectName: string; teachers: Teacher[]; classes: SchoolClass[]; action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="subjects-primary wide" onClick={() => setOpen(true)}>Assign teacher</button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Assign ${subjectName}`} description="Choose the teacher and the classes they deliver." size="md">
      <form action={action} className="subject-dialog-form">
        <input type="hidden" name="subjectId" value={subjectId} />
        <label><span>Teacher</span><select name="teacherId" required defaultValue=""><option value="">Choose teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
        <label><span>Classes</span><select name="classIds" multiple required size={Math.min(8, Math.max(4, classes.length))}>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.level ? `${schoolClass.level} · ` : ""}{schoolClass.name}</option>)}</select></label>
        <div className="subject-dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="subjects-primary">Assign teacher</button></div>
      </form>
    </Dialog>
  </>;
}
