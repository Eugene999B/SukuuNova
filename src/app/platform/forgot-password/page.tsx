"use client";
import { useState } from "react";
import Link from "next/link";

type ResetResult = { message?: string; error?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ResetResult | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/auth/platform/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "request", email })
      });
      const data = (await response.json()) as ResetResult;
      setResult(data);
    } catch {
      setResult({ error: "Unable to reach SukuuNova right now. Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#071017", color: "#eaf6f3" }}>
      <section className="app-card app-panel" style={{ maxWidth: 520, width: "100%" }}>
        <p className="app-kpi-label">SukuuNova Platform Control</p>
        <h1>Password recovery</h1>
        <p>Enter your administrator email. If the account is active, a reset link will be sent to it. Reset requests are audited.</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Administrator email"
          style={{ width: "100%", margin: "14px 0", padding: 12 }}
        />
        <button className="app-action" disabled={pending} onClick={submit}>
          <strong>{pending ? "Sending…" : "Request reset"}</strong>
        </button>
        {result && (
          <div className="app-banner" style={{ marginTop: 14 }}>
            <p>{result.message || result.error}</p>
          </div>
        )}
        <Link href="/login/platform" className="app-pill">
          Back to platform login
        </Link>
      </section>
    </main>
  );
}
