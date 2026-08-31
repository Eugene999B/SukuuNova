"use client";

import Link from "next/link";
import { MailCheck, ArrowLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import "../platform-auth.css";

type ResetResult = { message?: string; error?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ResetResult | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const response = await fetch("/api/auth/platform/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "request", email }) });
      const data = (await response.json()) as ResetResult;
      setResult(data);
    } catch {
      setResult({ error: "Unable to reach SukuuNova right now. Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="platform-auth-shell">
      <section className="platform-auth-card">
        <div className="platform-auth-brand"><span><ShieldCheck size={20} aria-hidden="true" /></span><div><strong>SukuuNova</strong><small>Platform command center</small></div></div>
        <div className="platform-auth-kicker"><MailCheck size={14} aria-hidden="true" /> Secure recovery</div>
        <h1>Password recovery</h1>
        <p>Enter the administrator email. If the account is active, reset instructions are delivered out-of-band. The recovery token is never displayed here.</p>
        <label className="platform-auth-field"><span>Administrator email</span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="administrator@example.com" type="email" autoComplete="email" /></label>
        <button className="platform-auth-submit" disabled={pending} onClick={submit}><MailCheck size={16} aria-hidden="true" /> {pending ? "Sending…" : "Request reset"}</button>
        {result ? <p className="platform-auth-message" role="status">{result.message || result.error}</p> : null}
        <Link href="/login/platform" className="platform-auth-back"><ArrowLeft size={14} aria-hidden="true" /> Back to platform login</Link>
      </section>
    </main>
  );
}
