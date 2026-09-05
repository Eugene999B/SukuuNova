"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function TimetableError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Timetable workspace failed", { message: error.message, digest: error.digest });
  }, [error]);
  const isConfig = /timetable|period|break|time/i.test(error.message);
  return (
    <div className="product-workspace">
      <div className="product-state product-state-error" role="alert">
        <h3>{isConfig ? "Timetable setup needs attention" : "Timetable could not be loaded"}</h3>
        <p>
          {isConfig
            ? "The school's timetable configuration is incomplete or has an invalid time. An administrator should review Academic Setup → timetable days, periods and breaks, then try again."
            : "Something went wrong loading the timetable. Your data is safe — try again, and if it persists contact support with the reference below."}
        </p>
        {error.digest ? <p style={{ fontSize: 12 }}>Reference: {error.digest}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="button primary" onClick={reset}>
            Try again
          </button>
          <Link className="button secondary" href="/school/academics/setup">
            Open academic setup
          </Link>
        </div>
      </div>
    </div>
  );
}
