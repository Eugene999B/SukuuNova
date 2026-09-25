"use client";
import { useState } from "react";

type Option = { id: string; name: string };
export function ReportContextPicker({ years, terms, classes, yearId, termId, classId }: {
  years: Option[]; terms: (Option & { academicYearId: string })[]; classes: Option[];
  yearId: string; termId: string; classId: string;
}) {
  const [year, setYear] = useState(yearId);
  const [term, setTerm] = useState(termId);
  const [classValue, setClass] = useState(classId);
  const [opening, setOpening] = useState(false);
  const availableTerms = terms.filter(row => row.academicYearId === year);
  return <form method="get" action="/school/report-cards" onSubmit={()=>setOpening(true)}>
    <div>
      <label>Academic year<select name="year" value={year} onChange={event=>{setYear(event.target.value);setTerm("");}} required><option value="">Choose year</option>{years.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Term<select name="term" value={term} onChange={event=>setTerm(event.target.value)} required><option value="">Choose term</option>{availableTerms.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Class<select name="classId" value={classValue} onChange={event=>setClass(event.target.value)} required><option value="">Choose class</option>{classes.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    </div>
    <button className="report-action primary" type="submit" disabled={opening || !year || !term || !classValue}>{opening ? "Opening class…" : "Open class reports"}</button>
  </form>;
}
