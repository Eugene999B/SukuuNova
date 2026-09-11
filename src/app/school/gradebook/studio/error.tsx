"use client";

import Link from "next/link";
import { useEffect } from "react";
import "../../academic-workspace.css";

export default function GradebookStudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("SukuuNova mark sheet render error", error);
  }, [error]);

  return (
    <main className="academic-page">
      <section className="academic-empty" role="alert">
        <strong>The mark sheet could not be opened safely.</strong>
        <p>No marks were changed. Retry the page first. If the problem remains, review the class assessment setup before opening this mark sheet again.</p>
        <div className="academic-empty-actions">
          <button className="academic-btn-primary" type="button" onClick={reset}>Retry mark sheet</button>
          <Link href="/school/gradebook">Back to Gradebook</Link>
          <Link href="/school/exams">Review assessments</Link>
        </div>
      </section>
    </main>
  );
}
