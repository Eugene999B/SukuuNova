"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = { universe: "school" } | { universe: "platform" };
type SchoolStage = "school" | "role" | "credentials";
type SchoolRole = "staff" | "guardian";

function isFinanceRole(roles: unknown[]) {
  const normalized = roles.map((role) => String(role).toLowerCase());
  return normalized.some((role) => role.includes("accountant") || role.includes("bursar") || role === "finance officer" || role === "cashier" || role === "finance clerk");
}

function isPayrollRole(roles: unknown[]) {
  const normalized = roles.map((role) => String(role).toLowerCase());
  return normalized.some((role) => role.includes("payroll officer") || role.includes("hr manager") || role.includes("hr officer"));
}

export function LoginForm(props: Props) {
  const router = useRouter();
  const [schoolStage, setSchoolStage] = useState<SchoolStage>(props.universe === "school" ? "school" : "credentials");
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolRole, setSchoolRole] = useState<SchoolRole | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const platformEmail = String(data.get("email") ?? "").trim();
    try {
      const endpoint = props.universe === "school" && schoolRole === "guardian" ? "/api/auth/guardian/login" : `/api/auth/${props.universe}/login`;
      const body = props.universe === "school" ? (schoolRole === "guardian" ? { schoolCode, identifier, password } : { uniqueCode: schoolCode, identifier, password }) : { email: platformEmail, password };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.message || "Login failed. Please check your details and try again."); return; }
      if (props.universe === "school" && schoolRole === "guardian") router.push("/guardian");
      else if (props.universe === "school" && result.user?.needsPasswordChange) router.push("/account/security?required=1");
      else if (props.universe === "school" && result.user?.portal === "teacher") router.push("/teacher");
      else {
        const roles = Array.isArray(result.user?.roles) ? result.user.roles : [];
        const defaultDestination = isFinanceRole(roles) ? "/school/fees" : isPayrollRole(roles) ? "/school/fees/payroll" : "/dashboard";
        router.push(props.universe === "platform" ? "/platform" : defaultDestination);
      }
      router.refresh();
    } catch { setError("Unable to reach SukuuNova right now. Please try again."); }
    finally { setPending(false); }
  }

  if (props.universe === "school") {
    if (schoolStage === "school") return <form className="auth-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const code = String(form.get("schoolCode") ?? "").trim(); if (!code) { setError("Enter your school code to continue."); return; } setSchoolCode(code.toUpperCase()); setError(""); setSchoolStage("role"); }}>
      <div className="auth-stepper"><span className="is-active">1</span><i /><span>2</span><i /><span>3</span></div>
      <div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" name="schoolCode" autoComplete="organization" placeholder="e.g. TEST001" autoFocus required /></div>
      <p className="auth-help-text">Your school code identifies your school workspace. Your access type and credentials come next.</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="auth-submit" type="submit">Continue <span>→</span></button>
    </form>;
    if (schoolStage === "role") return <div className="auth-form">
      <div className="auth-stepper"><span className="is-complete">✓</span><i className="is-complete" /><span className="is-active">2</span><i /><span>3</span></div>
      <div className="auth-school-chip"><span>School</span><strong>{schoolCode}</strong><button type="button" onClick={() => setSchoolStage("school")} aria-label="Change school code">Change</button></div>
      <div className="auth-role-heading"><span className="auth-context">Choose your access</span><h2>How are you signing in?</h2><p>Select the account type provided by your school.</p></div>
      <div className="auth-role-grid">
        <button type="button" className="auth-role-card" onClick={() => { setSchoolRole("staff"); setSchoolStage("credentials"); }}><span className="auth-role-icon">♙</span><strong>Staff</strong><small>Teachers, leadership, finance, administration and other school employees.</small><em>Continue as Staff →</em></button>
        <button type="button" className="auth-role-card" onClick={() => { setSchoolRole("guardian"); setSchoolStage("credentials"); }}><span className="auth-role-icon">♧</span><strong>Guardian</strong><small>Parents and guardians who monitor only children connected to their family account.</small><em>Continue as Guardian →</em></button>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>;
    return <form className="auth-form" onSubmit={submit}>
      <div className="auth-stepper"><span className="is-complete">✓</span><i className="is-complete" /><span className="is-complete">✓</span><i className="is-complete" /><span className="is-active">3</span></div>
      <div className="auth-school-chip"><span>{schoolRole === "guardian" ? "Guardian" : "Staff"}</span><strong>{schoolCode}</strong><button type="button" onClick={() => setSchoolStage("role")} aria-label="Change access type">Change</button></div>
      <div className="auth-field"><label htmlFor="identifier">Email or phone</label><input id="identifier" name="identifier" autoComplete="username" placeholder="name@school.com or 024..." autoFocus required /></div>
      <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/school/password-reset">Forgot password?</Link></label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : schoolRole === "guardian" ? "Open guardian portal" : "Enter school workspace"}{!pending ? <span>→</span> : null}</button>
      <Link href="/login/school/password-reset" className="auth-safety-link">Need help resetting access?</Link>
    </form>;
  }
  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-field"><label htmlFor="email">Administrator email</label><input id="email" name="email" type="email" autoComplete="username" placeholder="admin@company.com" required /></div>
    <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/platform/password-reset">Forgot password?</Link></label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : "Enter platform control"}{!pending ? <span>→</span> : null}</button>
  </form>;
}
