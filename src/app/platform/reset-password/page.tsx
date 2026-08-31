"use client";

import Link from "next/link";
import { KeyRound, LockKeyhole } from "lucide-react";
import { useState } from "react";
import "../../login/login.css";
import "../../platform-auth.css";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  return (
    <main className="platform-auth-shell">
      <section className="platform-auth-card">
        <div className="platform-auth-brand"><span><KeyRound size={20} aria-hidden="true" /></span><div><strong>SukuuNova</strong><small>Platform command center</small></div></div>
        <div className="platform-auth-kicker"><LockKeyhole size={14} aria-hidden="true" /> Secure password recovery</div>
        <h1>Set a new password</h1>
        <p>Use the one-time recovery token from your password-reset message. The token is never displayed by the recovery request screen.</p>
        <label className="platform-auth-field"><span>Recovery token</span><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your recovery token" autoComplete="one-time-code" /></label>
        <label className="platform-auth-field"><span>New password</span><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="At least 12 characters" autoComplete="new-password" /></label>
        <button className="platform-auth-submit" onClick={async () => { const r = await fetch("/api/auth/platform/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "confirm", token, newPassword: pw }) }); const d = await r.json() as { message?: string; error?: string }; setMsg(d.message || d.error || "Request failed"); }}>
          <LockKeyhole size={16} aria-hidden="true" /> Reset password
        </button>
        {msg ? <p className="platform-auth-message" role="status">{msg}</p> : null}
        <Link href="/login/platform" className="platform-auth-back">Back to platform login</Link>
      </section>
    </main>
  );
}
