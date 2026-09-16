"use client";

import Link from "next/link";
import { MailCheck, ArrowLeft, ShieldCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import "../../platform-auth.css";

type ResetResult = { message?: string; error?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [stage, setStage] = useState<"request" | "confirm">("request");
  const [result, setResult] = useState<ResetResult | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (stage === "confirm" && password !== confirmPassword) {
      setResult({ error: "New passwords do not match." });
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const response = await fetch("/api/auth/platform/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stage === "request"
          ? { mode: "request", email }
          : { mode: "confirm", email, token: code, newPassword: password })
      });
      const data = (await response.json()) as ResetResult;
      if (response.ok && stage === "request") setStage("confirm");
      setResult(data);
    } catch {
      setResult({ error: "Unable to reach SukuuNova right now. Please try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="platform-auth-shell">
      <section className="platform-auth-card" aria-labelledby="platform-reset-title">
        <Link href="/login/platform" className="platform-auth-brand"><span><ShieldCheck size={18} aria-hidden="true" /></span><div><strong>SukuuNova</strong><small>Platform command center</small></div></Link>
        <div className="platform-auth-kicker"><MailCheck size={14} aria-hidden="true" /> Administrator recovery</div>
        <h1 id="platform-reset-title">{stage === "request" ? "Password recovery" : "Enter verification code"}</h1>
        <p>{stage === "request" ? "Enter your administrator email. If the account is active, SukuuNova will send a 6-digit verification code valid for 10 minutes." : "Enter the 6-digit code sent to your administrator email and choose a new password."}</p>
        <label className="platform-auth-field"><span>Administrator email</span><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.example" type="email" autoComplete="email" readOnly={stage === "confirm"} /></label>
        {stage === "confirm" && <><label className="platform-auth-field"><span>6-digit verification code</span><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" /></label><label className="platform-auth-field"><span>New password</span><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="At least 12 characters" /></label><label className="platform-auth-field"><span>Confirm new password</span><input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="Repeat new password" /></label></>}
        <button className="platform-auth-submit" disabled={pending || !email.trim() || (stage === "confirm" && (code.length !== 6 || password.length < 12))} onClick={submit} type="button">{stage === "request" ? <MailCheck size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}{pending ? (stage === "request" ? "Sending…" : "Resetting…") : (stage === "request" ? "Send verification code" : "Verify & reset password")}</button>
        {result && <p className="platform-auth-message" role="status">{result.message || result.error}</p>}
        {stage === "confirm" && <button className="platform-auth-submit" disabled={pending} onClick={() => { setStage("request"); setCode(""); setResult(null); }} type="button">Use different email</button>}
        <Link href="/login/platform" className="platform-auth-back"><ArrowLeft size={14} aria-hidden="true" /> Back to platform login</Link>
      </section>
    </main>
  );
}
