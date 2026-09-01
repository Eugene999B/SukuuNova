"use client";

import Link from "next/link";
import { Eye, EyeOff, HeartHandshake, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import "../login.css";

export default function GuardianLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/guardian/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schoolCode: data.get("schoolCode"), identifier: data.get("identifier"), password: data.get("password") }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message || "The email or password is incorrect."); return; }
      router.push("/guardian"); router.refresh();
    } catch { setError("Unable to reach SukuuNova right now. Please try again."); }
    finally { setPending(false); }
  }
  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="auth-copy">
          <div className="auth-kicker"><span className="auth-dot" /> Family access</div>
          <h2>Stay close to <span>every learner.</span></h2>
          <p>See attendance, progress, fees, messages and school events for the children connected to your family account.</p>
          <div className="auth-feature-grid">
            <div className="auth-feature"><strong><HeartHandshake size={14} aria-hidden="true" /> One family account</strong><span>Move between connected children without separate logins.</span></div>
            <div className="auth-feature"><strong>Private by design</strong><span>You only see records your school has explicitly connected to you.</span></div>
          </div>
        </div>
      </section>
      <section className="auth-form-pane">
        <div className="auth-panel">
          <Link href="/" className="auth-brand" aria-label="SukuuNova home"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Guardian portal</small></span></Link>
          <div className="auth-context"><HeartHandshake size={12} aria-hidden="true" /> Guardian access</div>
          <div className="auth-heading"><h1>Welcome back</h1><p>Sign in with the phone number or email your school used for your guardian account.</p></div>
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" name="schoolCode" autoComplete="organization" placeholder="e.g. TEST001" required /></div>
            <div className="auth-field"><label htmlFor="identifier">Phone or email</label><div className="auth-input-with-icon"><Mail size={16} aria-hidden="true" /><input id="identifier" name="identifier" autoComplete="username" placeholder="024… or name@email.com" required /></div></div>
            <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/guardian/password-reset">Forgot password?</Link></label><div className="auth-input-with-icon"><LockKeyhole size={16} aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : "Sign in"}{!pending ? <span>→</span> : null}</button>
          </form>
          <div className="auth-divider">Other access</div>
          <div className="auth-secondary"><Link href="/login/school">School login</Link><Link href="/">Back to SukuuNova</Link></div>
          <p className="auth-foot">Need help? <Link href="/contact">Contact support</Link>.</p>
        </div>
      </section>
    </main>
  );
}
