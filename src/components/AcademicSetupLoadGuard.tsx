"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AcademicSetupConsole } from "@/components/AcademicSetupConsole";

export function AcademicSetupLoadGuard() {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTimedOut(false);
    const timer = window.setTimeout(() => {
      const loaded = Boolean(hostRef.current?.querySelector(".academic-setup-shell"));
      if (!loaded) setTimedOut(true);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  if (timedOut) return <section className="academic-empty">
    <strong>Academic Setup did not load.</strong>
    <p>The academic setup request did not finish successfully. Check the connection and retry; no academic settings were changed.</p>
    <div className="academic-empty-actions">
      <button type="button" className="academic-btn-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15}/> Retry Academic Setup</button>
    </div>
  </section>;

  return <div ref={hostRef}><AcademicSetupConsole key={attempt} /></div>;
}