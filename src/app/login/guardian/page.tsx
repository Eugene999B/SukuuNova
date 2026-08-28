"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import "../login.css";

export default function GuardianLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/guardian/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schoolCode: data.get("schoolCode"), identifier: data.get("identifier"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message || "Invalid guardian credentials."); return; }
      router.push("/guardian"); router.refresh();
    } catch { setError("Unable to reach SukuuNova right now. Please try again."); }
    finally { setPending(false); }
  }
  return <main className="auth-shell">
    <section className="auth-visual">
      <div className="auth-orbit" /><div className="auth-grid" />
      <div className="auth-preview"><div className="auth-preview-top"><span>SukuuNova · Family portal</span><span>Secure</span></div><div className="auth-preview-main">Everything about your children, together.</div><div className="auth-preview-kpis"><div className="auth-preview-kpi"><b>Attendance</b><span>Daily visibility</span></div><div className="auth-preview-kpi"><b>Results</b><span>Progress & reports</span></div><div className="auth-preview-kpi"><b>Fees</b><span>Balances & receipts</span></div><div className="auth-preview-kpi"><b>Messages</b><span>School communication</span></div></div></div>
      <div className="auth-copy"><div className="auth-kicker"><span className="auth-dot" /> Family-first school access</div><h2>Stay close to <span>every learner.</span></h2><p>Your school can connect one guardian account to one or several children. You only see the learners that belong to your family profile.</p><div className="auth-feature-grid"><div className="auth-feature"><strong>◎ Children</strong><span>Switch between connected children without separate logins.</span></div><div className="auth-feature"><strong>✓ Progress</strong><span>Attendance, grades, assignments and report cards.</span></div><div className="auth-feature"><strong>₵ School finance</strong><span>Fees, balances, receipts and payment notices.</span></div></div></div>
    </section>
    <section className="auth-form-pane"><div className="auth-panel"><Link href="/" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Guardian portal</small></span></Link><div className="auth-context">◎ Guardian access</div><div className="auth-heading"><h1>Welcome back.</h1><p>Sign in with the phone number or email your school used for your guardian account.</p></div>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" name="schoolCode" autoComplete="organization" placeholder="e.g. TEST001" required /></div>
        <div className="auth-field"><label htmlFor="identifier">Phone or email</label><input id="identifier" name="identifier" autoComplete="username" placeholder="024... or name@email.com" required /></div>
        <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/guardian/password-reset">Forgot password?</Link></label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="auth-submit" disabled={pending} type="submit">{pending ? "Opening family portal…" : "Enter guardian portal"}<span>→</span></button>
      </form>
      <div className="auth-divider">School access</div><div className="auth-secondary"><Link href="/login/school">School login</Link><Link href="/">Back to SukuuNova</Link></div>
      <div className="auth-foot">Your guardian account is limited to children your school has explicitly connected to you.</div>
    </div></section>
  </main>;
}
