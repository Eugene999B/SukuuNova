"use client";

import Link from "next/link";

export function LetterActions({ id }: { id: string }) {
  return (
    <div className="admission-letter-actions">
      <button className="button primary" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
      <Link className="button secondary" href={`/api/school/admissions/applications/${id}/letter?format=pdf`}>Download PDF</Link>
      <Link className="button secondary" href={`/api/school/admissions/applications/${id}/letter?format=word`}>Download Word</Link>
    </div>
  );
}
