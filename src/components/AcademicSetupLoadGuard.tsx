"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AcademicSetupConsole } from "@/components/AcademicSetupConsole";

export function AcademicSetupLoadGuard() {
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    setChecking(true);
    setReady(false);
    setError("");

    fetch("/api/school/academic-engine", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.message || body?.error || "Academic Setup could not be loaded.");
        if (!body?.timetable || !Array.isArray(body.timetable.days) || !body?.assessment || !Array.isArray(body.assessment.categories)) {
          throw new Error("Academic Setup returned incomplete configuration. Retry, or review the school academic settings.");
        }
        setReady(true);
      })
      .catch((value) => {
        setError(value instanceof DOMException && value.name === "AbortError"
          ? "Academic Setup took too long to respond. Check the connection and retry."
          : value instanceof Error ? value.message : "Academic Setup could not be loaded.");
      })
      .finally(() => {
        window.clearTimeout(timer);
        setChecking(false);
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  if (checking) return <div className="academic-setup-loading">Loading your academic control centre…</div>;
  if (!ready) return <section className="academic-empty">
    <strong>Academic Setup did not load.</strong>
    <p>{error || "The setup service did not return a usable configuration."}</p>
    <div className="academic-empty-actions">
      <button type="button" className="academic-btn-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15}/> Retry Academic Setup</button>
    </div>
  </section>;

  return <AcademicSetupConsole key={attempt} />;
}
